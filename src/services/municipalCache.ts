/**
 * Cache local (IndexedDB) dos resultados municipais por UF.
 *
 * Ao reabrir um estado, os resultados salvos aparecem na hora e o carregador baixa apenas os
 * municípios cujo andamento mudou (carimbo do arquivo de andamento). Regras de integridade:
 *  - chave por eleição + código da eleição (turno) + UF: nunca mistura turnos;
 *  - versão do formato; registros de outra versão são descartados;
 *  - expira após `maxAgeDays` (padrão 7) e é limpo na inicialização;
 *  - guarda só o necessário (candidatos configurados), para caber no aparelho.
 * Sem IndexedDB (modo privado, navegador antigo), tudo segue funcionando sem cache.
 */
import type { ElectionConfig } from '../types/election';
import type { MunicipalEntry, MunicipalSnapshot } from './tse/municipal';

const DB_NAME = 'brasil-eleitoral';
const STORE = 'municipal';
const VERSION = 1;
const FORMAT = 1;

interface Stored {
  key: string;
  format: number;
  savedAt: number;
  snapshot: MunicipalSnapshot;
}

export function cacheKey(electionId: string, codigoEleicao: string, uf: string) {
  return `${electionId}:${codigoEleicao}:${uf.toLowerCase()}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Só para testes: esquece a conexão aberta. */
export function resetMunicipalCacheConnection() {
  dbPromise = null;
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Reduz o snapshot ao que a interface usa (candidatos configurados, sem textos extras). */
export function compactSnapshot(
  snap: MunicipalSnapshot,
  election: ElectionConfig,
): MunicipalSnapshot {
  const keep = new Set(election.candidates.map((c) => c.sqcand));
  const entries: Record<string, MunicipalEntry> = {};
  for (const [cod, e] of Object.entries(snap.entries)) {
    // Pendentes/indisponíveis não valem como cache: serão consultados de novo.
    if (!e.result || (e.status !== 'ok' && e.status !== 'stale')) continue;
    entries[cod] = {
      ...e,
      status: 'ok',
      message: undefined,
      result: {
        ...e.result,
        candidatos: e.result.candidatos.filter((c) => keep.has(c.sqcand)),
        issues: e.result.issues.filter((i) => i.severity === 'error'),
      },
      // Entrada "stale" volta sem carimbo: será consultada de novo no próximo ciclo.
      stamp: e.status === 'stale' ? null : e.stamp,
    };
  }
  return { ...snap, entries };
}

export async function saveMunicipalCache(
  snap: MunicipalSnapshot,
  election: ElectionConfig,
  now: number = Date.now(),
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const record: Stored = {
    key: cacheKey(snap.electionId, snap.codigoEleicao, snap.uf),
    format: FORMAT,
    savedAt: now,
    snapshot: compactSnapshot(snap, election),
  };
  await tx(db, 'readwrite', (s) => s.put(record));
}

export async function loadMunicipalCache(
  expected: { electionId: string; codigoEleicao: string; turno: number; uf: string },
  maxAgeDays: number,
  now: number = Date.now(),
): Promise<{ snapshot: MunicipalSnapshot; savedAt: number } | null> {
  const db = await openDb();
  if (!db) return null;
  const key = cacheKey(expected.electionId, expected.codigoEleicao, expected.uf);
  const rec = (await tx(db, 'readonly', (s) => s.get(key))) as Stored | undefined;
  if (!rec) return null;
  const snap = rec.snapshot;
  const valid =
    rec.format === FORMAT &&
    now - rec.savedAt <= maxAgeDays * 86_400_000 &&
    snap?.electionId === expected.electionId &&
    snap.codigoEleicao === expected.codigoEleicao &&
    snap.turno === expected.turno &&
    snap.uf === expected.uf.toLowerCase() &&
    typeof snap.entries === 'object';
  if (!valid) {
    await tx(db, 'readwrite', (s) => s.delete(key));
    return null;
  }
  return { snapshot: snap, savedAt: rec.savedAt };
}

/** Remove registros expirados ou de formato antigo. */
export async function pruneMunicipalCache(maxAgeDays: number, now: number = Date.now()) {
  const db = await openDb();
  if (!db) return;
  const all = ((await tx(db, 'readonly', (s) => s.getAll())) ?? []) as Stored[];
  for (const rec of all) {
    if (rec.format !== FORMAT || now - rec.savedAt > maxAgeDays * 86_400_000) {
      await tx(db, 'readwrite', (s) => s.delete(rec.key));
    }
  }
}

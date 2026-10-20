import type { ElectionSnapshot } from '../types/election';

const VERSION = 1;
const PREFIX = 'brasil-eleitoral:snapshot';

interface Stored {
  version: number;
  savedAt: string;
  snapshot: ElectionSnapshot;
}

export function storageKey(electionId: string, turno: number) {
  return `${PREFIX}:${electionId}:${turno}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: ElectionSnapshot) {
  const s = storage();
  if (!s) return;
  const data: Stored = { version: VERSION, savedAt: new Date().toISOString(), snapshot };
  try {
    s.setItem(storageKey(snapshot.electionId, snapshot.turno), JSON.stringify(data));
  } catch {
    // Quota excedida ou armazenamento bloqueado: a aplicação segue sem persistência.
  }
}

/**
 * Lê o último resultado válido salvo neste dispositivo.
 * Descarta dados de outro turno/eleição, de versão diferente ou mais antigos que `maxAgeDays`.
 */
export function loadSnapshot(
  electionId: string,
  turno: number,
  codigoEleicao: string,
  maxAgeDays: number,
  now: number = Date.now(),
): ElectionSnapshot | null {
  const s = storage();
  if (!s) return null;
  const key = storageKey(electionId, turno);
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Stored;
    const snap = data.snapshot;
    const age = now - Date.parse(snap?.fetchedAt ?? '');
    if (
      data.version !== VERSION ||
      !snap ||
      snap.electionId !== electionId ||
      snap.turno !== turno ||
      snap.codigoEleicao !== codigoEleicao ||
      !Number.isFinite(age) ||
      age > maxAgeDays * 86_400_000
    ) {
      s.removeItem(key);
      return null;
    }
    return snap;
  } catch {
    s.removeItem(key);
    return null;
  }
}

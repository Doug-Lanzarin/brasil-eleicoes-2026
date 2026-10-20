/**
 * Resultados de todos os municípios de uma UF (um arquivo oficial por município).
 *
 * Mesma estratégia do snapshot estadual:
 *  1. Baixa o andamento por município (`<uf>-e<ele>-ab.json`).
 *  2. Só baixa o arquivo de um município se o carimbo de andamento dele mudou.
 *  3. Falha num município preserva o último resultado válido dele ("stale").
 *  4. Arquivos de outro turno/eleição ou de outro município são rejeitados.
 */
import type { AreaResult, ElectionConfig, RoundConfig } from '../../types/election';
import { parseAbrangencia, parseResultado, type MunicipioInfo } from './adapter';
import { fetchTseJson } from './client';
import type { Priority, RequestLimiter } from './limiter';
import { describeError, TseError } from './errors';
import { abrangenciaUrl, resultUrl, type PathContext } from './paths';

/** `pending`: ainda não obtido neste ciclo (ex.: limite de requisições); tenta no próximo. */
export type MunicipalEntryStatus = 'ok' | 'stale' | 'unavailable' | 'invalid' | 'pending';

export interface MunicipalEntry extends MunicipioInfo {
  status: MunicipalEntryStatus;
  result: AreaResult | null;
  stamp: string | null;
  message?: string;
}

export interface MunicipalSnapshot {
  electionId: string;
  turno: 1 | 2;
  codigoEleicao: string;
  /** Sigla TSE da UF (minúsculas). */
  uf: string;
  /** Indexado pelo código TSE do município (5 dígitos). */
  entries: Record<string, MunicipalEntry>;
  fetchedAt: string;
}

export interface LoadMunicipalParams {
  base: string;
  election: ElectionConfig;
  round: RoundConfig;
  uf: string;
  municipios: MunicipioInfo[];
  previous: MunicipalSnapshot | null | undefined;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  /** Resultados parciais à medida que chegam (para o mapa ir se preenchendo). */
  onPartial?: (entries: Record<string, MunicipalEntry>) => void;
  /** Limitador de requisições (padrão: o global da aplicação; `null` desativa). */
  limiter?: RequestLimiter | null;
  /** "low" para o estado aberto; "background" para o pré-carregamento. */
  priority?: Priority;
}

export async function loadMunicipalSnapshot(p: LoadMunicipalParams): Promise<MunicipalSnapshot> {
  const { base, election, round, signal, fetchImpl } = p;
  const uf = p.uf.toLowerCase();
  const ctx: PathContext = {
    base,
    ciclo: election.ciclo,
    codigoEleicao: round.codigoEleicao,
    cargo: election.cargo,
  };
  const previous =
    p.previous &&
    p.previous.electionId === election.id &&
    p.previous.codigoEleicao === round.codigoEleicao &&
    p.previous.turno === round.turno &&
    p.previous.uf === uf
      ? p.previous
      : null;

  const opts = { signal, fetchImpl, priority: p.priority ?? 'low', limiter: p.limiter };
  let stamps: Map<string, string> | null = null;
  let abRateLimited = false;
  try {
    const ab = parseAbrangencia(
      await fetchTseJson(abrangenciaUrl(ctx, uf), opts),
      round.codigoEleicao,
      round.turno,
    );
    stamps = new Map([...ab.items.values()].map((i) => [i.codigo.padStart(5, '0'), i.stamp]));
  } catch (e) {
    // Sem andamento, todos os municípios são consultados (com revalidação por ETag).
    if (e instanceof TseError && (e.kind === 'aborted' || e.kind === 'wrong-election')) throw e;
    abRateLimited = e instanceof TseError && e.kind === 'rate-limited';
  }

  const entries: Record<string, MunicipalEntry> = {};
  const list = p.municipios;
  let done = 0;
  let next = 0;
  const work = async () => {
    while (next < list.length) {
      const m = list[next++]!;
      const prev = previous?.entries[m.codigo];
      const stamp = stamps?.get(m.codigo) ?? null;
      const unchanged = stamp ? prev?.stamp === stamp : abRateLimited;
      if (prev?.result && prev.status === 'ok' && unchanged) {
        // Andamento igual (ou indisponível por limite de requisições): reaproveita.
        entries[m.codigo] = prev;
      } else {
        try {
          const raw = await fetchTseJson(resultUrl(ctx, uf, m.codigo), opts);
          const parsed = parseResultado(raw, {
            codigoEleicao: round.codigoEleicao,
            turno: round.turno,
            cargo: election.cargo,
            tipo: 'mu',
            codigo: m.codigo,
          });
          const result = prev?.result && prev.result.idg > parsed.idg ? prev.result : parsed;
          entries[m.codigo] = { ...m, status: 'ok', result, stamp };
        } catch (e) {
          if (e instanceof TseError && e.kind === 'aborted') throw e;
          const rateLimited = e instanceof TseError && e.kind === 'rate-limited';
          entries[m.codigo] = prev?.result
            ? {
                ...prev,
                status: 'stale',
                message: `Atualização falhou: ${describeError(e)} Exibindo o último resultado válido.`,
              }
            : {
                ...m,
                status: rateLimited
                  ? 'pending'
                  : e instanceof TseError && e.kind === 'not-published'
                    ? 'unavailable'
                    : 'invalid',
                result: null,
                stamp: null,
                message: describeError(e),
              };
        }
      }
      p.onProgress?.(++done, list.length);
      if (p.onPartial && (done % 25 === 0 || done === list.length)) p.onPartial({ ...entries });
    }
  };
  await Promise.all(Array.from({ length: Math.min(p.concurrency ?? 3, list.length) }, work));

  return {
    electionId: election.id,
    turno: round.turno,
    codigoEleicao: round.codigoEleicao,
    uf,
    entries,
    fetchedAt: new Date().toISOString(),
  };
}

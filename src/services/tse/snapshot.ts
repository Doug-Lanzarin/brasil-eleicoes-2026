/**
 * Monta a fotografia completa da apuração de um turno.
 *
 * Estratégia por ciclo de consulta:
 *  1. Baixa o andamento por UF (`br-e<ele>-ab.json`) e o resultado nacional.
 *  2. Para cada UF (e o exterior), só baixa o arquivo de resultado se o carimbo de
 *     andamento mudou em relação à fotografia anterior. Arquivos inalterados ainda são
 *     revalidados com ETag pelo navegador (304), mas não são reprocessados.
 *  3. Uma resposta com `idg` menor que o já conhecido é descartada (nunca regride).
 *  4. Uma falha numa UF preserva o último resultado válido daquela UF, marcado como "stale".
 */
import { TSE_EXTERIOR_CODE, UFS, type UfSigla } from '../../data/ufs';
import type {
  AreaResult,
  ElectionConfig,
  ElectionSnapshot,
  RoundConfig,
  StateEntry,
} from '../../types/election';
import {
  candidateIssues,
  parseAbrangencia,
  parseResultado,
  type AbrangenciaIndex,
} from './adapter';
import { fetchTseJson } from './client';
import { describeError, TseError } from './errors';
import { abrangenciaUrl, resultUrl, type PathContext } from './paths';

export interface LoadSnapshotParams {
  base: string;
  election: ElectionConfig;
  round: RoundConfig;
  previous: ElectionSnapshot | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  now?: () => Date;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Escolhe o resultado mais recente entre o novo e o anterior (por idg). */
export function newest(next: AreaResult, prev: AreaResult | null | undefined): AreaResult {
  if (prev && prev.codigoEleicao === next.codigoEleicao && prev.idg > next.idg) return prev;
  return next;
}

export async function loadSnapshot(p: LoadSnapshotParams): Promise<ElectionSnapshot> {
  const { base, election, round, signal, fetchImpl } = p;
  const now = p.now ?? (() => new Date());
  const concurrency = p.concurrency ?? 6;
  const ctx: PathContext = {
    base,
    ciclo: election.ciclo,
    codigoEleicao: round.codigoEleicao,
    cargo: election.cargo,
  };
  const turno = round.turno;

  // Fotografia anterior só é aproveitada se for exatamente do mesmo turno/eleição.
  const previous =
    p.previous &&
    p.previous.electionId === election.id &&
    p.previous.codigoEleicao === round.codigoEleicao &&
    p.previous.turno === turno
      ? p.previous
      : null;

  const [abRaw, brRaw] = await Promise.all([
    fetchTseJson(abrangenciaUrl(ctx, 'br'), { signal, fetchImpl }).catch((e: unknown) => e),
    fetchTseJson(resultUrl(ctx, 'br'), { signal, fetchImpl }),
  ]);

  const nationalParsed = parseResultado(brRaw, {
    codigoEleicao: round.codigoEleicao,
    turno,
    cargo: election.cargo,
    tipo: 'br',
    codigo: 'br',
  });
  nationalParsed.issues.push(...candidateIssues(nationalParsed, election));
  const national = newest(nationalParsed, previous?.national);

  let ab: AbrangenciaIndex | null = null;
  const abRateLimited = abRaw instanceof TseError && abRaw.kind === 'rate-limited';
  if (!(abRaw instanceof Error)) {
    // Erros de turno/eleição no andamento também invalidam o ciclo.
    ab = parseAbrangencia(abRaw, round.codigoEleicao, turno);
  } else if (abRaw instanceof TseError && abRaw.kind === 'aborted') {
    throw abRaw;
  }

  const targets: { code: string; uf: UfSigla | null }[] = [
    ...UFS.map((u) => ({ code: u.tse, uf: u.sigla as UfSigla })),
    { code: TSE_EXTERIOR_CODE, uf: null },
  ];

  const entries = await mapLimit(targets, concurrency, async ({ code, uf }) => {
    const prevEntry = uf ? previous?.states[uf] : previous?.exterior;
    const stamp = ab?.items.get(code)?.stamp ?? null;
    const unchanged = stamp ? prevEntry?.stamp === stamp : abRateLimited;
    if (prevEntry?.result && prevEntry.status === 'ok' && unchanged) {
      // Andamento inalterado (ou indisponível por limite do TSE): reaproveita sem baixar.
      return prevEntry;
    }
    try {
      const raw = await fetchTseJson(resultUrl(ctx, code), { signal, fetchImpl });
      const parsed = parseResultado(raw, {
        codigoEleicao: round.codigoEleicao,
        turno,
        cargo: election.cargo,
        tipo: 'uf',
        codigo: code,
      });
      parsed.issues.push(...candidateIssues(parsed, election));
      const result = newest(parsed, prevEntry?.result);
      return {
        uf: (uf ?? 'ZZ') as UfSigla,
        status: 'ok',
        result,
        stamp,
      } satisfies StateEntry;
    } catch (e) {
      if (e instanceof TseError && e.kind === 'aborted') throw e;
      if (prevEntry?.result) {
        return {
          ...prevEntry,
          status: 'stale',
          message: `Atualização falhou: ${describeError(e)} Exibindo o último resultado válido.`,
        } satisfies StateEntry;
      }
      const unpublished = e instanceof TseError && e.kind === 'not-published';
      return {
        uf: (uf ?? 'ZZ') as UfSigla,
        status: unpublished ? 'unavailable' : 'invalid',
        result: null,
        stamp: null,
        message: describeError(e),
      } satisfies StateEntry;
    }
  });

  const states = {} as Record<UfSigla, StateEntry>;
  let exterior: StateEntry | null = null;
  targets.forEach((t, i) => {
    if (t.uf) states[t.uf] = entries[i]!;
    else exterior = entries[i]!;
  });

  return {
    electionId: election.id,
    turno,
    codigoEleicao: round.codigoEleicao,
    national,
    states,
    exterior,
    fetchedAt: now().toISOString(),
  };
}

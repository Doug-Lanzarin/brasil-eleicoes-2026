import type {
  AreaResult,
  ApuracaoStatus,
  CandidateConfig,
  CandidateKey,
  CandidateResult,
  Comparison,
  ElectionConfig,
  Leader,
  MapFill,
  Progress,
  StateEntry,
} from '../types/election';

/**
 * Localiza um candidato configurado nos resultados normalizados.
 * Identificador primário: `sqcand`. O número de urna precisa coincidir; um número
 * divergente indica arquivo inconsistente e o candidato é tratado como não localizado.
 */
export function findCandidate(
  candidatos: readonly CandidateResult[],
  cfg: Pick<CandidateConfig, 'sqcand' | 'numero'>,
): CandidateResult | null {
  const match = candidatos.filter((c) => c.sqcand === cfg.sqcand);
  if (match.length !== 1) return null;
  const c = match[0]!;
  return c.numero === cfg.numero ? c : null;
}

/** Percentual sobre votos válidos (0..100). Null se o denominador for inválido. */
export function percentOfValid(votes: number | null, validos: number | null): number | null {
  if (votes == null || validos == null || validos <= 0) return null;
  if (votes > validos) return null;
  return (votes / validos) * 100;
}

export function determineLeader(
  a: number | null,
  b: number | null,
  keys: [CandidateKey, CandidateKey],
): Leader {
  if (a == null || b == null) return 'none';
  if (a === 0 && b === 0) return 'none';
  if (a === b) return 'tie';
  return a > b ? keys[0] : keys[1];
}

/** Comparação Lula × Flávio para uma abrangência, a partir dos campos oficiais. */
export function compareCandidates(result: AreaResult | null, election: ElectionConfig): Comparison {
  const [ca, cb] = election.candidates;
  const empty: Comparison = {
    votes: { [ca.key]: null, [cb.key]: null } as Record<CandidateKey, number | null>,
    pctValidos: { [ca.key]: null, [cb.key]: null } as Record<CandidateKey, number | null>,
    leader: 'none',
    diffVotes: null,
    diffPP: null,
  };
  if (!result) return empty;
  const ra = findCandidate(result.candidatos, ca);
  const rb = findCandidate(result.candidatos, cb);
  const va = ra?.votos ?? null;
  const vb = rb?.votos ?? null;
  const pa = percentOfValid(va, result.votos.validos);
  const pb = percentOfValid(vb, result.votos.validos);
  const leader = determineLeader(va, vb, [ca.key, cb.key]);
  return {
    votes: { [ca.key]: va, [cb.key]: vb } as Record<CandidateKey, number | null>,
    pctValidos: { [ca.key]: pa, [cb.key]: pb } as Record<CandidateKey, number | null>,
    leader,
    diffVotes: va != null && vb != null ? Math.abs(va - vb) : null,
    diffPP: pa != null && pb != null ? Math.abs(pa - pb) : null,
  };
}

/** Entrada com resultado e situação (UF ou município). */
export interface ResultEntry {
  status: StateEntry['status'] | 'pending';
  result: AreaResult | null;
}

/** Cor do estado no mapa. Nunca deriva cor de nada além dos votos oficiais. */
export function mapFillFor(entry: ResultEntry | undefined, election: ElectionConfig): MapFill {
  if (!entry || !entry.result || entry.status === 'unavailable' || entry.status === 'invalid') {
    return 'unavailable';
  }
  const cmp = compareCandidates(entry.result, election);
  switch (cmp.leader) {
    case 'tie':
      return 'tie';
    case 'none':
      return 'no-data';
    default:
      return cmp.leader;
  }
}

export function apuracaoStatus(totalizadas: number, finalizadaFlag: boolean): ApuracaoStatus {
  if (finalizadaFlag) return 'finalizada';
  if (totalizadas <= 0) return 'nao-iniciada';
  return 'parcial';
}

export function computeProgress(
  totalizadas: number,
  esperadas: number,
  finalizadaFlag: boolean,
): Progress {
  const percentual = esperadas > 0 ? Math.min(100, (totalizadas / esperadas) * 100) : 0;
  return {
    secoesTotalizadas: totalizadas,
    secoesEsperadas: esperadas,
    percentual,
    status: apuracaoStatus(totalizadas, finalizadaFlag),
  };
}

/** Contagem de UFs lideradas por cada candidato (para o resumo do mapa). */
export function countStatesByFill(
  states: Record<string, ResultEntry>,
  election: ElectionConfig,
): Record<MapFill, number> {
  const counts: Record<MapFill, number> = {
    lula: 0,
    flavio: 0,
    tie: 0,
    'no-data': 0,
    unavailable: 0,
  };
  for (const entry of Object.values(states)) counts[mapFillFor(entry, election)]++;
  return counts;
}

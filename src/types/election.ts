import type { UfSigla } from '../data/ufs';

/** Chave interna dos dois candidatos comparados no mapa. */
export type CandidateKey = 'lula' | 'flavio';

export interface CandidateConfig {
  key: CandidateKey;
  /** Nome curto exibido na interface. */
  displayName: string;
  /** Nome completo (registro de candidatura). */
  fullName: string;
  /** Número de urna. */
  numero: string;
  /**
   * Sequencial da candidatura no TSE (`sqcand`). É o identificador primário usado
   * para localizar o candidato nos arquivos. O número de urna é usado apenas como
   * verificação cruzada.
   */
  sqcand: string;
  party: string;
  /** Cor eleitoral (classe/variável definida em tokens). */
  color: 'red' | 'blue';
}

export interface RoundConfig {
  turno: 1 | 2;
  label: string;
  /** Código da eleição no TSE para este turno (ex.: "6257"). */
  codigoEleicao: string;
  /** Código do pleito (diretório `arquivo-urna/<pleito>` dos boletins de urna). */
  pleito: string;
  /** Data do pleito (ISO). */
  date: string;
}

export interface ElectionConfig {
  id: string;
  label: string;
  /** Ciclo no caminho dos arquivos (ex.: "ele2026"). */
  ciclo: string;
  /** Código do cargo (Presidente = "1"). */
  cargo: string;
  cargoLabel: string;
  rounds: RoundConfig[];
  candidates: [CandidateConfig, CandidateConfig];
}

/** Candidato normalizado a partir do arquivo oficial. */
export interface CandidateResult {
  sqcand: string;
  numero: string;
  nomeUrna: string;
  nome: string;
  partido: string;
  votos: number;
  /** Percentual oficial sobre válidos (precisão estendida), quando presente. */
  percentualOficial: number | null;
  situacao: string;
}

export type ApuracaoStatus = 'nao-iniciada' | 'parcial' | 'finalizada';

export interface Progress {
  secoesTotalizadas: number;
  secoesEsperadas: number;
  /** 0..100, calculado de secoesTotalizadas/secoesEsperadas. */
  percentual: number;
  status: ApuracaoStatus;
}

export interface VoteTotals {
  /** Total de votos apurados (válidos + brancos + nulos + anulados). */
  total: number;
  validos: number;
  brancos: number;
  /** Total de nulos (nulos declarados + nulos técnicos). */
  nulos: number;
  nulosTecnicos: number;
  anulados: number;
  anuladosSubJudice: number;
  nominais: number | null;
}

export type DataIssueSeverity = 'warning' | 'error';
export interface DataIssue {
  severity: DataIssueSeverity;
  code: string;
  message: string;
}

/** Resultado de uma abrangência (Brasil, UF, exterior ou município). */
export interface AreaResult {
  codigoEleicao: string;
  turno: 1 | 2;
  tipo: 'br' | 'uf' | 'mu';
  codigo: string;
  /** Identificador de geração do arquivo (crescente). */
  idg: number;
  /** Geração do arquivo no TSE (ISO 8601, horário de Brasília). */
  geradoEm: string | null;
  /** Última totalização (ISO 8601). Nulo antes do início da apuração. */
  totalizadoEm: string | null;
  progress: Progress;
  votos: VoteTotals;
  candidatos: CandidateResult[];
  issues: DataIssue[];
}

export type Leader = CandidateKey | 'tie' | 'none';

/** Comparação Lula × Flávio para uma abrangência. */
export interface Comparison {
  /** Votos de cada candidato; null quando o candidato não foi localizado no arquivo. */
  votes: Record<CandidateKey, number | null>;
  /** Percentual sobre votos válidos (0..100) ou null quando não calculável. */
  pctValidos: Record<CandidateKey, number | null>;
  leader: Leader;
  /** Diferença absoluta de votos (sempre ≥ 0) ou null. */
  diffVotes: number | null;
  /** Diferença em pontos percentuais (líder − segundo, ≥ 0) ou null. */
  diffPP: number | null;
}

export type MapFill = 'lula' | 'flavio' | 'tie' | 'no-data' | 'unavailable';

export type StateEntryStatus = 'ok' | 'stale' | 'unavailable' | 'invalid';
export interface StateEntry {
  uf: UfSigla;
  status: StateEntryStatus;
  result: AreaResult | null;
  /** Mensagem quando status ≠ ok. */
  message?: string;
  /** Carimbo de andamento (abrangência) usado para decidir se o arquivo mudou. */
  stamp: string | null;
}

/** Fotografia completa da apuração de um turno. */
export interface ElectionSnapshot {
  electionId: string;
  turno: 1 | 2;
  codigoEleicao: string;
  national: AreaResult;
  states: Record<UfSigla, StateEntry>;
  exterior: StateEntry | null;
  /** Momento (ISO) em que a consulta foi concluída com sucesso. */
  fetchedAt: string;
}

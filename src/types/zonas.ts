/**
 * Arquivo de resultados por zona eleitoral, gerado pelo processo `server/zonas/worker.ts`
 * a partir dos Boletins de Urna (BU) publicados pelo TSE, e lido pelo app.
 * Um arquivo por UF e eleição: `<base>/<codigoEleicao>/<uf>.json`.
 */
export interface ZonaResultado {
  /** Seções da zona neste município, segundo a configuração oficial (cs). */
  secoes: number;
  /** Seções cujo BU totalizado já foi decodificado. */
  secoesProcessadas: number;
  /** Votos por número de candidato válido. */
  votos: Record<string, number>;
  validos: number;
  brancos: number;
  /** Nulos + votos em números sem candidatura válida (nulos técnicos). */
  nulos: number;
  comparecimento: number;
}

export interface ZonasMunicipio {
  secoes: number;
  secoesProcessadas: number;
  /** Chave: número da zona com 4 dígitos (ex.: "0004"). */
  zonas: Record<string, ZonaResultado>;
}

export interface ZonasArquivo {
  versao: 1;
  fonte: string;
  eleicao: string;
  turno: 1 | 2;
  pleito: string;
  /** Sigla TSE da UF (minúsculas). */
  uf: string;
  cargo: string;
  /** Momento (ISO) em que o arquivo foi gerado pelo processo. */
  geradoEm: string;
  /** Números de candidatos com candidatura válida (os demais contam como nulos técnicos). */
  candidatosValidos: string[];
  /** Chave: código TSE do município (5 dígitos). */
  municipios: Record<string, ZonasMunicipio>;
}

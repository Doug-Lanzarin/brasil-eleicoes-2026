/**
 * Tipos dos arquivos JSON oficiais de divulgação de resultados do TSE (Eleições 2026).
 *
 * Estrutura validada empiricamente em resultados.tse.jus.br/oficial/ele2026 (out/2026).
 * Todos os valores numéricos chegam como string ("123" ou "45,16"). Campos não utilizados
 * pela aplicação foram omitidos.
 */

/** Totais de seções ("s"). */
export interface TseRawSecoes {
  /** Total de seções. */
  ts: string;
  /** Seções totalizadas. */
  st: string;
  /** Percentual de seções totalizadas (vírgula decimal). */
  pst?: string;
  /** Seções não totalizadas. */
  snt?: string;
}

/** Eleitorado/comparecimento ("e"). */
export interface TseRawEleitorado {
  te: string;
  /** Comparecimento. */
  c?: string;
  /** Abstenção. */
  a?: string;
}

/** Totais de votos ("v"). */
export interface TseRawVotos {
  /** Total de votos (comparecimento apurado). */
  tv: string;
  /** Votos válidos. */
  vv: string;
  /** Votos nominais. */
  vnom?: string;
  /** Votos brancos. */
  vb: string;
  /** Total de votos nulos (nulos + nulos técnicos). */
  tvn: string;
  /** Votos nulos (declarados). */
  vn?: string;
  /** Votos nulos técnicos. */
  vnt?: string;
  /** Votos anulados. */
  van?: string;
  /** Votos anulados sub judice. */
  vansj?: string;
}

export interface TseRawCandidato {
  /** Número do candidato na urna. */
  n: string;
  /** Sequencial do candidato (identificador único da candidatura). */
  sqcand: string;
  nm: string;
  /** Nome de urna. */
  nmu: string;
  /** Votos apurados. */
  vap: string;
  pvap?: string;
  /** Percentual sobre votos válidos com precisão estendida. */
  pvapn?: string;
  /** "s" quando eleito / classificado. */
  e?: string;
  /** Situação textual ("2º turno", "Eleito", "Não eleito"...). */
  st?: string;
  dvt?: string;
}

export interface TseRawPartido {
  n: string;
  sg: string;
  nm: string;
  cand: TseRawCandidato[];
}

export interface TseRawAgremiacao {
  n: string;
  nm: string;
  tp: string;
  par: TseRawPartido[];
}

export interface TseRawCargo {
  cd: string;
  nmn?: string;
  agr: TseRawAgremiacao[];
}

/** Arquivo de resultado por abrangência: `<abr>-c<cargo>-e<eleicao>-u.json`. */
export interface TseRawResultado {
  /** Código da eleição. */
  ele: string;
  /** Turno. */
  t: string;
  /** "o" = oficial. */
  f?: string;
  /** Tipo de abrangência: "br", "uf" ou "mu". */
  tpabr: string;
  /** Código da abrangência ("br", sigla da UF minúscula ou código TSE do município). */
  cdabr: string;
  /** Data/hora de geração do arquivo (horário de Brasília). */
  dg: string;
  hg: string;
  /** Identificador de geração do arquivo (crescente). */
  idg: string;
  /** Data/hora da última totalização. Vazio antes do início da apuração. */
  dt: string;
  ht: string;
  /** "s" quando a totalização está finalizada. */
  tf?: string;
  /** Andamento: "n" (não iniciada), "p" (parcial), "f" (finalizada). */
  and?: string;
  carg: TseRawCargo[];
  s: TseRawSecoes;
  e?: TseRawEleitorado;
  v: TseRawVotos;
}

/** Item de `<uf>-e<eleicao>-ab.json`: andamento por abrangência (UF ou município). */
export interface TseRawAbrangenciaItem {
  and?: string;
  tpabr: string;
  cdabr: string;
  dt: string;
  ht: string;
  s: TseRawSecoes;
}

export interface TseRawAbrangencia {
  ele: string;
  t: string;
  dg: string;
  hg: string;
  idg: string;
  abr: TseRawAbrangenciaItem[];
}

/** `config/mun-e<eleicao>-cm.json`: municípios por UF. */
export interface TseRawMunicipiosConfig {
  dg: string;
  hg: string;
  idg: string;
  abr: {
    cd: string;
    ds: string;
    mu: { cd: string; cdi: string; nm: string; c?: string }[];
  }[];
}

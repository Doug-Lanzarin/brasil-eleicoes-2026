/**
 * Decodificador do Boletim de Urna (BU) publicado pelo TSE em `arquivo-urna/.../*-bu.dat`.
 *
 * O arquivo é um envelope ASN.1 (DER) cujo último OCTET STRING contém a
 * EntidadeBoletimUrna. A estrutura abaixo foi validada contra o arquivo oficial
 * "Boletim de Urna na Web" (bweb) do 1º turno de 2026: seções decodificadas batem, voto a
 * voto, com o arquivo oficial (ver docs/INTEGRACAO-TSE.md).
 *
 * EntidadeBoletimUrna ::= SEQUENCE {
 *   cabecalho, fase, urna,
 *   identificacaoSecao SEQUENCE { municipioZona SEQUENCE { municipio, zona }, local, secao },
 *   dataHoraEmissao, [0] dadosSecaoSA, qtdEleitoresLibCodigo, [1] qtdEleitoresCompBiometrico,
 *   resultadosVotacaoPorEleicao SEQUENCE OF SEQUENCE {
 *     idEleicao INTEGER, qtdEleitoresAptos INTEGER, ...,
 *     resultadosVotacao SEQUENCE OF SEQUENCE {
 *       tipoCargo ENUMERATED, qtdComparecimento INTEGER,
 *       totaisVotosCargo SEQUENCE OF SEQUENCE {
 *         codigoCargo CHOICE { [1] cargoConstitucional, ... }, ordemImpressao INTEGER,
 *         votosVotaveis SEQUENCE OF SEQUENCE {
 *           [1] tipoVoto ENUMERATED (1 nominal, 2 branco, 3 nulo, 4 legenda, 5 cargo sem candidato),
 *           [2] quantidadeVotos INTEGER,
 *           [3] identificacaoVotavel SEQUENCE { partido INTEGER, codigo INTEGER } OPTIONAL, ...
 *         } } } } , ... }
 */

export class BuDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuDecodeError';
  }
}

interface Tlv {
  tag: number;
  start: number;
  end: number;
}

const TAG = {
  INTEGER: 0x02,
  OCTET_STRING: 0x04,
  ENUMERATED: 0x0a,
  SEQUENCE: 0x30,
  CTX1: 0x81,
  CTX2: 0x82,
  CTX3_CONS: 0xa3,
} as const;

function readTlv(b: Uint8Array, i: number, limit: number): Tlv {
  if (i >= limit) throw new BuDecodeError('Fim inesperado do arquivo.');
  let tag = b[i++]!;
  if ((tag & 0x1f) === 0x1f) {
    // Tag de número alto: consome os bytes de continuação.
    let n = 0;
    let x: number;
    do {
      if (i >= limit) throw new BuDecodeError('Tag truncada.');
      x = b[i++]!;
      n = (n << 7) | (x & 0x7f);
    } while (x & 0x80);
    tag = 0x1000 | n;
  }
  if (i >= limit) throw new BuDecodeError('Comprimento ausente.');
  let len = b[i++]!;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new BuDecodeError('Comprimento inválido.');
    len = 0;
    for (let k = 0; k < n; k++) {
      if (i >= limit) throw new BuDecodeError('Comprimento truncado.');
      len = len * 256 + b[i++]!;
    }
  }
  const end = i + len;
  if (end > limit) throw new BuDecodeError('Campo excede o tamanho do arquivo.');
  return { tag, start: i, end };
}

function children(b: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let i = parent.start;
  while (i < parent.end) {
    const t = readTlv(b, i, parent.end);
    out.push(t);
    i = t.end;
  }
  return out;
}

function int(b: Uint8Array, t: Tlv): number {
  const len = t.end - t.start;
  if (len < 1 || len > 6) throw new BuDecodeError('Inteiro com tamanho inválido.');
  // Inteiro DER em complemento de dois, big-endian.
  const first = b[t.start]!;
  let v = first & 0x80 ? first - 256 : first;
  for (let i = t.start + 1; i < t.end; i++) v = v * 256 + b[i]!;
  return v;
}

function expectTag(t: Tlv | undefined, tag: number, what: string): Tlv {
  if (!t || t.tag !== tag) throw new BuDecodeError(`Estrutura inesperada em ${what}.`);
  return t;
}

export type TipoVoto = 'nominal' | 'branco' | 'nulo' | 'legenda' | 'cargoSemCandidato';
const TIPO_VOTO: Record<number, TipoVoto> = {
  1: 'nominal',
  2: 'branco',
  3: 'nulo',
  4: 'legenda',
  5: 'cargoSemCandidato',
};

export interface BuVoto {
  tipo: TipoVoto;
  quantidade: number;
  /** Número do votável (candidato) — apenas votos nominais/legenda. */
  numero?: number;
  partido?: number;
}

export interface BuCargo {
  /** Código do cargo constitucional (1 = Presidente) ou null para consultas. */
  codigoCargo: number | null;
  comparecimento: number;
  votos: BuVoto[];
}

export interface BuEleicao {
  idEleicao: number;
  aptos: number;
  cargos: BuCargo[];
}

export interface BoletimUrna {
  pleito: number;
  municipio: number;
  zona: number;
  local: number;
  secao: number;
  eleicoes: BuEleicao[];
}

export function decodeBoletimUrna(bytes: Uint8Array): BoletimUrna {
  const env = readTlv(bytes, 0, bytes.length);
  expectTag(env, TAG.SEQUENCE, 'envelope');
  const envFields = children(bytes, env);
  const cab = children(bytes, expectTag(envFields[0], TAG.SEQUENCE, 'cabeçalho do envelope'));
  // cabeçalho: dataGeração, [2] idEleitoral (pleito)
  const pleitoTlv = cab.find((c) => (c.tag & 0x1f) === 2 && c.tag !== TAG.INTEGER) ?? cab[1];
  if (!pleitoTlv) throw new BuDecodeError('Pleito ausente.');
  const pleito = int(bytes, pleitoTlv);

  const content = [...envFields].reverse().find((f) => f.tag === TAG.OCTET_STRING);
  if (!content) throw new BuDecodeError('Conteúdo do BU ausente.');
  const inner = bytes.subarray(content.start, content.end);

  const bu = expectTag(readTlv(inner, 0, inner.length), TAG.SEQUENCE, 'EntidadeBoletimUrna');
  const top = children(inner, bu);
  const ident = children(inner, expectTag(top[3], TAG.SEQUENCE, 'identificação da seção'));
  const mz = children(inner, expectTag(ident[0], TAG.SEQUENCE, 'município/zona'));
  const municipio = int(inner, expectTag(mz[0], TAG.INTEGER, 'município'));
  const zona = int(inner, expectTag(mz[1], TAG.INTEGER, 'zona'));
  const local = int(inner, expectTag(ident[1], TAG.INTEGER, 'local'));
  const secao = int(inner, expectTag(ident[2], TAG.INTEGER, 'seção'));

  // resultadosVotacaoPorEleicao: primeira SEQUENCE após a identificação da seção.
  const resultados = top.slice(4).find((t) => t.tag === TAG.SEQUENCE);
  if (!resultados) throw new BuDecodeError('Resultados ausentes.');

  const eleicoes: BuEleicao[] = children(inner, resultados).map((rve) => {
    const f = children(inner, expectTag(rve, TAG.SEQUENCE, 'resultado por eleição'));
    const idEleicao = int(inner, expectTag(f[0], TAG.INTEGER, 'idEleicao'));
    const aptos = int(inner, expectTag(f[1], TAG.INTEGER, 'aptos'));
    const rvSeq = f.find((t) => t.tag === TAG.SEQUENCE);
    if (!rvSeq) throw new BuDecodeError('resultadosVotacao ausente.');
    const cargos: BuCargo[] = [];
    for (const rv of children(inner, rvSeq)) {
      const rf = children(inner, expectTag(rv, TAG.SEQUENCE, 'resultado de votação'));
      expectTag(rf[0], TAG.ENUMERATED, 'tipoCargo');
      const comparecimento = int(inner, expectTag(rf[1], TAG.INTEGER, 'comparecimento'));
      for (const tvc of children(inner, expectTag(rf[2], TAG.SEQUENCE, 'totais por cargo'))) {
        const tf = children(inner, expectTag(tvc, TAG.SEQUENCE, 'total por cargo'));
        const codigo = tf[0];
        if (!codigo) throw new BuDecodeError('Código do cargo ausente.');
        const codigoCargo = codigo.tag === TAG.CTX1 ? int(inner, codigo) : null;
        const votosSeq = tf.find((t, idx) => idx > 0 && t.tag === TAG.SEQUENCE);
        if (!votosSeq) throw new BuDecodeError('Votos do cargo ausentes.');
        const votos: BuVoto[] = children(inner, votosSeq).map((vv) => {
          const vf = children(inner, expectTag(vv, TAG.SEQUENCE, 'votos do votável'));
          const tipoT = vf.find((t) => t.tag === TAG.CTX1);
          const qtdT = vf.find((t) => t.tag === TAG.CTX2);
          if (!tipoT || !qtdT) throw new BuDecodeError('Tipo ou quantidade de voto ausente.');
          const tipo = TIPO_VOTO[int(inner, tipoT)];
          if (!tipo) throw new BuDecodeError('Tipo de voto desconhecido.');
          const quantidade = int(inner, qtdT);
          if (quantidade < 0) throw new BuDecodeError('Quantidade de votos negativa.');
          const idT = vf.find((t) => t.tag === TAG.CTX3_CONS);
          if (idT) {
            const id = children(inner, idT);
            return {
              tipo,
              quantidade,
              partido: int(inner, expectTag(id[0], TAG.INTEGER, 'partido')),
              numero: int(inner, expectTag(id[1], TAG.INTEGER, 'número do votável')),
            };
          }
          return { tipo, quantidade };
        });
        cargos.push({ codigoCargo, comparecimento, votos });
      }
    }
    return { idEleicao, aptos, cargos };
  });

  return { pleito, municipio, zona, local, secao, eleicoes };
}

export interface SecaoVotos {
  /** Votos nominais por número de candidato. */
  nominais: Record<string, number>;
  brancos: number;
  nulos: number;
  comparecimento: number;
}

/** Extrai os votos de um cargo de uma eleição do BU. Null se a seção não tiver esse cargo. */
export function votosDoCargo(
  bu: BoletimUrna,
  idEleicao: number,
  codigoCargo: number,
): SecaoVotos | null {
  const el = bu.eleicoes.find((e) => e.idEleicao === idEleicao);
  const cargo = el?.cargos.find((c) => c.codigoCargo === codigoCargo);
  if (!cargo) return null;
  const out: SecaoVotos = {
    nominais: {},
    brancos: 0,
    nulos: 0,
    comparecimento: cargo.comparecimento,
  };
  for (const v of cargo.votos) {
    if (v.tipo === 'nominal' && v.numero != null) {
      const k = String(v.numero);
      out.nominais[k] = (out.nominais[k] ?? 0) + v.quantidade;
    } else if (v.tipo === 'branco') out.brancos += v.quantidade;
    else if (v.tipo === 'nulo') out.nulos += v.quantidade;
  }
  return out;
}

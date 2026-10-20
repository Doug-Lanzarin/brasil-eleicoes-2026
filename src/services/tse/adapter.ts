/**
 * Camada de adaptação: converte os arquivos oficiais do TSE para o modelo interno.
 *
 * Toda validação estrutural acontece aqui. Se o formato do TSE mudar, apenas este
 * módulo (e os tipos em types/tse.ts) precisam ser ajustados.
 */
import type {
  AreaResult,
  CandidateResult,
  DataIssue,
  ElectionConfig,
  Progress,
  VoteTotals,
} from '../../types/election';
import type { TseRawAbrangencia, TseRawMunicipiosConfig, TseRawResultado } from '../../types/tse';
import { computeProgress } from '../../utils/calc';
import { parseTseDateTime } from '../../utils/dates';
import { parseCount, parseDecimalBR, parseIdg } from '../../utils/numbers';
import { TseError } from './errors';

export interface ExpectedArea {
  codigoEleicao: string;
  turno: 1 | 2;
  cargo: string;
  tipo: 'br' | 'uf' | 'mu';
  /** "br", sigla da UF em minúsculas ou código TSE do município. */
  codigo: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function invalid(message: string): never {
  throw new TseError('invalid-data', message);
}

function requireCount(obj: Record<string, unknown> | undefined, key: string, ctx: string): number {
  const n = parseCount(obj?.[key]);
  if (n == null) invalid(`Campo numérico inválido ou ausente: ${ctx}.${key}`);
  return n;
}

/** Garante que o arquivo pertence à eleição e ao turno esperados. */
export function assertElection(raw: unknown, codigoEleicao: string, turno: number): void {
  if (!isObj(raw)) invalid('Arquivo do TSE em formato inesperado.');
  if (String(raw.ele) !== codigoEleicao || String(raw.t) !== String(turno)) {
    throw new TseError(
      'wrong-election',
      `Arquivo pertence à eleição ${String(raw.ele)} / turno ${String(raw.t)}, ` +
        `esperado ${codigoEleicao} / turno ${turno}. Dados descartados.`,
    );
  }
}

export function parseResultado(raw: unknown, expected: ExpectedArea): AreaResult {
  assertElection(raw, expected.codigoEleicao, expected.turno);
  const r = raw as unknown as TseRawResultado;
  const issues: DataIssue[] = [];

  const tipo = r.tpabr === 'mu' ? 'mu' : r.tpabr === 'br' ? 'br' : r.tpabr === 'uf' ? 'uf' : null;
  const sameCode =
    expected.tipo === 'mu'
      ? /^\d+$/.test(String(r.cdabr)) && Number(r.cdabr) === Number(expected.codigo)
      : String(r.cdabr).toLowerCase() === expected.codigo.toLowerCase();
  if (tipo !== expected.tipo || !sameCode) {
    invalid(
      `Abrangência inesperada: recebido ${String(r.tpabr)}/${String(r.cdabr)}, ` +
        `esperado ${expected.tipo}/${expected.codigo}.`,
    );
  }

  const idg = parseIdg(r.idg);
  if (idg == null) invalid('Identificador de geração (idg) ausente.');

  if (!Array.isArray(r.carg)) invalid('Lista de cargos ausente.');
  const cargos = r.carg.filter((c) => isObj(c) && String(c.cd) === expected.cargo);
  if (cargos.length !== 1) invalid(`Cargo ${expected.cargo} não encontrado (ou duplicado).`);
  const cargo = cargos[0]!;

  const candidatos: CandidateResult[] = [];
  const seen = new Set<string>();
  for (const agr of Array.isArray(cargo.agr) ? cargo.agr : []) {
    for (const par of Array.isArray(agr?.par) ? agr.par : []) {
      for (const c of Array.isArray(par?.cand) ? par.cand : []) {
        if (!isObj(c) || typeof c.sqcand !== 'string' || !c.sqcand) {
          invalid('Candidato sem identificador (sqcand).');
        }
        if (seen.has(c.sqcand)) invalid(`Candidato duplicado no arquivo: ${c.sqcand}.`);
        seen.add(c.sqcand);
        const votos = parseCount(c.vap);
        if (votos == null) invalid(`Votos inválidos para o candidato ${c.sqcand}.`);
        candidatos.push({
          sqcand: c.sqcand,
          numero: String(c.n ?? ''),
          nomeUrna: String(c.nmu ?? ''),
          nome: String(c.nm ?? ''),
          partido: String(par.sg ?? ''),
          votos,
          percentualOficial: parseDecimalBR(c.pvapn),
          situacao: String(c.st ?? ''),
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos);

  if (!isObj(r.s)) invalid('Bloco de seções ("s") ausente.');
  if (!isObj(r.v)) invalid('Bloco de votos ("v") ausente.');
  const s = r.s as unknown as Record<string, unknown>;
  const v = r.v as unknown as Record<string, unknown>;

  const secoesEsperadas = requireCount(s, 'ts', 's');
  const secoesTotalizadas = requireCount(s, 'st', 's');
  if (secoesTotalizadas > secoesEsperadas) {
    invalid('Seções totalizadas maiores que o total de seções.');
  }

  const votos: VoteTotals = {
    total: requireCount(v, 'tv', 'v'),
    validos: requireCount(v, 'vv', 'v'),
    brancos: requireCount(v, 'vb', 'v'),
    nulos: requireCount(v, 'tvn', 'v'),
    nulosTecnicos: parseCount(v.vnt) ?? 0,
    anulados: parseCount(v.van) ?? 0,
    anuladosSubJudice: parseCount(v.vansj) ?? 0,
    nominais: parseCount(v.vnom),
  };

  for (const c of candidatos) {
    if (c.votos > votos.validos) invalid(`Candidato ${c.sqcand} com mais votos que os válidos.`);
  }
  const somaCandidatos = candidatos.reduce((acc, c) => acc + c.votos, 0);
  if (votos.nominais != null && somaCandidatos !== votos.nominais) {
    issues.push({
      severity: 'warning',
      code: 'sum-mismatch',
      message: `Soma dos votos dos candidatos (${somaCandidatos}) difere dos votos nominais (${votos.nominais}).`,
    });
  }
  if (votos.validos + votos.brancos + votos.nulos > votos.total) {
    issues.push({
      severity: 'warning',
      code: 'totals-mismatch',
      message: 'Válidos + brancos + nulos excedem o total de votos.',
    });
  }

  const finalizada = r.tf === 's';
  const progress: Progress = computeProgress(secoesTotalizadas, secoesEsperadas, finalizada);

  return {
    codigoEleicao: expected.codigoEleicao,
    turno: expected.turno,
    tipo,
    codigo: expected.codigo.toLowerCase(),
    idg,
    geradoEm: parseTseDateTime(r.dg, r.hg),
    totalizadoEm: parseTseDateTime(r.dt, r.ht),
    progress,
    votos,
    candidatos,
    issues,
  };
}

/**
 * Verifica a presença e a identidade dos candidatos configurados.
 * Retorna avisos (não altera os dados).
 */
export function candidateIssues(result: AreaResult, election: ElectionConfig): DataIssue[] {
  const out: DataIssue[] = [];
  for (const cfg of election.candidates) {
    const bySq = result.candidatos.find((c) => c.sqcand === cfg.sqcand);
    if (!bySq) {
      const byNum = result.candidatos.find((c) => c.numero === cfg.numero);
      out.push({
        severity: 'error',
        code: 'candidate-not-found',
        message: byNum
          ? `${cfg.displayName}: número ${cfg.numero} encontrado com identificador diferente (${byNum.sqcand}). Verifique a configuração.`
          : `${cfg.displayName} não encontrado no arquivo oficial.`,
      });
    } else if (bySq.numero !== cfg.numero) {
      out.push({
        severity: 'error',
        code: 'candidate-id-mismatch',
        message: `${cfg.displayName}: identificador encontrado com número ${bySq.numero} (esperado ${cfg.numero}).`,
      });
    }
  }
  if (result.turno === 2) {
    const known = new Set(election.candidates.map((c) => c.sqcand));
    for (const c of result.candidatos) {
      if (!known.has(c.sqcand)) {
        out.push({
          severity: 'warning',
          code: 'unrecognized-candidate',
          message: `Candidato não reconhecido no 2º turno: ${c.nomeUrna} (${c.sqcand}).`,
        });
      }
    }
  }
  return out;
}

export interface AbrangenciaItem {
  codigo: string;
  tipo: 'uf' | 'mu';
  progress: Progress;
  totalizadoEm: string | null;
  /** Carimbo para detectar mudanças sem baixar o arquivo de resultado. */
  stamp: string;
}

export interface AbrangenciaIndex {
  idg: number;
  items: Map<string, AbrangenciaItem>;
}

export function parseAbrangencia(
  raw: unknown,
  codigoEleicao: string,
  turno: 1 | 2,
): AbrangenciaIndex {
  assertElection(raw, codigoEleicao, turno);
  const r = raw as unknown as TseRawAbrangencia;
  const idg = parseIdg(r.idg);
  if (idg == null) invalid('Identificador de geração (idg) ausente no andamento.');
  if (!Array.isArray(r.abr)) invalid('Lista de abrangências ausente.');
  const items = new Map<string, AbrangenciaItem>();
  for (const it of r.abr) {
    if (!isObj(it) || !isObj(it.s)) continue;
    const ts = parseCount(it.s.ts);
    const st = parseCount(it.s.st);
    if (ts == null || st == null || st > ts) continue;
    const codigo = String(it.cdabr).toLowerCase();
    if (items.has(codigo)) invalid(`Abrangência duplicada: ${codigo}.`);
    items.set(codigo, {
      codigo,
      tipo: it.tpabr === 'mun' || it.tpabr === 'mu' ? 'mu' : 'uf',
      progress: computeProgress(st, ts, it.and === 'f'),
      totalizadoEm: parseTseDateTime(it.dt, it.ht),
      stamp: `${it.dt}|${it.ht}|${st}/${ts}|${it.and ?? ''}`,
    });
  }
  return { idg, items };
}

export interface MunicipioInfo {
  /** Código TSE do município (5 dígitos). */
  codigo: string;
  /** Código IBGE (7 dígitos). */
  ibge: string;
  nome: string;
  capital: boolean;
}

export function parseMunicipiosConfig(raw: unknown): Map<string, MunicipioInfo[]> {
  if (!isObj(raw) || !Array.isArray(raw.abr)) invalid('Configuração de municípios inválida.');
  const r = raw as unknown as TseRawMunicipiosConfig;
  const out = new Map<string, MunicipioInfo[]>();
  for (const uf of r.abr) {
    if (!isObj(uf) || !Array.isArray(uf.mu)) continue;
    out.set(
      String(uf.cd).toLowerCase(),
      uf.mu
        .filter((m) => isObj(m) && /^\d{1,5}$/.test(String(m.cd)))
        .map((m) => ({
          codigo: String(m.cd).padStart(5, '0'),
          ibge: String(m.cdi ?? ''),
          nome: String(m.nm ?? ''),
          capital: m.c === 's',
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    );
  }
  return out;
}

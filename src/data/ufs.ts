/**
 * Tabela de correspondência das 27 Unidades Federativas.
 *
 * - `ibge`: código IBGE da UF (propriedade `codarea` da malha do IBGE).
 * - `tse`: código da abrangência nos arquivos do TSE (sigla em minúsculas; usada no
 *   diretório `dados/<uf>` e no campo `cdabr`).
 *
 * As correspondências são verificadas em src/tests/ufs.test.ts contra a malha do IBGE
 * e contra o arquivo oficial de municípios do TSE.
 */
export const UFS = [
  { sigla: 'AC', nome: 'Acre', ibge: '12', tse: 'ac', regiao: 'Norte' },
  { sigla: 'AL', nome: 'Alagoas', ibge: '27', tse: 'al', regiao: 'Nordeste' },
  { sigla: 'AP', nome: 'Amapá', ibge: '16', tse: 'ap', regiao: 'Norte' },
  { sigla: 'AM', nome: 'Amazonas', ibge: '13', tse: 'am', regiao: 'Norte' },
  { sigla: 'BA', nome: 'Bahia', ibge: '29', tse: 'ba', regiao: 'Nordeste' },
  { sigla: 'CE', nome: 'Ceará', ibge: '23', tse: 'ce', regiao: 'Nordeste' },
  { sigla: 'DF', nome: 'Distrito Federal', ibge: '53', tse: 'df', regiao: 'Centro-Oeste' },
  { sigla: 'ES', nome: 'Espírito Santo', ibge: '32', tse: 'es', regiao: 'Sudeste' },
  { sigla: 'GO', nome: 'Goiás', ibge: '52', tse: 'go', regiao: 'Centro-Oeste' },
  { sigla: 'MA', nome: 'Maranhão', ibge: '21', tse: 'ma', regiao: 'Nordeste' },
  { sigla: 'MT', nome: 'Mato Grosso', ibge: '51', tse: 'mt', regiao: 'Centro-Oeste' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', ibge: '50', tse: 'ms', regiao: 'Centro-Oeste' },
  { sigla: 'MG', nome: 'Minas Gerais', ibge: '31', tse: 'mg', regiao: 'Sudeste' },
  { sigla: 'PA', nome: 'Pará', ibge: '15', tse: 'pa', regiao: 'Norte' },
  { sigla: 'PB', nome: 'Paraíba', ibge: '25', tse: 'pb', regiao: 'Nordeste' },
  { sigla: 'PR', nome: 'Paraná', ibge: '41', tse: 'pr', regiao: 'Sul' },
  { sigla: 'PE', nome: 'Pernambuco', ibge: '26', tse: 'pe', regiao: 'Nordeste' },
  { sigla: 'PI', nome: 'Piauí', ibge: '22', tse: 'pi', regiao: 'Nordeste' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', ibge: '33', tse: 'rj', regiao: 'Sudeste' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', ibge: '24', tse: 'rn', regiao: 'Nordeste' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', ibge: '43', tse: 'rs', regiao: 'Sul' },
  { sigla: 'RO', nome: 'Rondônia', ibge: '11', tse: 'ro', regiao: 'Norte' },
  { sigla: 'RR', nome: 'Roraima', ibge: '14', tse: 'rr', regiao: 'Norte' },
  { sigla: 'SC', nome: 'Santa Catarina', ibge: '42', tse: 'sc', regiao: 'Sul' },
  { sigla: 'SP', nome: 'São Paulo', ibge: '35', tse: 'sp', regiao: 'Sudeste' },
  { sigla: 'SE', nome: 'Sergipe', ibge: '28', tse: 'se', regiao: 'Nordeste' },
  { sigla: 'TO', nome: 'Tocantins', ibge: '17', tse: 'to', regiao: 'Norte' },
] as const;

export type UfInfo = (typeof UFS)[number];
export type UfSigla = UfInfo['sigla'];

/** Abrangência do TSE para votos no exterior (não aparece no mapa). */
export const TSE_EXTERIOR_CODE = 'zz';

const bySigla = new Map<string, UfInfo>(UFS.map((u) => [u.sigla, u]));
const byIbge = new Map<string, UfInfo>(UFS.map((u) => [u.ibge, u]));
const byTse = new Map<string, UfInfo>(UFS.map((u) => [u.tse, u]));

export const UF_SIGLAS: UfSigla[] = UFS.map((u) => u.sigla);

export function ufBySigla(sigla: string): UfInfo | undefined {
  return bySigla.get(sigla.trim().toUpperCase());
}

export function ufByIbge(code: string | number): UfInfo | undefined {
  return byIbge.get(String(code).trim());
}

export function ufByTse(code: string): UfInfo | undefined {
  return byTse.get(code.trim().toLowerCase());
}

export function isUfSigla(value: unknown): value is UfSigla {
  return typeof value === 'string' && bySigla.has(value);
}

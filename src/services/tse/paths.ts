/**
 * Montagem dos caminhos dos arquivos oficiais de divulgação.
 *
 * Padrões validados em resultados.tse.jus.br (Eleições 2026), conforme o arquivo
 * `comum/config/ele-c.json` (campo "arq"):
 *   <base>/<ciclo>/<eleicao>/dados/<uf>/<abr>-c<cargo:4>-e<eleicao:6>-u.json   resultado
 *   <base>/<ciclo>/<eleicao>/dados/<uf>/<uf>-e<eleicao:6>-ab.json             andamento
 *   <base>/<ciclo>/<eleicao>/config/mun-e<eleicao:6>-cm.json                   municípios
 *
 * Para o Brasil, <uf> = "br". Para municípios, <abr> = <uf><codigo TSE do município>.
 */
const pad = (v: string, n: number) => v.padStart(n, '0');

export interface PathContext {
  base: string;
  ciclo: string;
  codigoEleicao: string;
  cargo: string;
}

function root(ctx: PathContext) {
  return `${ctx.base}/${ctx.ciclo}/${ctx.codigoEleicao}`;
}

export function electionsConfigUrl(base: string) {
  return `${base}/comum/config/ele-c.json`;
}

/** Resultado de uma abrangência. `uf` = "br" para o Brasil; `municipio` opcional. */
export function resultUrl(ctx: PathContext, uf: string, municipio?: string) {
  const dir = uf.toLowerCase();
  const abr = municipio ? `${dir}${pad(municipio, 5)}` : dir;
  return `${root(ctx)}/dados/${dir}/${abr}-c${pad(ctx.cargo, 4)}-e${pad(ctx.codigoEleicao, 6)}-u.json`;
}

/** Andamento por abrangência: para "br" lista as UFs; para uma UF, os municípios. */
export function abrangenciaUrl(ctx: PathContext, uf: string) {
  const dir = uf.toLowerCase();
  return `${root(ctx)}/dados/${dir}/${dir}-e${pad(ctx.codigoEleicao, 6)}-ab.json`;
}

export function municipiosConfigUrl(ctx: PathContext) {
  return `${root(ctx)}/config/mun-e${pad(ctx.codigoEleicao, 6)}-cm.json`;
}

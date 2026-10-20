// Baixa as malhas oficiais do IBGE (API de Malhas v3) usadas pelo mapa.
//
// Uso:
//   npm run geo:update                 # UFs + municípios
//   npm run geo:update -- --so-ufs     # apenas a malha das UFs
//   npm run geo:update -- --qualidade=intermediaria --qualidade-mun=minima
//
// Saída:
//   src/data/geo/br-uf.json        27 UFs (empacotada e pré-cacheada pelo service worker)
//   public/geo/mun/<uf>.json       municípios de cada UF (carregados ao abrir o estado)
//
// Etapas e validações:
//  1. Confere que existem exatamente as 27 UFs (códigos IBGE 11..53).
//  2. Confere, para cada UF, que os códigos IBGE dos municípios da malha coincidem com os
//     códigos IBGE (`cdi`) publicados pelo TSE em config/mun-e006257-cm.json.
//  3. Ajusta a orientação dos anéis para a convenção do d3-geo e arredonda coordenadas
//     a 4 casas decimais (~11 m).
import { mkdir, writeFile } from 'node:fs/promises';
import { geoArea } from 'd3-geo';

const arg = (name, def) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const qualidade = arg('qualidade', 'intermediaria');
const qualidadeMun = arg('qualidade-mun', 'minima');
const soUfs = process.argv.includes('--so-ufs');
const TSE_CM = 'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json';

const UFS = {
  11: 'ro',
  12: 'ac',
  13: 'am',
  14: 'rr',
  15: 'pa',
  16: 'ap',
  17: 'to',
  21: 'ma',
  22: 'pi',
  23: 'ce',
  24: 'rn',
  25: 'pb',
  26: 'pe',
  27: 'al',
  28: 'se',
  29: 'ba',
  31: 'mg',
  32: 'es',
  33: 'rj',
  35: 'sp',
  41: 'pr',
  42: 'sc',
  43: 'rs',
  50: 'ms',
  51: 'mt',
  52: 'go',
  53: 'df',
};
const EXPECTED = Object.keys(UFS);

const round = (n) => Math.round(n * 1e4) / 1e4;

function rewindFeature(feature) {
  const polys =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      poly[i] = poly[i].map(([x, y]) => [round(x), round(y)]);
      const area = geoArea({ type: 'Polygon', coordinates: [poly[i]] });
      // Anel externo deve ter área < 2π (sentido horário no d3); buracos, o contrário.
      if ((i === 0) !== area < 2 * Math.PI) poly[i].reverse();
    }
  }
  return feature;
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`HTTP ${res.status} em ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function collection(geo, url, qual) {
  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'IBGE — API de Malhas Territoriais v3',
      url,
      qualidade: qual,
      downloadedAt: new Date().toISOString(),
    },
    features: geo.features.map((f) =>
      rewindFeature({
        type: 'Feature',
        properties: { codarea: String(f.properties.codarea) },
        geometry: f.geometry,
      }),
    ),
  };
}

// 1. UFs
const ufUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=${qualidade}&intrarregiao=UF`;
console.log(`Baixando UFs: ${ufUrl}`);
const ufGeo = await getJson(ufUrl);
const codes = ufGeo.features.map((f) => String(f.properties.codarea)).sort();
const missing = EXPECTED.filter((c) => !codes.includes(c));
const extra = codes.filter((c) => !EXPECTED.includes(c));
if (missing.length || extra.length || codes.length !== 27) {
  throw new Error(`Malha inesperada. Ausentes: ${missing} Extras: ${extra}`);
}
await mkdir('src/data/geo', { recursive: true });
await writeFile('src/data/geo/br-uf.json', JSON.stringify(collection(ufGeo, ufUrl, qualidade)));
console.log('OK: 27 UFs gravadas em src/data/geo/br-uf.json');

if (!soUfs) {
  // 2. Municípios, conferidos contra a lista oficial do TSE.
  console.log(`Baixando lista oficial de municípios do TSE: ${TSE_CM}`);
  const cm = await getJson(TSE_CM);
  const tseByUf = new Map(cm.abr.map((a) => [a.cd, new Set(a.mu.map((m) => String(m.cdi)))]));
  await mkdir('public/geo/mun', { recursive: true });
  let total = 0;
  for (const [ibge, uf] of Object.entries(UFS)) {
    const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ibge}?formato=application/vnd.geo%2Bjson&qualidade=${qualidadeMun}&intrarregiao=municipio`;
    const geo = await getJson(url);
    const ibgeCodes = new Set(geo.features.map((f) => String(f.properties.codarea)));
    const tse = tseByUf.get(uf) ?? new Set();
    const semTse = [...ibgeCodes].filter((c) => !tse.has(c));
    const semMalha = [...tse].filter((c) => !ibgeCodes.has(c));
    if (semTse.length || semMalha.length) {
      console.warn(
        `ATENÇÃO ${uf.toUpperCase()}: na malha e não no TSE: [${semTse}] ; no TSE e não na malha: [${semMalha}]`,
      );
    }
    await writeFile(
      `public/geo/mun/${uf}.json`,
      JSON.stringify(collection(geo, url, qualidadeMun)),
    );
    total += geo.features.length;
    console.log(`${uf.toUpperCase()}: ${geo.features.length} municípios`);
  }
  console.log(`OK: ${total} municípios gravados em public/geo/mun/`);
}

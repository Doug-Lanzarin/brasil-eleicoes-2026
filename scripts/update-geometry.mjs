// Baixa a malha oficial das Unidades Federativas do IBGE (API de Malhas v3) e grava
// src/data/geo/br-uf.json no formato esperado pelo mapa.
//
// Uso: npm run geo:update [-- --qualidade=intermediaria]
//
// Etapas:
//  1. Consulta https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR (intrarregiao=UF).
//  2. Valida que existem exatamente as 27 UFs esperadas (códigos IBGE 11..53).
//  3. Ajusta a orientação dos anéis para a convenção esférica do d3-geo
//     (o GeoJSON RFC 7946 usa a orientação inversa; sem o ajuste o d3 desenharia o "resto do globo").
import { writeFile, mkdir } from 'node:fs/promises';
import { geoArea } from 'd3-geo';

const qualidade =
  process.argv.find((a) => a.startsWith('--qualidade='))?.split('=')[1] ?? 'intermediaria';
const url = `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=${qualidade}&intrarregiao=UF`;

const EXPECTED = [
  11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50,
  51, 52, 53,
].map(String);

const round = (n) => Math.round(n * 1e4) / 1e4;

function rewindFeature(feature) {
  const polys =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      poly[i] = poly[i].map(([x, y]) => [round(x), round(y)]);
      const ring = { type: 'Polygon', coordinates: [poly[i]] };
      const isExterior = i === 0;
      const area = geoArea(ring);
      // Anel externo deve ter área < 2π (sentido horário no d3); buracos, o contrário.
      const clockwise = area < 2 * Math.PI;
      if (isExterior !== clockwise) poly[i].reverse();
    }
  }
  return feature;
}

console.log(`Baixando ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`IBGE respondeu HTTP ${res.status}`);
const geo = await res.json();

const codes = geo.features.map((f) => String(f.properties.codarea)).sort();
const missing = EXPECTED.filter((c) => !codes.includes(c));
const extra = codes.filter((c) => !EXPECTED.includes(c));
if (missing.length || extra.length || codes.length !== 27) {
  throw new Error(`Malha inesperada. Ausentes: ${missing} Extras: ${extra}`);
}

const out = {
  type: 'FeatureCollection',
  metadata: {
    source: 'IBGE — API de Malhas Territoriais v3',
    url,
    qualidade,
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

await mkdir('src/data/geo', { recursive: true });
await writeFile('src/data/geo/br-uf.json', JSON.stringify(out));
console.log(`OK: ${out.features.length} UFs gravadas em src/data/geo/br-uf.json`);

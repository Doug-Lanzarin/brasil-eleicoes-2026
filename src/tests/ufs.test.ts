import { geoArea } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import geo from '../data/geo/br-uf.json';
import { featureSigla, type UfFeature } from '../data/geo';
import { UFS, ufByIbge, ufBySigla, ufByTse } from '../data/ufs';

const features = (geo as unknown as { features: UfFeature[] }).features;

/** Códigos de abrangência do arquivo oficial mun-e006257-cm.json (TSE, 2026). */
const TSE_CM_CODES = [
  'ac',
  'al',
  'ap',
  'am',
  'ba',
  'ce',
  'df',
  'es',
  'zz',
  'go',
  'ma',
  'mt',
  'ms',
  'mg',
  'pr',
  'pb',
  'pa',
  'pe',
  'pi',
  'rj',
  'rn',
  'rs',
  'ro',
  'rr',
  'sc',
  'se',
  'sp',
  'to',
];

describe('correspondência UF ↔ IBGE ↔ TSE ↔ geometria', () => {
  it('tem exatamente 27 UFs, sem duplicatas', () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS.map((u) => u.sigla)).size).toBe(27);
    expect(new Set(UFS.map((u) => u.ibge)).size).toBe(27);
    expect(new Set(UFS.map((u) => u.tse)).size).toBe(27);
  });

  it('cada geometria do IBGE corresponde a exatamente uma UF', () => {
    expect(features).toHaveLength(27);
    const siglas = features.map(featureSigla);
    expect(siglas).not.toContain(null);
    expect(new Set(siglas).size).toBe(27);
  });

  it('códigos TSE batem com o arquivo oficial de municípios (exceto exterior)', () => {
    const ufCodes = TSE_CM_CODES.filter((c) => c !== 'zz').sort();
    expect(UFS.map((u) => u.tse).sort()).toEqual(ufCodes);
    for (const c of ufCodes) expect(ufByTse(c)).toBeDefined();
  });

  it('pares conhecidos (amostra de verificação manual)', () => {
    expect(ufByIbge('35')?.sigla).toBe('SP');
    expect(ufByIbge('53')?.sigla).toBe('DF');
    expect(ufByIbge('11')?.sigla).toBe('RO');
    expect(ufByIbge('17')?.sigla).toBe('TO');
    expect(ufBySigla('mg')?.ibge).toBe('31');
    expect(ufByTse('RS')?.nome).toBe('Rio Grande do Sul');
  });

  it('a geometria de cada UF fica dentro da UF correta (centroide em faixa geográfica plausível)', () => {
    // Verificação de sanidade: longitude/latitude aproximadas das capitais regionais.
    const bbox = (f: UfFeature) => {
      let minX = 180,
        maxX = -180,
        minY = 90,
        maxY = -90;
      const polys =
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polys)
        for (const ring of p)
          for (const [x, y] of ring) {
            minX = Math.min(minX, x!);
            maxX = Math.max(maxX, x!);
            minY = Math.min(minY, y!);
            maxY = Math.max(maxY, y!);
          }
      return { minX, maxX, minY, maxY };
    };
    const contains = (sigla: string, lon: number, lat: number) => {
      const f = features.find((x) => featureSigla(x) === sigla)!;
      const b = bbox(f);
      return lon >= b.minX && lon <= b.maxX && lat >= b.minY && lat <= b.maxY;
    };
    expect(contains('SP', -46.63, -23.55)).toBe(true); // São Paulo
    expect(contains('DF', -47.88, -15.79)).toBe(true); // Brasília
    expect(contains('AM', -60.02, -3.1)).toBe(true); // Manaus
    expect(contains('RS', -51.23, -30.03)).toBe(true); // Porto Alegre
    expect(contains('BA', -38.5, -12.97)).toBe(true); // Salvador
    expect(contains('RS', -38.5, -12.97)).toBe(false);
  });

  it('anéis orientados para o d3-geo (área esférica menor que meio globo)', () => {
    for (const f of features) expect(geoArea(f)).toBeLessThan(2 * Math.PI);
  });
});

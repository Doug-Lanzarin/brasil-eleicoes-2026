import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { geoArea } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import type { UfFeatureCollection } from '../data/geo';
import { UFS } from '../data/ufs';

const load = (uf: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../../public/geo/mun/${uf}.json`), 'utf8'),
  ) as UfFeatureCollection;

describe('malhas municipais do IBGE (public/geo/mun)', () => {
  const all = UFS.map((u) => ({ u, geo: load(u.tse) }));

  it('existe um arquivo por UF, com municípios da própria UF (prefixo IBGE)', () => {
    for (const { u, geo } of all) {
      expect(geo.features.length).toBeGreaterThan(0);
      for (const f of geo.features) {
        expect(f.properties.codarea).toMatch(/^\d{7}$/);
        expect(f.properties.codarea.slice(0, 2)).toBe(u.ibge);
      }
      const codes = geo.features.map((f) => f.properties.codarea);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('cobre os municípios da malha oficial (5.570 polígonos)', () => {
    expect(all.reduce((acc, x) => acc + x.geo.features.length, 0)).toBe(5570);
    expect(all.find((x) => x.u.sigla === 'DF')!.geo.features).toHaveLength(1);
    expect(all.find((x) => x.u.sigla === 'SP')!.geo.features).toHaveLength(645);
  });

  it('polígonos orientados para o d3-geo', () => {
    for (const { geo } of all) {
      for (const f of geo.features) expect(geoArea(f)).toBeLessThan(2 * Math.PI);
    }
  });
});

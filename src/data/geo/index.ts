import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { ufByIbge, type UfSigla } from '../ufs';

export type UfFeature = Feature<Polygon | MultiPolygon, { codarea: string }>;
export type UfFeatureCollection = FeatureCollection<Polygon | MultiPolygon, { codarea: string }>;

/**
 * Carrega (em chunk separado, pré-cacheado pelo service worker com hash de revisão) a malha
 * das UFs do IBGE. Ver scripts/update-geometry.mjs.
 */
export async function loadUfGeometry(): Promise<UfFeatureCollection> {
  const mod = await import('./br-uf.json');
  return mod.default as unknown as UfFeatureCollection;
}

export function featureSigla(f: UfFeature): UfSigla | null {
  return (ufByIbge(f.properties.codarea)?.sigla as UfSigla | undefined) ?? null;
}

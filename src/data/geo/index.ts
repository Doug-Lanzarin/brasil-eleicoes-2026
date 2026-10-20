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

export type MunFeature = Feature<Polygon | MultiPolygon, { codarea: string }>;

/**
 * Malha dos municípios de uma UF (IBGE, gerada por scripts/update-geometry.mjs em
 * public/geo/mun/<uf>.json). Carregada sob demanda e mantida em cache pelo service worker.
 */
export async function loadMunicipalGeometry(
  ufTse: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UfFeatureCollection> {
  const res = await fetchImpl(`${import.meta.env.BASE_URL}geo/mun/${ufTse.toLowerCase()}.json`);
  if (!res.ok) throw new Error(`Malha municipal indisponível (HTTP ${res.status}).`);
  return (await res.json()) as UfFeatureCollection;
}

import { useMemo } from 'react';
import { featureSigla, type UfFeature, type UfFeatureCollection } from '../../data/geo';
import { ufBySigla, type UfSigla } from '../../data/ufs';
import type { MapFill } from '../../types/election';
import { GeoMap, type GeoMapArea } from './GeoMap';

export interface BrazilMapProps {
  geometry: UfFeatureCollection;
  fills: Partial<Record<UfSigla, MapFill>>;
  summaries?: Partial<Record<UfSigla, string>>;
  selected: UfSigla | null;
  onSelect: (uf: UfSigla | null) => void;
  controls?: 'full' | 'reset';
}

/** Mapa nacional: as 27 UFs, com siglas. */
export function BrazilMap({
  geometry,
  fills,
  summaries,
  selected,
  onSelect,
  controls,
}: BrazilMapProps) {
  const areas = useMemo<GeoMapArea[]>(
    () =>
      (geometry.features as UfFeature[]).flatMap((f) => {
        const sigla = featureSigla(f);
        if (!sigla) return [];
        return [
          { id: sigla, name: `${ufBySigla(sigla)!.nome} (${sigla})`, label: sigla, feature: f },
        ];
      }),
    [geometry],
  );
  return (
    <GeoMap
      areas={areas}
      fills={fills}
      summaries={summaries}
      selected={selected}
      onSelect={(id) => onSelect(id as UfSigla | null)}
      ariaLabel="Mapa do Brasil por unidade federativa. Use Tab para navegar pelos estados e Enter para abrir o estado."
      testId="brazil-map"
      dataAttr="uf"
      controls={controls}
    />
  );
}

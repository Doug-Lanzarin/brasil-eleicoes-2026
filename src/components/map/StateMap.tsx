import { useMemo } from 'react';
import type { UfFeatureCollection } from '../../data/geo';
import { ufBySigla, type UfSigla } from '../../data/ufs';
import type { MunicipioInfo } from '../../services/tse/adapter';
import type { MunicipalSnapshot } from '../../services/tse/municipal';
import type { ElectionConfig, MapFill } from '../../types/election';
import { compareCandidates, mapFillFor } from '../../utils/calc';
import { formatPct, titleCase } from '../../utils/format';
import { GeoMap, type GeoMapArea } from './GeoMap';

export interface StateMapProps {
  uf: UfSigla;
  geometry: UfFeatureCollection;
  municipios: MunicipioInfo[];
  snapshot: MunicipalSnapshot | null;
  election: ElectionConfig;
  selected: string | null;
  onSelect: (mun: string | null) => void;
  onBack: () => void;
  progress: { done: number; total: number } | null;
}

/**
 * Mapa de uma UF dividido por municípios (malha do IBGE). A correspondência entre a
 * geometria (código IBGE) e o resultado (código TSE) usa o campo `cdi` da lista oficial
 * de municípios do TSE.
 */
export function StateMap({
  uf,
  geometry,
  municipios,
  snapshot,
  election,
  selected,
  onSelect,
  onBack,
  progress,
}: StateMapProps) {
  const info = ufBySigla(uf)!;
  const byIbge = useMemo(() => new Map(municipios.map((m) => [m.ibge, m])), [municipios]);

  const areas = useMemo<GeoMapArea[]>(
    () =>
      geometry.features.flatMap((f) => {
        const m = byIbge.get(String(f.properties.codarea));
        if (!m) return [];
        return [{ id: m.codigo, name: `${titleCase(m.nome)} (${uf})`, feature: f }];
      }),
    [geometry, byIbge, uf],
  );

  const { fills, summaries } = useMemo(() => {
    const fills: Record<string, MapFill> = {};
    const summaries: Record<string, string> = {};
    const [a, b] = election.candidates;
    for (const m of municipios) {
      const entry = snapshot?.entries[m.codigo];
      fills[m.codigo] = entry ? mapFillFor(entry, election) : 'unavailable';
      if (entry?.result) {
        const cmp = compareCandidates(entry.result, election);
        summaries[m.codigo] =
          `${a.displayName} ${formatPct(cmp.pctValidos[a.key])} · ${b.displayName} ${formatPct(cmp.pctValidos[b.key])} · ` +
          `${formatPct(entry.result.progress.percentual)} apurado`;
      }
    }
    return { fills, summaries };
  }, [municipios, snapshot, election]);

  return (
    <GeoMap
      areas={areas}
      fills={fills}
      summaries={summaries}
      selected={selected}
      onSelect={onSelect}
      ariaLabel={`Mapa de ${info.nome} por município. Use a lista de municípios para navegar pelo teclado.`}
      focusable={areas.length <= 60}
      testId="state-map"
      dataAttr="mun"
      maxZoom={24}
      overlay={
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-ink-600 bg-ink-850/95 px-3 py-1.5 text-sm font-medium text-ink-100 hover:bg-ink-700"
          >
            ← Brasil
          </button>
          <span className="rounded-md bg-ink-950/80 px-2 py-0.5 text-xs text-ink-300">
            {info.nome} · {municipios.length} municípios
          </span>
          {progress && progress.done < progress.total && (
            <span
              className="rounded-md bg-ink-950/80 px-2 py-0.5 text-xs text-ink-300 tabular"
              role="status"
            >
              Carregando resultados {progress.done}/{progress.total}
            </span>
          )}
        </div>
      }
    />
  );
}

import type { MapFill } from '../../types/election';

/** Legenda compacta flutuando sobre o mapa, com contagem por cor. */
export function MobileLegend({
  counts,
  unit,
  names,
}: {
  counts: Record<MapFill, number>;
  unit: string;
  names: [string, string];
}) {
  const items: { color: string; label: string; n: number; show: boolean }[] = [
    { color: 'var(--color-lula)', label: names[0], n: counts.lula, show: true },
    { color: 'var(--color-flavio)', label: names[1], n: counts.flavio, show: true },
    { color: 'var(--color-tie)', label: 'Empate', n: counts.tie, show: counts.tie > 0 },
    {
      color: 'var(--color-nodata)',
      label: 'Sem dados',
      n: counts['no-data'] + counts.unavailable,
      show: counts['no-data'] + counts.unavailable > 0,
    },
  ];
  return (
    <ul
      aria-label={`Legenda do mapa (contagem de ${unit})`}
      className="pointer-events-none flex flex-wrap gap-1.5"
      data-testid="mobile-legend"
    >
      {items
        .filter((i) => i.show)
        .map((i) => (
          <li
            key={i.label}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/80 px-2 py-0.5 text-[11px] text-ink-200 backdrop-blur"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: i.color }}
              aria-hidden="true"
            />
            {i.label}
            <span className="font-semibold tabular">{i.n}</span>
          </li>
        ))}
    </ul>
  );
}

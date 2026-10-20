import type { MapFill } from '../../types/election';
import { FILL_COLOR, FILL_LABEL } from './colors';

const ORDER: MapFill[] = ['lula', 'flavio', 'tie', 'no-data', 'unavailable'];

export function MapLegend({ counts }: { counts?: Partial<Record<MapFill, number>> }) {
  return (
    <ul
      aria-label="Legenda do mapa"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-300 sm:text-xs"
    >
      {ORDER.map((f) => (
        <li key={f} className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true">
            <defs>
              <pattern
                id={`legend-hatch-${f}`}
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="4" height="4" fill="var(--color-unavailable)" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="#475569" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect
              width="12"
              height="12"
              rx="2"
              fill={f === 'unavailable' ? `url(#legend-hatch-${f})` : FILL_COLOR[f]}
            />
          </svg>
          <span>
            {FILL_LABEL[f]}
            {counts?.[f] ? <span className="ml-1 text-ink-400 tabular">({counts[f]})</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { featureSigla, type UfFeature, type UfFeatureCollection } from '../../data/geo';
import { ufBySigla, type UfSigla } from '../../data/ufs';
import type { MapFill } from '../../types/election';
import { FILL_COLOR, FILL_LABEL } from './colors';

export interface BrazilMapProps {
  geometry: UfFeatureCollection;
  fills: Partial<Record<UfSigla, MapFill>>;
  /** Texto curto para o tooltip/aria de cada UF (ex.: "Lula 52,1% × 47,9% Flávio"). */
  summaries?: Partial<Record<UfSigla, string>>;
  selected: UfSigla | null;
  onSelect: (uf: UfSigla | null) => void;
}

interface Shape {
  sigla: UfSigla;
  nome: string;
  d: string;
  centroid: [number, number];
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function BrazilMap({ geometry, fills, summaries, selected, onSelect }: BrazilMapProps) {
  const [containerRef, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ uf: UfSigla; x: number; y: number } | null>(null);

  // Dimensões de fallback (testes/jsdom) mantêm a proporção do território.
  const width = size.width || 600;
  const height = size.height || 560;

  const shapes = useMemo<Shape[]>(() => {
    const pad = Math.min(width, height) * 0.03;
    const projection = geoMercator().fitExtent(
      [
        [pad, pad],
        [width - pad, height - pad],
      ],
      geometry,
    );
    const path = geoPath(projection);
    return (geometry.features as UfFeature[]).flatMap((f) => {
      const sigla = featureSigla(f);
      if (!sigla) return [];
      return [
        {
          sigla,
          nome: ufBySigla(sigla)!.nome,
          d: path(f) ?? '',
          centroid: path.centroid(f) as [number, number],
        },
      ];
    });
  }, [geometry, width, height]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .extent([
        [0, 0],
        [width, height],
      ])
      // Filtro padrão do d3-zoom + exige `view` (eventos sintéticos sem janela são ignorados).
      .filter((e: MouseEvent) => (!e.ctrlKey || e.type === 'wheel') && !e.button && e.view != null)
      .on('zoom', (e: { transform: ZoomTransform }) => setTransform(e.transform));
    zoomRef.current = behavior;
    const sel = select(svg);
    sel.call(behavior);
    return () => {
      sel.on('.zoom', null);
    };
  }, [width, height]);

  const zoomBy = (k: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.scaleBy(select(svg), k);
  };
  const resetZoom = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.transform(select(svg), zoomIdentity);
  };

  const ordered = useMemo(() => {
    // A UF selecionada é desenhada por último para que o contorno fique por cima.
    if (!selected) return shapes;
    return [
      ...shapes.filter((s) => s.sigla !== selected),
      ...shapes.filter((s) => s.sigla === selected),
    ];
  }, [shapes, selected]);

  const onKey = (e: KeyboardEvent, uf: UfSigla) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(selected === uf ? null : uf);
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  };

  const hoverShape = hover ? shapes.find((s) => s.sigla === hover.uf) : null;
  const labelSize = Math.max(7, Math.min(12, width / 60)) / transform.k;

  return (
    <div ref={containerRef} className="relative h-full w-full select-none" data-testid="brazil-map">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Mapa do Brasil por unidade federativa. Use Tab para navegar pelos estados e Enter para ver detalhes."
        className="block h-full w-full touch-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <defs>
          <pattern
            id="hatch-unavailable"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--color-unavailable)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#475569" strokeWidth="2" />
          </pattern>
        </defs>
        <g transform={transform.toString()}>
          {ordered.map((s) => {
            const fill = fills[s.sigla] ?? 'unavailable';
            const isSel = s.sigla === selected;
            const summary = summaries?.[s.sigla];
            return (
              <path
                key={s.sigla}
                d={s.d}
                className="uf-path cursor-pointer outline-none"
                fill={FILL_COLOR[fill]}
                fillOpacity={selected && !isSel ? 0.55 : 1}
                stroke={isSel ? '#fbbf24' : '#0b1220'}
                strokeWidth={(isSel ? 2.5 : 0.9) / transform.k}
                strokeLinejoin="round"
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${s.nome} (${s.sigla}): ${FILL_LABEL[fill]}${summary ? `. ${summary}` : ''}`}
                data-uf={s.sigla}
                data-fill={fill}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSel ? null : s.sigla);
                }}
                onKeyDown={(e) => onKey(e, s.sigla)}
                onPointerMove={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  setHover({
                    uf: s.sigla,
                    x: e.clientX - (rect?.left ?? 0),
                    y: e.clientY - (rect?.top ?? 0),
                  });
                }}
                onPointerLeave={() => setHover(null)}
                onFocus={() => {
                  const [cx, cy] = s.centroid;
                  setHover({ uf: s.sigla, x: transform.applyX(cx), y: transform.applyY(cy) });
                }}
                onBlur={() => setHover(null)}
              >
                <title>{`${s.nome} (${s.sigla})`}</title>
              </path>
            );
          })}
          <g aria-hidden="true" className="pointer-events-none">
            {shapes.map((s) => (
              <text
                key={s.sigla}
                x={s.centroid[0]}
                y={s.centroid[1]}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSize}
                fontWeight={600}
                fill="rgba(255,255,255,0.88)"
                stroke="rgba(7,12,23,0.55)"
                strokeWidth={2 / transform.k}
                paintOrder="stroke"
              >
                {s.sigla}
              </text>
            ))}
          </g>
        </g>
      </svg>

      {hover && hoverShape && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-[16rem] -translate-x-1/2 -translate-y-[115%] rounded-md border border-ink-600 bg-ink-950/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="font-semibold text-ink-100">
            {hoverShape.nome} <span className="text-ink-400">({hoverShape.sigla})</span>
          </div>
          <div className="text-ink-300">{FILL_LABEL[fills[hoverShape.sigla] ?? 'unavailable']}</div>
          {summaries?.[hoverShape.sigla] && (
            <div className="mt-0.5 text-ink-300 tabular">{summaries[hoverShape.sigla]}</div>
          )}
        </div>
      )}

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <MapButton label="Aproximar" onClick={() => zoomBy(1.6)}>
          +
        </MapButton>
        <MapButton label="Afastar" onClick={() => zoomBy(1 / 1.6)}>
          −
        </MapButton>
        <MapButton label="Restaurar enquadramento" onClick={resetZoom}>
          ⟲
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-md border border-ink-600 bg-ink-850/90 text-lg leading-none text-ink-100 hover:bg-ink-700"
    >
      {children}
    </button>
  );
}

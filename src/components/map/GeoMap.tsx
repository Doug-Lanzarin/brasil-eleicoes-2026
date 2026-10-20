import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { MapFill } from '../../types/election';
import { FILL_COLOR, FILL_LABEL } from './colors';

export interface GeoMapArea {
  id: string;
  name: string;
  /** Rótulo curto desenhado no centroide (ex.: sigla da UF). */
  label?: string;
  feature: Feature<Polygon | MultiPolygon, GeoJsonProperties>;
}

export interface GeoMapProps {
  areas: GeoMapArea[];
  fills: Record<string, MapFill | undefined>;
  /** Texto curto para tooltip/aria de cada área. */
  summaries?: Record<string, string | undefined>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  ariaLabel: string;
  /** Áreas navegáveis por Tab (desligar quando houver centenas: use a lista acessível). */
  focusable?: boolean;
  testId?: string;
  /** Conteúdo extra sobreposto ao mapa (ex.: botão voltar). */
  overlay?: ReactNode;
  /** Atributo data-* usado para identificar cada área nos testes. */
  dataAttr?: 'uf' | 'mun';
  maxZoom?: number;
  /** Aproxima o mapa na área selecionada (e volta ao enquadramento ao desmarcar). */
  zoomToSelected?: boolean;
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

/** Mapa coroplético em SVG (d3-geo, projeção de Mercator ajustada à área visível). */
export function GeoMap({
  areas,
  fills,
  summaries,
  selected,
  onSelect,
  ariaLabel,
  focusable = true,
  testId,
  overlay,
  dataAttr = 'uf',
  maxZoom = 8,
  zoomToSelected = false,
}: GeoMapProps) {
  const [containerRef, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  // Dimensões de fallback (testes/jsdom) mantêm uma proporção razoável.
  const width = size.width || 600;
  const height = size.height || 560;

  const shapes = useMemo(() => {
    const pad = Math.min(width, height) * 0.03;
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: areas.map((a) => a.feature),
    };
    const projection = geoMercator().fitExtent(
      [
        [pad, pad],
        [width - pad, height - pad],
      ],
      fc,
    );
    const path = geoPath(projection);
    return areas.map((a) => ({
      ...a,
      d: path(a.feature) ?? '',
      centroid: path.centroid(a.feature) as [number, number],
      bounds: path.bounds(a.feature) as [[number, number], [number, number]],
    }));
  }, [areas, width, height]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, maxZoom])
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
    // Novo conjunto de áreas (ex.: troca de estado) volta ao enquadramento inicial.
    behavior.transform(sel, zoomIdentity);
    return () => {
      sel.on('.zoom', null);
    };
  }, [width, height, maxZoom, areas]);

  useEffect(() => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!zoomToSelected || !svg || !behavior) return;
    const shape = selected ? shapes.find((s) => s.id === selected) : null;
    if (!shape) {
      behavior.transform(select(svg), zoomIdentity);
      return;
    }
    const [[x0, y0], [x1, y1]] = shape.bounds;
    // Área ocupando ~60% da tela, centralizada (limitada ao zoom máximo).
    const k = Math.min(maxZoom, 0.6 / Math.max((x1 - x0) / width, (y1 - y0) / height, 1e-6));
    behavior.transform(
      select(svg),
      zoomIdentity
        .translate(width / 2, height / 2)
        .scale(Math.max(1, k))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
    );
  }, [zoomToSelected, selected, shapes, width, height, maxZoom]);

  const zoomBy = (k: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.scaleBy(select(svg), k);
  };
  const resetZoom = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.transform(select(svg), zoomIdentity);
  };

  const ordered = useMemo(() => {
    // A área selecionada é desenhada por último para que o contorno fique por cima.
    if (!selected) return shapes;
    return [...shapes.filter((s) => s.id !== selected), ...shapes.filter((s) => s.id === selected)];
  }, [shapes, selected]);

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(selected === id ? null : id);
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  };

  const hoverShape = hover ? shapes.find((s) => s.id === hover.id) : null;
  const labelSize = Math.max(7, Math.min(12, width / 60)) / transform.k;
  const dense = areas.length > 60;

  return (
    <div ref={containerRef} className="relative h-full w-full select-none" data-testid={testId}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={ariaLabel}
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
            const fill = fills[s.id] ?? 'unavailable';
            const isSel = s.id === selected;
            const summary = summaries?.[s.id];
            const baseStroke = dense ? 0.35 : 0.9;
            return (
              <path
                key={s.id}
                d={s.d}
                className="uf-path cursor-pointer outline-none"
                fill={FILL_COLOR[fill]}
                fillOpacity={selected && !isSel ? 0.6 : 1}
                stroke={isSel ? '#fbbf24' : '#0b1220'}
                strokeWidth={(isSel ? 2.5 : baseStroke) / transform.k}
                strokeLinejoin="round"
                role="button"
                tabIndex={focusable ? 0 : -1}
                aria-pressed={isSel}
                aria-label={`${s.name}: ${FILL_LABEL[fill]}${summary ? `. ${summary}` : ''}`}
                {...{ [`data-${dataAttr}`]: s.id }}
                data-fill={fill}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSel ? null : s.id);
                }}
                onKeyDown={(e) => onKey(e, s.id)}
                onPointerMove={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  setHover({
                    id: s.id,
                    x: e.clientX - (rect?.left ?? 0),
                    y: e.clientY - (rect?.top ?? 0),
                  });
                }}
                onPointerLeave={() => setHover(null)}
                onFocus={() => {
                  const [cx, cy] = s.centroid;
                  setHover({ id: s.id, x: transform.applyX(cx), y: transform.applyY(cy) });
                }}
                onBlur={() => setHover(null)}
              >
                <title>{s.name}</title>
              </path>
            );
          })}
          <g aria-hidden="true" className="pointer-events-none">
            {shapes
              .filter((s) => s.label)
              .map((s) => (
                <text
                  key={s.id}
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
                  {s.label}
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
          <div className="font-semibold text-ink-100">{hoverShape.name}</div>
          <div className="text-ink-300">{FILL_LABEL[fills[hoverShape.id] ?? 'unavailable']}</div>
          {summaries?.[hoverShape.id] && (
            <div className="mt-0.5 text-ink-300 tabular">{summaries[hoverShape.id]}</div>
          )}
        </div>
      )}

      {overlay}

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
  children: ReactNode;
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

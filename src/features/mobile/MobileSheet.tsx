import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

export type SheetSnap = 'peek' | 'half' | 'full';
export interface SheetTab {
  id: string;
  label: string;
}

/** Altura do painel recolhido (cabeçalho + abas), sem contar a área segura inferior. */
export const SHEET_PEEK_PX = 118;
const ORDER: SheetSnap[] = ['peek', 'half', 'full'];

function useViewportHeight() {
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vh;
}

/**
 * Painel inferior do celular: sempre presente, com três alturas (recolhido, metade, tela
 * quase cheia). Arrasta-se pelo cabeçalho (com inércia) ou toca-se na alça para alternar.
 * Tocar numa aba com o painel recolhido o abre até a metade.
 */
export function MobileSheet({
  label,
  snap,
  onSnap,
  header,
  tabs,
  activeTab,
  onTab,
  children,
}: {
  label: string;
  snap: SheetSnap;
  onSnap: (s: SheetSnap) => void;
  header: ReactNode;
  tabs: SheetTab[];
  activeTab: string;
  onTab: (id: string) => void;
  children: ReactNode;
}) {
  const vh = useViewportHeight();
  const heights: Record<SheetSnap, number> = {
    peek: SHEET_PEEK_PX,
    half: Math.max(SHEET_PEEK_PX + 120, Math.round(vh * 0.52)),
    full: Math.max(SHEET_PEEK_PX + 200, vh - 64),
  };
  const [dragH, setDragH] = useState<number | null>(null);
  const gesture = useRef<{ y: number; h: number; t: number; active: boolean; id: number } | null>(
    null,
  );

  const clamp = (h: number) => Math.min(heights.full, Math.max(heights.peek, h));

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    gesture.current = {
      y: e.clientY,
      h: heights[snap],
      t: performance.now(),
      active: false,
      id: e.pointerId,
    };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) < 6) return;
      g.active = true;
      try {
        e.currentTarget.setPointerCapture(g.id);
      } catch {
        // alguns navegadores não suportam captura para este ponteiro
      }
    }
    setDragH(clamp(g.h - dy));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.active) return;
    const h = clamp(g.h - (e.clientY - g.y));
    const velocity = (g.y - e.clientY) / Math.max(1, performance.now() - g.t); // px/ms, + = para cima
    let target: SheetSnap = ORDER.reduce((best, s) =>
      Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best,
    );
    if (Math.abs(velocity) > 0.5) {
      const above = ORDER.filter((s) => heights[s] > h);
      const below = ORDER.filter((s) => heights[s] < h);
      if (velocity > 0 && above.length) target = above[0]!;
      if (velocity < 0 && below.length) target = below[below.length - 1]!;
    }
    setDragH(null);
    onSnap(target);
  };

  const next: SheetSnap = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek';
  const height = dragH ?? heights[snap];

  return (
    <section
      aria-label={label}
      data-testid="mobile-sheet"
      data-snap={snap}
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[22px] border-t border-white/10 bg-ink-900/95 shadow-[0_-12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl ${
        dragH == null ? 'transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
      }`}
      style={{ height: `calc(${height}px + env(safe-area-inset-bottom))` }}
    >
      <div
        className="shrink-0 touch-none select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          gesture.current = null;
          setDragH(null);
        }}
      >
        <button
          type="button"
          onClick={() => onSnap(next)}
          aria-label={snap === 'full' ? 'Recolher painel' : 'Expandir painel'}
          aria-expanded={snap !== 'peek'}
          className="mx-auto flex h-5 w-16 items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-white/25" aria-hidden="true" />
        </button>
        <div className="px-4">{header}</div>
        <div role="tablist" aria-label="Seções" className="mt-2 flex gap-1 px-3">
          {tabs.map((t) => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  onTab(t.id);
                  if (snap === 'peek') onSnap('half');
                }}
                className={`relative flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/10 text-ink-100' : 'text-ink-400 active:bg-white/5'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        aria-label={tabs.find((t) => t.id === activeTab)?.label}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe pt-3"
      >
        {children}
        <div className="h-6" aria-hidden="true" />
      </div>
    </section>
  );
}

import { useEffect, useState, type ReactNode } from 'react';

type SheetSize = 'peek' | 'half' | 'full';
const NEXT: Record<SheetSize, SheetSize> = { peek: 'half', half: 'full', full: 'peek' };
const HEIGHT: Record<SheetSize, string> = {
  peek: 'h-[22dvh]',
  half: 'h-[50dvh]',
  full: 'h-[85dvh]',
};

/**
 * Painel inferior para celular. Abre baixo (só o resumo, sem cobrir o mapa) e pode ser
 * expandido em etapas pelo usuário. Fecha com Esc ou pelo botão do painel.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [size, setSize] = useState<SheetSize>('peek');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900/98 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition-[height] duration-300 pb-safe ${HEIGHT[size]}`}
      data-testid="bottom-sheet"
      data-expanded={size !== 'peek'}
      data-size={size}
    >
      <button
        type="button"
        onClick={() => setSize((v) => NEXT[v])}
        aria-expanded={size !== 'peek'}
        aria-label={size === 'full' ? 'Recolher painel' : 'Expandir painel'}
        className="flex w-full shrink-0 justify-center py-2"
      >
        <span className="h-1.5 w-12 rounded-full bg-ink-600" aria-hidden="true" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-20">{children}</div>
    </div>
  );
}

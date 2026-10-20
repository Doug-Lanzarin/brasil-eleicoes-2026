import { useEffect, useState, type ReactNode } from 'react';

/**
 * Painel inferior para celular. Abre "recolhido" (não cobre o mapa) e pode ser
 * expandido pelo usuário. Fecha com Esc ou pelo botão do painel.
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
  const [expanded, setExpanded] = useState(false);

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
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900/98 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition-[height] duration-300 pb-safe ${
        expanded ? 'h-[78dvh]' : 'h-[38dvh]'
      }`}
      data-testid="bottom-sheet"
      data-expanded={expanded}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Recolher painel' : 'Expandir painel'}
        className="flex w-full shrink-0 justify-center py-2"
      >
        <span className="h-1.5 w-12 rounded-full bg-ink-600" aria-hidden="true" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-20">{children}</div>
    </div>
  );
}

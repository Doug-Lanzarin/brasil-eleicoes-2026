import { useEffect, useState } from 'react';

/** Aviso de nova versão / pronto para uso offline (service worker). */
export function PwaStatus() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const fn = registerSW({
        onNeedRefresh: () => setNeedRefresh(true),
        onOfflineReady: () => setOfflineReady(true),
      });
      setUpdate(() => fn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-lg lg:bottom-4"
    >
      <span>{needRefresh ? 'Nova versão disponível.' : 'Aplicativo pronto para uso offline.'}</span>
      {needRefresh && (
        <button
          type="button"
          className="rounded bg-ink-100 px-2 py-1 font-semibold text-ink-900"
          onClick={() => void update?.(true)}
        >
          Atualizar
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar aviso"
        className="text-ink-400"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        ✕
      </button>
    </div>
  );
}

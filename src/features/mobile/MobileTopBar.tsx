import { appConfig } from '../../data/appConfig';
import type { ElectionDataState } from '../../services/electionStore';
import { formatAge } from '../../utils/dates';
import { deriveFreshness, type Freshness } from '../../utils/status';

const PILL: Record<Freshness, { dot: string; text: string }> = {
  loading: { dot: 'bg-ink-400 animate-pulse', text: 'Carregando' },
  updating: { dot: 'bg-sky-400 animate-pulse', text: 'Atualizando' },
  fresh: { dot: 'bg-emerald-400', text: 'Ao vivo' },
  stale: { dot: 'bg-amber-400', text: 'Desatualizado' },
  error: { dot: 'bg-rose-400', text: 'Falha' },
  offline: { dot: 'bg-rose-400', text: 'Offline' },
  'not-published': { dot: 'bg-ink-400', text: 'Não publicado' },
};

/** Barra superior compacta: identidade, turno em foco e estado da atualização (toque atualiza). */
export function MobileTopBar({
  subtitle,
  state,
  now,
  onRefresh,
  onSearch,
}: {
  subtitle: string;
  state: ElectionDataState;
  now: number;
  onRefresh: () => void;
  onSearch: () => void;
}) {
  const fresh = deriveFreshness(state, now, appConfig.staleAfterSeconds);
  const pill = PILL[fresh];
  const age = state.lastSuccessAt ? formatAge(state.lastSuccessAt, now).replace('há ', '') : null;
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 px-3" data-testid="mobile-topbar">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[16px] font-bold leading-tight tracking-tight">
          Apuração 2026
        </h1>
        <p className="truncate text-[11px] leading-tight text-ink-400">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={state.poller.inFlight}
        data-testid="status-bar"
        data-freshness={fresh}
        aria-label={`${pill.text}${age ? `, atualizado há ${age}` : ''}. Toque para atualizar.`}
        className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-[12px] text-ink-200 active:bg-white/10"
      >
        <span className={`h-2 w-2 rounded-full ${pill.dot}`} aria-hidden="true" />
        <span className="font-medium">{pill.text}</span>
        {age && fresh !== 'loading' && <span className="text-ink-400 tabular">· {age}</span>}
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Buscar estado ou cidade"
        className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-ink-200 active:bg-white/10"
      >
        <SearchIcon />
      </button>
    </header>
  );
}

export function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

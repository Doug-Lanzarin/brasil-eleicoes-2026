import { appConfig } from '../data/appConfig';
import type { ElectionDataState } from '../services/electionStore';
import { formatAge, formatBrasilia } from '../utils/dates';
import { deriveFreshness, FRESHNESS_LABEL, type Freshness } from '../utils/status';

const DOT: Record<Freshness, string> = {
  loading: 'bg-ink-400 animate-pulse',
  updating: 'bg-sky-400 animate-pulse',
  fresh: 'bg-emerald-400',
  stale: 'bg-amber-400',
  error: 'bg-rose-400',
  offline: 'bg-rose-400',
  'not-published': 'bg-ink-400',
};

export function StatusBar({
  state,
  now,
  onRefresh,
}: {
  state: ElectionDataState;
  now: number;
  onRefresh: () => void;
}) {
  const fresh = deriveFreshness(state, now, appConfig.staleAfterSeconds);
  const next = state.poller.nextRunAt;
  const secondsToNext = next ? Math.max(0, Math.ceil((next - now) / 1000)) : null;
  const canRefresh = !state.poller.inFlight;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300"
      role="status"
      aria-live="polite"
      data-testid="status-bar"
      data-freshness={fresh}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-ink-100">
        <span className={`h-2 w-2 rounded-full ${DOT[fresh]}`} aria-hidden="true" />
        {FRESHNESS_LABEL[fresh]}
      </span>
      {state.lastSuccessAt && (
        <span className="tabular" title={formatBrasilia(state.lastSuccessAt)}>
          Última atualização: {formatBrasilia(state.lastSuccessAt)} (
          {formatAge(state.lastSuccessAt, now)})
        </span>
      )}
      {secondsToNext != null && !state.poller.inFlight && (
        <span className="tabular text-ink-400">próxima consulta em {secondsToNext}s</span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={!canRefresh}
        className="rounded border border-ink-600 px-2 py-0.5 text-ink-200 hover:bg-ink-700 disabled:opacity-50"
        title={`Consultas respeitam o intervalo mínimo de 30 s`}
      >
        Atualizar
      </button>
    </div>
  );
}

/** Avisos de destaque: offline, dados antigos, falha, não publicado. */
export function DataNotices({ state, now }: { state: ElectionDataState; now: number }) {
  const fresh = deriveFreshness(state, now, appConfig.staleAfterSeconds);
  const when = state.lastSuccessAt
    ? `${formatBrasilia(state.lastSuccessAt)} (${formatAge(state.lastSuccessAt, now)})`
    : null;
  let msg: string | null = null;
  let tone = 'border-amber-500/40 bg-amber-500/10 text-amber-100';
  if (fresh === 'offline') {
    msg = when
      ? `Você está sem conexão. Os números exibidos são os últimos dados disponíveis, obtidos em ${when}.`
      : 'Você está sem conexão e não há dados salvos neste dispositivo.';
    tone = 'border-rose-500/40 bg-rose-500/10 text-rose-100';
  } else if (fresh === 'error') {
    msg = when
      ? `A última atualização não foi concluída (${state.lastError}). Exibindo os dados válidos de ${when}. Nova tentativa automática em breve.`
      : `Não foi possível obter os dados do TSE (${state.lastError}). Nova tentativa automática em breve.`;
    tone = 'border-rose-500/40 bg-rose-500/10 text-rose-100';
  } else if (fresh === 'stale' && when) {
    msg =
      state.source === 'persisted'
        ? `Exibindo dados salvos neste dispositivo, obtidos em ${when}. Aguardando nova consulta ao TSE.`
        : `Os dados podem estar desatualizados: a última consulta bem-sucedida foi em ${when}.`;
  } else if (fresh === 'not-published') {
    msg =
      'Os resultados deste turno ainda não foram publicados pelo TSE. A página continuará consultando automaticamente e exibirá os números assim que forem divulgados.';
    tone = 'border-ink-600 bg-ink-800 text-ink-200';
  }
  if (!msg) return null;
  return (
    <div role="alert" className={`rounded-md border px-3 py-2 text-xs sm:text-sm ${tone}`}>
      {msg}
    </div>
  );
}

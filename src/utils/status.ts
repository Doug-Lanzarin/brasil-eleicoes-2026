import type { ElectionDataState } from '../services/electionStore';

export type Freshness =
  'loading' | 'updating' | 'fresh' | 'stale' | 'error' | 'offline' | 'not-published';

/** Estado da atualização dos dados, independente do andamento da apuração. */
export function deriveFreshness(
  state: ElectionDataState,
  now: number,
  staleAfterSeconds: number,
): Freshness {
  if (!state.snapshot) {
    if (state.notPublished) return 'not-published';
    if (state.poller.offline) return 'offline';
    if (state.lastError && !state.poller.inFlight) return 'error';
    return 'loading';
  }
  if (state.poller.inFlight) return 'updating';
  if (state.poller.offline) return 'offline';
  if (state.lastError) return 'error';
  const age = state.lastSuccessAt ? (now - Date.parse(state.lastSuccessAt)) / 1000 : Infinity;
  if (state.source === 'persisted' || age > staleAfterSeconds) return 'stale';
  return 'fresh';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  loading: 'Carregando',
  updating: 'Atualizando…',
  fresh: 'Dados atualizados',
  stale: 'Dados desatualizados',
  error: 'Falha temporária',
  offline: 'Sem conexão',
  'not-published': 'Ainda não publicado',
};

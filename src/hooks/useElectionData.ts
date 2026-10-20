import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { appConfig } from '../data/appConfig';
import { ElectionStore } from '../services/electionStore';
import type { ElectionConfig, RoundConfig } from '../types/election';

/**
 * Cria (um por turno) o store de dados e inicia o poller.
 * Trocar de turno descarta o store anterior — inclusive cancelando a requisição em curso —
 * e nenhum dado do turno anterior é reaproveitado.
 */
export function useElectionData(
  election: ElectionConfig,
  round: RoundConfig,
  factory: (election: ElectionConfig, round: RoundConfig) => ElectionStore = defaultFactory,
) {
  const store = useMemo(() => factory(election, round), [factory, election, round]);

  useEffect(() => {
    store.start();
    const onOnline = () => store.refreshNow();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      store.stop();
    };
  }, [store]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { state, store };
}

function defaultFactory(election: ElectionConfig, round: RoundConfig) {
  return new ElectionStore({
    base: appConfig.tseBaseUrl,
    election,
    round,
    refreshSeconds: appConfig.refreshSeconds,
    persistedMaxAgeDays: appConfig.persistedMaxAgeDays,
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  });
}

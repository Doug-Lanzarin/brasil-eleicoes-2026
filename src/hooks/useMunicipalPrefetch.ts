import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appConfig } from '../data/appConfig';
import { ufByTse } from '../data/ufs';
import {
  connectionAllowsPrefetch,
  MunicipalPrefetcher,
  type PrefetchStatus,
} from '../services/prefetch';
import type { MunicipalSnapshot } from '../services/tse/municipal';
import type { ElectionConfig, ElectionSnapshot, RoundConfig } from '../types/election';
import { municipiosConfigQuery } from './useMunicipal';

const PREF_KEY = 'brasil-eleitoral:prefetch-municipios';

function readPref(): boolean | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

/**
 * Pré-carrega em segundo plano os resultados municipais de todas as UFs (ver
 * services/prefetch.ts). Começa depois que o painel nacional carregou; pausa com a aba
 * oculta ou sem conexão; respeita a preferência do usuário (salva no aparelho).
 */
export function useMunicipalPrefetch(
  election: ElectionConfig,
  round: RoundConfig,
  openUfTse: string | null,
  national: ElectionSnapshot | null,
) {
  const queryClient = useQueryClient();
  const connection = connectionAllowsPrefetch();
  const [enabled, setEnabledState] = useState<boolean>(() => readPref() ?? connection.allowed);
  const [status, setStatus] = useState<PrefetchStatus | null>(null);
  const openRef = useRef(openUfTse);
  const nationalRef = useRef(national);
  useEffect(() => {
    openRef.current = openUfTse;
    nationalRef.current = national;
  });
  const ready = !!national;

  useEffect(() => {
    if (!enabled || !ready) return;
    const p = new MunicipalPrefetcher({
      base: appConfig.tseBaseUrl,
      election,
      round,
      maxAgeDays: appConfig.persistedMaxAgeDays,
      getMunicipios: () => queryClient.fetchQuery(municipiosConfigQuery(election, round)),
      getOpenUf: () => openRef.current,
      isUfFinalized: (uf) => {
        const sigla = ufByTse(uf)?.sigla;
        return (
          !!sigla && nationalRef.current?.states[sigla]?.result?.progress.status === 'finalizada'
        );
      },
      onSnapshot: (uf, snap) => {
        const key = ['tse', 'mu-uf', round.codigoEleicao, uf];
        const cur = queryClient.getQueryData<MunicipalSnapshot>(key);
        if (uf !== openRef.current && (!cur || cur.fetchedAt <= snap.fetchedAt)) {
          queryClient.setQueryData(key, snap);
        }
      },
      onStatus: setStatus,
    });
    const onVisibility = () =>
      document.visibilityState === 'hidden'
        ? p.pause('aba em segundo plano')
        : p.resume('aba em segundo plano');
    const onOffline = () => p.pause('sem conexão');
    const onOnline = () => p.resume('sem conexão');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) p.pause('sem conexão');
    if (document.visibilityState === 'hidden') p.pause('aba em segundo plano');
    // Pequena espera: deixa o painel e o mapa terminarem de carregar primeiro.
    const t = setTimeout(() => p.start(), 3_000);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      p.stop();
    };
  }, [enabled, ready, election, round, queryClient]);

  const setEnabled = useCallback((v: boolean) => {
    try {
      localStorage.setItem(PREF_KEY, v ? 'on' : 'off');
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
    setEnabledState(v);
  }, []);

  return { enabled, setEnabled, status: enabled && ready ? status : null, connection };
}

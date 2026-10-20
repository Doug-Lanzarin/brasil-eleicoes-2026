import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { appConfig } from '../data/appConfig';
import { loadMunicipalCache, saveMunicipalCache } from '../services/municipalCache';
import { parseMunicipiosConfig } from '../services/tse/adapter';
import { fetchTseJson } from '../services/tse/client';
import {
  loadMunicipalSnapshot,
  type MunicipalEntry,
  type MunicipalSnapshot,
} from '../services/tse/municipal';
import { municipiosConfigUrl, type PathContext } from '../services/tse/paths';
import type { ElectionConfig, RoundConfig } from '../types/election';

export function pathContext(election: ElectionConfig, round: RoundConfig): PathContext {
  return {
    base: appConfig.tseBaseUrl,
    ciclo: election.ciclo,
    codigoEleicao: round.codigoEleicao,
    cargo: election.cargo,
  };
}

/** Consulta da lista oficial de municípios (compartilhada com o pré-carregamento). */
export function municipiosConfigQuery(election: ElectionConfig, round: RoundConfig) {
  const ctx = pathContext(election, round);
  return {
    queryKey: ['tse', 'cm', round.codigoEleicao],
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      parseMunicipiosConfig(await fetchTseJson(municipiosConfigUrl(ctx), { signal })),
    staleTime: 60 * 60 * 1000,
  };
}

/** Lista oficial de municípios (muda raramente). */
export function useMunicipiosConfig(
  election: ElectionConfig,
  round: RoundConfig,
  enabled: boolean,
) {
  return useQuery({ ...municipiosConfigQuery(election, round), enabled });
}

/**
 * Resultados municipais da UF aberta, atualizados no mesmo intervalo do painel (≥ 30 s).
 *
 * - Mostra na hora o que estiver salvo no aparelho (IndexedDB) e o que já estiver em memória.
 * - Cada ciclo só baixa os municípios cujo andamento mudou (o salvo serve de "anterior").
 * - O progresso parcial é salvo a cada poucos segundos: sair no meio não perde o trabalho.
 * - O TanStack Query não sobrepõe execuções da mesma chave.
 */
export function useMunicipalResults(
  election: ElectionConfig,
  round: RoundConfig,
  uf: string | null,
) {
  const queryClient = useQueryClient();
  const cm = useMunicipiosConfig(election, round, !!uf);
  const municipios = uf ? cm.data?.get(uf) : undefined;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [partial, setPartial] = useState<{
    key: string;
    entries: Record<string, MunicipalEntry>;
  } | null>(null);
  const key = ['tse', 'mu-uf', round.codigoEleicao, uf];
  const partialKey = `${round.codigoEleicao}:${uf}`;

  const cached = useQuery({
    queryKey: ['municipal-cache', round.codigoEleicao, uf],
    queryFn: () =>
      loadMunicipalCache(
        {
          electionId: election.id,
          codigoEleicao: round.codigoEleicao,
          turno: round.turno,
          uf: uf!,
        },
        appConfig.persistedMaxAgeDays,
      ),
    enabled: !!uf,
    staleTime: Infinity,
    gcTime: 0,
  });

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const previous =
        queryClient.getQueryData<MunicipalSnapshot>(key) ?? cached.data?.snapshot ?? null;
      let lastSave = Date.now();
      const snap = await loadMunicipalSnapshot({
        base: appConfig.tseBaseUrl,
        election,
        round,
        uf: uf!,
        municipios: municipios!,
        previous,
        signal,
        onProgress: (done, total) => setProgress({ done, total }),
        onPartial: (entries) => {
          setPartial({ key: partialKey, entries });
          // Salva o progresso parcial (mesclado ao anterior) no máximo a cada 5 s.
          if (Date.now() - lastSave > 5_000) {
            lastSave = Date.now();
            void saveMunicipalCache(
              {
                electionId: election.id,
                turno: round.turno,
                codigoEleicao: round.codigoEleicao,
                uf: uf!,
                entries: { ...(previous?.entries ?? {}), ...entries },
                fetchedAt: new Date().toISOString(),
              },
              election,
            );
          }
        },
      });
      setProgress(null);
      setPartial(null);
      void saveMunicipalCache(snap, election);
      return snap;
    },
    enabled: !!uf && !!municipios && cached.isFetched,
    refetchInterval: appConfig.refreshSeconds * 1000,
    refetchIntervalInBackground: false,
    staleTime: appConfig.refreshSeconds * 1000,
    // Mantém em memória ao trocar de estado e voltar.
    gcTime: 60 * 60 * 1000,
  });

  const base = query.data ?? cached.data?.snapshot ?? null;
  // O que já chegou no ciclo atual é aplicado por cima (o mapa vai se atualizando).
  const livePartial = partial && partial.key === partialKey ? partial.entries : null;
  const snapshot: MunicipalSnapshot | null =
    livePartial || base
      ? {
          electionId: election.id,
          turno: round.turno,
          codigoEleicao: round.codigoEleicao,
          uf: uf!,
          entries: { ...(base?.entries ?? {}), ...(livePartial ?? {}) },
          fetchedAt: base?.fetchedAt ?? new Date(0).toISOString(),
        }
      : null;

  return {
    snapshot,
    /** Origem do que está na tela: rede (ciclo concluído) ou dados salvos no aparelho. */
    source: query.data ? ('network' as const) : cached.data ? ('cache' as const) : null,
    /** Momento em que os dados salvos foram gravados (quando a origem é o cache). */
    cachedAt: !query.data && cached.data ? cached.data.savedAt : null,
    isLoading: !!uf && (cm.isLoading || (!base && !livePartial)),
    isFetching: query.isFetching,
    error: cm.error ?? query.error,
    progress,
    municipios: municipios ?? [],
  };
}

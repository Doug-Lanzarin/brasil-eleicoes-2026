import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { appConfig } from '../data/appConfig';
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

/** Lista oficial de municípios (muda raramente). */
export function useMunicipiosConfig(
  election: ElectionConfig,
  round: RoundConfig,
  enabled: boolean,
) {
  const ctx = pathContext(election, round);
  return useQuery({
    queryKey: ['tse', 'cm', round.codigoEleicao],
    queryFn: async ({ signal }) =>
      parseMunicipiosConfig(await fetchTseJson(municipiosConfigUrl(ctx), { signal })),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Resultados municipais da UF aberta, atualizados no mesmo intervalo do painel (≥ 30 s).
 * O TanStack Query não sobrepõe execuções da mesma chave; a cada ciclo só os municípios
 * com andamento alterado são baixados novamente.
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

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const snap = await loadMunicipalSnapshot({
        base: appConfig.tseBaseUrl,
        election,
        round,
        uf: uf!,
        municipios: municipios!,
        previous: queryClient.getQueryData<MunicipalSnapshot>(key),
        signal,
        onProgress: (done, total) => setProgress({ done, total }),
        onPartial: (entries) => setPartial({ key: `${round.codigoEleicao}:${uf}`, entries }),
      });
      setProgress(null);
      setPartial(null);
      return snap;
    },
    enabled: !!uf && !!municipios,
    refetchInterval: appConfig.refreshSeconds * 1000,
    refetchIntervalInBackground: false,
    staleTime: appConfig.refreshSeconds * 1000,
  });

  // Antes do primeiro ciclo completo, mostra o que já chegou (o mapa vai se preenchendo).
  const partialSnapshot: MunicipalSnapshot | null =
    !query.data && partial && partial.key === `${round.codigoEleicao}:${uf}`
      ? {
          electionId: election.id,
          turno: round.turno,
          codigoEleicao: round.codigoEleicao,
          uf: uf!,
          entries: partial.entries,
          fetchedAt: new Date(0).toISOString(),
        }
      : null;

  return {
    snapshot: query.data ?? partialSnapshot,
    isLoading: !!uf && (cm.isLoading || query.isLoading),
    isFetching: query.isFetching,
    error: cm.error ?? query.error,
    progress,
    municipios: municipios ?? [],
  };
}

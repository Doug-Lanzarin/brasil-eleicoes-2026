import { useQuery } from '@tanstack/react-query';
import { appConfig } from '../data/appConfig';
import { fetchTseJson } from '../services/tse/client';
import { validarZonasArquivo } from '../services/zonas/aggregate';
import type { RoundConfig } from '../types/election';

/**
 * Resultados por zona de uma UF (arquivo gerado pelo processo de zonas).
 * Atualiza a cada intervalo do painel (≥ 30 s); rejeita arquivos de outro turno/UF.
 */
export function useZonas(round: RoundConfig, ufTse: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['zonas', round.codigoEleicao, ufTse],
    queryFn: async ({ signal }) =>
      validarZonasArquivo(
        await fetchTseJson(`${appConfig.zonasBaseUrl}/${round.codigoEleicao}/${ufTse}.json`, {
          signal,
          limiter: null, // não é o servidor do TSE
        }),
        { eleicao: round.codigoEleicao, turno: round.turno, uf: ufTse! },
      ),
    enabled: enabled && !!ufTse,
    refetchInterval: Math.max(60, appConfig.refreshSeconds) * 1000,
    staleTime: appConfig.refreshSeconds * 1000,
  });
}

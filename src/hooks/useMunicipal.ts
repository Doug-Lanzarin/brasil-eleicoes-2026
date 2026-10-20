import { useQuery } from '@tanstack/react-query';
import { appConfig } from '../data/appConfig';
import { parseAbrangencia, parseMunicipiosConfig, parseResultado } from '../services/tse/adapter';
import { fetchTseJson } from '../services/tse/client';
import { TseError } from '../services/tse/errors';
import {
  abrangenciaUrl,
  municipiosConfigUrl,
  resultUrl,
  type PathContext,
} from '../services/tse/paths';
import type { AreaResult, ElectionConfig, RoundConfig } from '../types/election';

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

/** Andamento por município de uma UF. Atualiza no mesmo intervalo (≥ 30 s) do painel. */
export function useMunicipiosAndamento(
  election: ElectionConfig,
  round: RoundConfig,
  uf: string,
  enabled: boolean,
) {
  const ctx = pathContext(election, round);
  return useQuery({
    queryKey: ['tse', 'ab', round.codigoEleicao, uf],
    queryFn: async ({ signal }) =>
      parseAbrangencia(
        await fetchTseJson(abrangenciaUrl(ctx, uf), { signal }),
        round.codigoEleicao,
        round.turno,
      ),
    enabled,
    refetchInterval: appConfig.refreshSeconds * 1000,
    staleTime: appConfig.refreshSeconds * 1000,
  });
}

export type MunicipioResultMap = Map<string, AreaResult | TseError>;

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

/**
 * Resultados de todos os municípios de uma UF (um arquivo por município).
 * Carregado somente por ação explícita do usuário e sem atualização automática,
 * para não multiplicar consultas ao TSE.
 */
export function useMunicipiosResultados(
  election: ElectionConfig,
  round: RoundConfig,
  uf: string,
  codigos: string[],
  enabled: boolean,
) {
  const ctx = pathContext(election, round);
  return useQuery({
    queryKey: ['tse', 'mu-all', round.codigoEleicao, uf, codigos.length],
    queryFn: async ({ signal }) => {
      const out: MunicipioResultMap = new Map();
      await mapLimit(codigos, 4, async (cod) => {
        try {
          const raw = await fetchTseJson(resultUrl(ctx, uf, cod), { signal });
          out.set(
            cod,
            parseResultado(raw, {
              codigoEleicao: round.codigoEleicao,
              turno: round.turno,
              cargo: election.cargo,
              tipo: 'mu',
              codigo: cod,
            }),
          );
        } catch (e) {
          if (e instanceof TseError && e.kind === 'aborted') throw e;
          out.set(cod, e instanceof TseError ? e : new TseError('invalid-data', String(e)));
        }
      });
      return out;
    },
    enabled: enabled && codigos.length > 0,
    staleTime: appConfig.refreshSeconds * 1000,
    refetchInterval: false,
  });
}

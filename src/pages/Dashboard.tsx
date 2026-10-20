import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { KpiStrip } from '../components/KpiStrip';
import { BrazilMap } from '../components/map/BrazilMap';
import { StateMap } from '../components/map/StateMap';
import { MapLegend } from '../components/map/MapLegend';
import { NationalPanel } from '../components/NationalPanel';
import { PwaStatus } from '../components/PwaStatus';
import { StateDetail } from '../components/StateDetail';
import { StateList } from '../components/StateList';
import { DataNotices, StatusBar } from '../components/StatusBar';
import { appConfig, isOfficialSource } from '../data/appConfig';
import { pruneMunicipalCache } from '../services/municipalCache';
import { ELECTIONS, getElection, getRound } from '../data/elections';
import { UFS, ufBySigla, type UfSigla } from '../data/ufs';
import {
  AbrangenciaSelect,
  ElectionSelect,
  TurnoSwitch,
} from '../features/election/ElectionControls';
import { useSelection } from '../features/election/useSelection';
import { useElectionData } from '../hooks/useElectionData';
import { useMunicipalGeometry, useUfGeometry } from '../hooks/useGeometry';
import { useMunicipalResults } from '../hooks/useMunicipal';
import { useMunicipalPrefetch } from '../hooks/useMunicipalPrefetch';
import { PrefetchIndicator } from '../components/PrefetchIndicator';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useNow } from '../hooks/useNow';
import type { ElectionStore } from '../services/electionStore';
import type { ElectionConfig, MapFill, RoundConfig } from '../types/election';
import { compareCandidates, countStatesByFill, mapFillFor } from '../utils/calc';
import { formatPct } from '../utils/format';

export interface DashboardProps {
  storeFactory?: (election: ElectionConfig, round: RoundConfig) => ElectionStore;
}

export function Dashboard({ storeFactory }: DashboardProps) {
  const [sel, setSel] = useSelection();
  const election = getElection(sel.electionId) ?? ELECTIONS[0]!;
  const round = getRound(election, sel.turno) ?? election.rounds[0]!;
  const { state, store } = useElectionData(election, round, storeFactory);
  const now = useNow();
  const geometry = useUfGeometry();
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const queryClient = useQueryClient();
  const snapshot = state.snapshot;
  const ufTse = sel.uf ? ufBySigla(sel.uf)!.tse : null;
  const municipal = useMunicipalResults(election, round, ufTse);
  const munGeometry = useMunicipalGeometry(ufTse);
  const prefetch = useMunicipalPrefetch(election, round, ufTse, snapshot);

  // Remove do aparelho resultados municipais expirados.
  useEffect(() => {
    void pruneMunicipalCache(appConfig.persistedMaxAgeDays);
  }, []);

  // Ao trocar de turno, descarta caches municipais de outros turnos.
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (q) => q.queryKey[0] === 'tse' && q.queryKey[2] !== round.codigoEleicao,
    });
  }, [queryClient, round.codigoEleicao]);

  const fills = useMemo(() => {
    const out: Partial<Record<UfSigla, MapFill>> = {};
    for (const u of UFS) out[u.sigla] = mapFillFor(snapshot?.states[u.sigla], election);
    return out;
  }, [snapshot, election]);

  const summaries = useMemo(() => {
    const out: Partial<Record<UfSigla, string>> = {};
    const [a, b] = election.candidates;
    for (const u of UFS) {
      const r = snapshot?.states[u.sigla]?.result;
      if (!r) continue;
      const cmp = compareCandidates(r, election);
      out[u.sigla] =
        `${a.displayName} ${formatPct(cmp.pctValidos[a.key])} · ${b.displayName} ${formatPct(cmp.pctValidos[b.key])} · ` +
        `${formatPct(r.progress.percentual)} apurado`;
    }
    return out;
  }, [snapshot, election]);

  const counts = useMemo(
    () => countStatesByFill(snapshot?.states ?? {}, election),
    [snapshot, election],
  );
  const munCounts = useMemo(
    () => countStatesByFill(municipal.snapshot?.entries ?? {}, election),
    [municipal.snapshot, election],
  );

  // Municípios da lista oficial sem polígono na malha do IBGE (ex.: criados recentemente).
  const missingGeometry = useMemo(() => {
    if (!munGeometry.data) return undefined;
    const ibge = new Set(munGeometry.data.features.map((f) => String(f.properties.codarea)));
    return new Set(municipal.municipios.filter((m) => !ibge.has(m.ibge)).map((m) => m.codigo));
  }, [munGeometry.data, municipal.municipios]);

  const selectUf = useCallback((uf: UfSigla | null) => setSel({ uf }), [setSel]);
  const closeUf = useCallback(() => setSel({ uf: null }), [setSel]);
  const selectMun = useCallback((mun: string | null) => setSel({ mun }), [setSel]);

  const detail = sel.uf ? (
    <StateDetail
      uf={sel.uf}
      snapshot={snapshot}
      election={election}
      round={round}
      municipal={{ ...municipal, missingGeometry }}
      selectedMun={sel.mun}
      onSelectMun={selectMun}
      onClose={closeUf}
    />
  ) : null;

  const stateResult = sel.uf ? (snapshot?.states[sel.uf]?.result ?? null) : null;

  const nationalBody = snapshot ? (
    <NationalPanel snapshot={snapshot} election={election} counts={counts} compact={isDesktop} />
  ) : (
    <NationalPlaceholder
      state={state.notPublished ? 'not-published' : state.lastError ? 'error' : 'loading'}
    />
  );

  return (
    <div className="flex min-h-full flex-col pt-safe">
      {!isOfficialSource && (
        <div
          role="alert"
          className="bg-fuchsia-700 px-3 py-1 text-center text-xs font-semibold text-white"
        >
          MODO DE TESTE — dados simulados (fixtures), não são resultados oficiais do TSE.
        </div>
      )}
      <header className="border-b border-ink-800 bg-ink-950/60 px-safe py-2 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight sm:text-lg">
              Brasil Eleitoral{' '}
              <span className="font-normal text-ink-400">· Apuração {election.cargoLabel}</span>
            </h1>
            <p className="text-[11px] text-ink-400">
              {election.label} · {round.label} · Fonte: TSE (arquivos oficiais de divulgação)
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <ElectionSelect
              electionId={election.id}
              onChange={(id) => setSel({ electionId: id })}
            />
            <TurnoSwitch
              election={election}
              turno={round.turno}
              onChange={(t) => setSel({ turno: t })}
            />
            <AbrangenciaSelect uf={sel.uf} onChange={selectUf} className="w-56" />
          </div>
        </div>
        <div className="mt-1.5">
          <StatusBar state={state} now={now} onRefresh={() => store.refreshNow()} />
        </div>
      </header>

      <main className="flex-1 px-safe py-3 pb-28 lg:px-6 lg:pb-6">
        <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-3">
            <DataNotices state={state} now={now} />
            <KpiStrip
              result={sel.uf ? stateResult : (snapshot?.national ?? null)}
              election={election}
              scope={sel.uf ?? undefined}
            />
            <div className="relative h-[56dvh] min-h-[320px] overflow-hidden rounded-xl border border-ink-800 bg-ink-950/40 lg:h-[calc(100dvh-260px)] lg:min-h-[520px]">
              {sel.uf ? (
                munGeometry.data && municipal.municipios.length > 0 ? (
                  <StateMap
                    uf={sel.uf}
                    geometry={munGeometry.data}
                    municipios={municipal.municipios}
                    snapshot={municipal.snapshot}
                    election={election}
                    selected={sel.mun}
                    onSelect={selectMun}
                    onBack={closeUf}
                    progress={municipal.progress}
                    source={municipal.source}
                    cachedAt={municipal.cachedAt}
                  />
                ) : (
                  <div className="grid h-full place-content-center justify-items-center gap-2 text-sm text-ink-400">
                    <span role="status">
                      {munGeometry.isError || municipal.error
                        ? 'Não foi possível carregar os municípios.'
                        : `Carregando municípios de ${ufBySigla(sel.uf)?.nome}…`}
                    </span>
                    <button
                      type="button"
                      onClick={closeUf}
                      className="rounded-md border border-ink-600 px-3 py-1.5 text-ink-200 hover:bg-ink-700"
                    >
                      ← Brasil
                    </button>
                  </div>
                )
              ) : geometry.data ? (
                <BrazilMap
                  geometry={geometry.data}
                  fills={fills}
                  summaries={summaries}
                  selected={sel.uf}
                  onSelect={selectUf}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-ink-400">
                  {geometry.isError ? 'Não foi possível carregar o mapa.' : 'Carregando mapa…'}
                </div>
              )}
              {!sel.uf && snapshot?.exterior?.result && (
                <ExteriorBadge snapshot={snapshot} election={election} />
              )}
            </div>
            <MapLegend counts={sel.uf ? munCounts : counts} unit={sel.uf ? 'municípios' : 'UFs'} />
            <PrefetchIndicator
              enabled={prefetch.enabled}
              setEnabled={prefetch.setEnabled}
              status={prefetch.status}
              connection={prefetch.connection}
              now={now}
            />
          </div>

          <aside className="min-w-0 space-y-4 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto lg:pr-1">
            {isDesktop && detail ? (
              <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">{detail}</div>
            ) : (
              <div className="rounded-xl border border-ink-800 bg-ink-900 p-4">{nationalBody}</div>
            )}
            <details
              className="group rounded-xl border border-ink-800 bg-ink-900 p-3"
              open={isDesktop}
            >
              <summary className="cursor-pointer text-sm font-semibold text-ink-200">
                Resultado por estado (lista acessível)
              </summary>
              <div className="mt-2">
                <StateList
                  snapshot={snapshot}
                  election={election}
                  selected={sel.uf}
                  onSelect={selectUf}
                />
              </div>
            </details>
            <p className="text-[11px] leading-relaxed text-ink-400">
              Cores: comparação exclusiva entre os votos oficiais de{' '}
              {election.candidates[0].displayName} e {election.candidates[1].displayName} em cada
              UF. Percentuais calculados sobre os votos válidos. Totais nacionais incluem votos no
              exterior e todos os candidatos. A apuração é considerada parcial até que o TSE indique
              a totalização finalizada.
            </p>
          </aside>
        </div>
      </main>

      {!isDesktop && (
        <>
          <BottomSheet
            open={!!sel.uf}
            title={sel.uf ? `Detalhes de ${ufBySigla(sel.uf)?.nome}` : ''}
            onClose={closeUf}
          >
            {detail}
          </BottomSheet>
          <nav
            aria-label="Controles da eleição"
            className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-ink-700 bg-ink-950/95 px-safe py-2 pb-safe backdrop-blur"
          >
            <TurnoSwitch
              election={election}
              turno={round.turno}
              onChange={(t) => setSel({ turno: t })}
              className="flex-1"
            />
            <AbrangenciaSelect uf={sel.uf} onChange={selectUf} className="w-[44%]" />
          </nav>
        </>
      )}
      <PwaStatus />
    </div>
  );
}

function NationalPlaceholder({ state }: { state: 'loading' | 'error' | 'not-published' }) {
  const msg =
    state === 'not-published'
      ? 'Resultados deste turno ainda não publicados pelo TSE.'
      : state === 'error'
        ? 'Não foi possível obter os dados oficiais. Tentando novamente…'
        : 'Carregando dados oficiais do TSE…';
  return (
    <div className="space-y-2" aria-busy={state === 'loading'}>
      <p className="text-sm text-ink-300">{msg}</p>
      {state === 'loading' && (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-6 w-2/3 animate-pulse rounded bg-ink-800" />
          <div className="h-3 w-full animate-pulse rounded bg-ink-800" />
          <div className="h-16 w-full animate-pulse rounded bg-ink-800" />
        </div>
      )}
    </div>
  );
}

function ExteriorBadge({
  snapshot,
  election,
}: {
  snapshot: NonNullable<ReturnType<ElectionStore['getState']>['snapshot']>;
  election: ElectionConfig;
}) {
  const r = snapshot.exterior!.result!;
  const cmp = compareCandidates(r, election);
  const [a, b] = election.candidates;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-ink-700 bg-ink-950/85 px-2 py-1 text-[11px] text-ink-300">
      <span className="font-semibold text-ink-200">Exterior</span> (fora do mapa):{' '}
      <span className="text-lula-soft">
        {a.displayName} {formatPct(cmp.pctValidos[a.key])}
      </span>{' '}
      ·{' '}
      <span className="text-flavio-soft">
        {b.displayName} {formatPct(cmp.pctValidos[b.key])}
      </span>
    </div>
  );
}

import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { MunicipalList } from '../../components/MunicipalList';
import { BrazilMap } from '../../components/map/BrazilMap';
import { StateMap } from '../../components/map/StateMap';
import { PrefetchIndicator } from '../../components/PrefetchIndicator';
import { PwaStatus } from '../../components/PwaStatus';
import { IssuesNotice, MetricsGrid, OfficialSituation } from '../../components/ResultSummary';
import { StateList } from '../../components/StateList';
import { DataNotices } from '../../components/StatusBar';
import { ZoneBreakdown } from '../../components/ZoneBreakdown';
import { isOfficialSource } from '../../data/appConfig';
import type { UfFeatureCollection } from '../../data/geo';
import { ufBySigla, type UfSigla } from '../../data/ufs';
import type { useMunicipalResults } from '../../hooks/useMunicipal';
import type { useMunicipalPrefetch } from '../../hooks/useMunicipalPrefetch';
import { useZonas } from '../../hooks/useZonas';
import type { ElectionDataState, ElectionStore } from '../../services/electionStore';
import type { AreaResult, ElectionConfig, MapFill, RoundConfig } from '../../types/election';
import { compareCandidates } from '../../utils/calc';
import { formatInt, formatPct, titleCase } from '../../utils/format';
import type { Selection } from '../election/useSelection';
import { MobileLegend } from './MobileLegend';
import { MobileSheet, SHEET_PEEK_PX, type SheetSnap, type SheetTab } from './MobileSheet';
import { MobileTopBar } from './MobileTopBar';
import { Scoreboard, type Crumb } from './Scoreboard';
import { SearchOverlay } from './SearchOverlay';

/** Tudo o que o Dashboard já calcula; o layout do celular só organiza a apresentação. */
export interface MobileModel {
  election: ElectionConfig;
  round: RoundConfig;
  sel: Selection;
  setSel: (patch: Partial<Selection>) => void;
  state: ElectionDataState;
  store: ElectionStore;
  now: number;
  geometry: UseQueryResult<UfFeatureCollection>;
  munGeometry: UseQueryResult<UfFeatureCollection>;
  municipal: ReturnType<typeof useMunicipalResults>;
  missingGeometry: Set<string> | undefined;
  fills: Partial<Record<UfSigla, MapFill>>;
  summaries: Partial<Record<UfSigla, string>>;
  counts: Record<MapFill, number>;
  munCounts: Record<MapFill, number>;
  prefetch: ReturnType<typeof useMunicipalPrefetch>;
  stateResult: AreaResult | null;
  selectUf: (uf: UfSigla | null) => void;
  closeUf: () => void;
  selectMun: (mun: string | null) => void;
}

/**
 * Layout do celular (< 1024 px): tela de aplicativo sem rolagem de página — barra superior,
 * placar do que está em foco, mapa ocupando o centro e painel inferior arrastável com abas.
 * O layout de computador não usa este componente.
 */
export function MobileDashboard(m: MobileModel) {
  const { election, round, sel, state, now, municipal } = m;
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [searchOpen, setSearchOpen] = useState(false);
  const scopeKey = `${sel.uf ?? ''}/${sel.mun ?? ''}`;
  const [tabState, setTabState] = useState({ scope: scopeKey, tab: 'resumo' });
  const tab = tabState.scope === scopeKey ? tabState.tab : 'resumo';
  const setTab = (t: string) => setTabState({ scope: scopeKey, tab: t });

  const ufInfo = sel.uf ? ufBySigla(sel.uf)! : null;
  const munInfo = sel.mun ? municipal.municipios.find((x) => x.codigo === sel.mun) : undefined;
  const munEntry = sel.mun ? municipal.snapshot?.entries[sel.mun] : undefined;
  const cityResult = munEntry?.result ?? null;
  const zonas = useZonas(round, ufInfo?.tse ?? null, !!sel.mun);
  const snapshot = state.snapshot;
  const result = sel.mun ? cityResult : sel.uf ? m.stateResult : (snapshot?.national ?? null);

  const crumbs: Crumb[] = [
    { label: 'Brasil', onClick: m.closeUf },
    ...(ufInfo ? [{ label: ufInfo.nome, onClick: () => m.selectMun(null) }] : []),
    ...(sel.mun ? [{ label: munInfo ? titleCase(munInfo.nome) : 'Cidade' }] : []),
  ];
  const goUp = () => (sel.mun ? m.selectMun(null) : m.closeUf());

  const tabs: SheetTab[] = !sel.uf
    ? [
        { id: 'resumo', label: 'Resumo' },
        { id: 'estados', label: 'Estados' },
      ]
    : !sel.mun
      ? [
          { id: 'resumo', label: 'Resumo' },
          { id: 'municipios', label: 'Municípios' },
        ]
      : [
          { id: 'resumo', label: 'Resumo' },
          { id: 'zonas', label: 'Zonas' },
          { id: 'municipios', label: 'Municípios' },
        ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'resumo';

  const [a, b] = election.candidates;
  const title = sel.mun
    ? munInfo
      ? titleCase(munInfo.nome)
      : 'Cidade'
    : (ufInfo?.nome ?? 'Brasil');
  const subtitle = sel.mun
    ? `${ufInfo?.nome}${munInfo?.capital ? ' · capital' : ''}`
    : sel.uf
      ? `${formatInt(municipal.municipios.length || null)} municípios`
      : `UFs: ${a.displayName} ${m.counts.lula} · ${b.displayName} ${m.counts.flavio}${
          m.counts.tie ? ` · empate ${m.counts.tie}` : ''
        }`;

  const header = (
    <div className="flex items-center gap-2.5">
      {sel.uf && (
        <button
          type="button"
          onClick={goUp}
          aria-label={sel.mun ? `Voltar para ${ufInfo?.nome}` : 'Voltar para o Brasil'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-xl leading-none text-ink-200 active:bg-white/10"
        >
          ‹
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[18px] font-bold leading-tight">{title}</h2>
        <p className="truncate text-[12px] text-ink-400">{subtitle}</p>
      </div>
      <div
        role="radiogroup"
        aria-label="Turno"
        className="flex shrink-0 rounded-full border border-white/10 bg-white/5 p-0.5"
      >
        {election.rounds.map((r) => {
          const active = r.turno === round.turno;
          return (
            <button
              key={r.turno}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={r.label}
              onClick={() => m.setSel({ turno: r.turno })}
              className={`h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                active ? 'bg-ink-100 text-ink-900' : 'text-ink-300'
              }`}
            >
              {r.turno}º
            </button>
          );
        })}
      </div>
    </div>
  );

  const toMap = () => setSnap('peek');

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-ink-900 pt-safe">
      {!isOfficialSource && (
        <div
          role="alert"
          className="bg-fuchsia-700 px-3 py-0.5 text-center text-[11px] font-semibold text-white"
        >
          MODO DE TESTE — dados simulados, não oficiais
        </div>
      )}
      <MobileTopBar
        subtitle={`${election.cargoLabel} · ${round.label}`}
        state={state}
        now={now}
        onRefresh={() => m.store.refreshNow()}
        onSearch={() => setSearchOpen(true)}
      />
      <div className="mx-3 empty:hidden [&>*]:mb-2">
        <DataNotices state={state} now={now} />
      </div>
      <Scoreboard result={result} election={election} crumbs={crumbs} />

      <div className="relative mt-1 min-h-0 flex-1">
        <div
          className="absolute inset-x-0 top-0"
          style={{ bottom: `calc(${SHEET_PEEK_PX}px + env(safe-area-inset-bottom))` }}
        >
          {sel.uf ? (
            m.munGeometry.data && municipal.municipios.length > 0 ? (
              <StateMap
                uf={sel.uf}
                geometry={m.munGeometry.data}
                municipios={municipal.municipios}
                snapshot={municipal.snapshot}
                election={election}
                selected={sel.mun}
                onSelect={m.selectMun}
                onBack={m.closeUf}
                progress={municipal.progress}
                source={municipal.source}
                cachedAt={municipal.cachedAt}
                variant="minimal"
              />
            ) : (
              <MapPlaceholder
                text={
                  m.munGeometry.isError || municipal.error
                    ? 'Não foi possível carregar os municípios.'
                    : `Carregando municípios de ${ufInfo?.nome}…`
                }
              />
            )
          ) : m.geometry.data ? (
            <BrazilMap
              geometry={m.geometry.data}
              fills={m.fills}
              summaries={m.summaries}
              selected={sel.uf}
              onSelect={m.selectUf}
              controls="reset"
            />
          ) : (
            <MapPlaceholder
              text={m.geometry.isError ? 'Não foi possível carregar o mapa.' : 'Carregando mapa…'}
            />
          )}
          <div className="absolute bottom-2 left-3 right-14">
            <MobileLegend
              counts={sel.uf ? m.munCounts : m.counts}
              unit={sel.uf ? 'municípios' : 'UFs'}
              names={[a.displayName, b.displayName]}
            />
          </div>
        </div>
      </div>

      <MobileSheet
        label="Detalhes"
        snap={snap}
        onSnap={setSnap}
        header={header}
        tabs={tabs}
        activeTab={activeTab}
        onTab={setTab}
      >
        {activeTab === 'estados' && (
          <StateList
            snapshot={snapshot}
            election={election}
            selected={sel.uf}
            onSelect={(uf) => {
              m.selectUf(uf);
              toMap();
            }}
          />
        )}
        {activeTab === 'municipios' && (
          <MunicipalList
            municipios={municipal.municipios}
            snapshot={municipal.snapshot}
            election={election}
            selected={sel.mun}
            onSelect={(c) => {
              m.selectMun(c);
              toMap();
            }}
            missingGeometry={m.missingGeometry}
          />
        )}
        {activeTab === 'zonas' && sel.mun && (
          <ZoneBreakdown
            municipio={sel.mun}
            arquivo={zonas.data}
            isLoading={zonas.isLoading}
            error={zonas.error}
            election={election}
            oficial={cityResult}
            now={now}
          />
        )}
        {activeTab === 'resumo' && (
          <div className="space-y-3">
            {sel.uf && !sel.mun && snapshot?.states[sel.uf]?.status === 'stale' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {snapshot.states[sel.uf]!.message}
              </p>
            )}
            {sel.mun && munEntry?.status === 'stale' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {munEntry.message}
              </p>
            )}
            {result ? (
              <>
                <MetricsGrid
                  result={result}
                  election={election}
                  columns="grid-cols-2"
                  fetchedAt={sel.uf ? undefined : snapshot?.fetchedAt}
                />
                {!sel.uf && <OfficialSituation result={result} election={election} />}
                <IssuesNotice result={result} />
              </>
            ) : (
              <p className="text-sm text-ink-300">
                {state.notPublished && !sel.uf
                  ? 'Resultados deste turno ainda não publicados pelo TSE.'
                  : 'Carregando resultado…'}
              </p>
            )}
            {!sel.uf && snapshot?.exterior?.result && (
              <ExteriorCard result={snapshot.exterior.result} election={election} />
            )}
            {sel.uf && !sel.mun && m.missingGeometry && m.missingGeometry.size > 0 && (
              <p className="text-[11px] text-ink-400">
                {m.missingGeometry.size} município(s) sem limites na malha atual do IBGE aparecem só
                na aba Municípios.
              </p>
            )}
            {!sel.uf && (
              <PrefetchIndicator
                enabled={m.prefetch.enabled}
                setEnabled={m.prefetch.setEnabled}
                status={m.prefetch.status}
                connection={m.prefetch.connection}
                now={now}
              />
            )}
            <p className="text-[11px] leading-relaxed text-ink-400">
              Fonte: arquivos oficiais do TSE. Percentuais sobre os votos válidos; as cores comparam
              apenas {a.displayName} e {b.displayName}. A apuração é parcial até o TSE indicar a
              totalização finalizada.
            </p>
          </div>
        )}
      </MobileSheet>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        election={election}
        round={round}
        onPick={(uf, mun) => {
          m.setSel({ uf, mun });
          setSearchOpen(false);
          toMap();
        }}
      />
      <PwaStatus />
    </div>
  );
}

function MapPlaceholder({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-ink-400" role="status">
      {text}
    </div>
  );
}

function ExteriorCard({ result, election }: { result: AreaResult; election: ElectionConfig }) {
  const cmp = compareCandidates(result, election);
  const [a, b] = election.candidates;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-850 px-3 py-2 text-[12px]">
      <div className="font-semibold text-ink-200">Exterior (fora do mapa)</div>
      <div className="mt-0.5 flex justify-between tabular">
        <span className="text-lula-soft">
          {a.displayName} {formatPct(cmp.pctValidos[a.key])}
        </span>
        <span className="text-flavio-soft">
          {b.displayName} {formatPct(cmp.pctValidos[b.key])}
        </span>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { ufBySigla, type UfSigla } from '../data/ufs';
import type { MunicipioInfo } from '../services/tse/adapter';
import { describeError } from '../services/tse/errors';
import type { MunicipalSnapshot } from '../services/tse/municipal';
import type { ElectionConfig, ElectionSnapshot, RoundConfig } from '../types/election';
import { formatInt, titleCase } from '../utils/format';
import { MunicipalList } from './MunicipalList';
import { ApuracaoBadge, HeadToHead, IssuesNotice, LeaderLine, MetricsGrid } from './ResultSummary';

export interface MunicipalData {
  snapshot: MunicipalSnapshot | null;
  municipios: MunicipioInfo[];
  isLoading: boolean;
  error: unknown;
  progress: { done: number; total: number } | null;
  missingGeometry?: Set<string>;
}

export function StateDetail({
  uf,
  snapshot,
  election,
  round,
  municipal,
  selectedMun,
  onSelectMun,
  onClose,
}: {
  uf: UfSigla;
  snapshot: ElectionSnapshot | null;
  election: ElectionConfig;
  round: RoundConfig;
  municipal: MunicipalData;
  selectedMun: string | null;
  onSelectMun: (codigo: string | null) => void;
  onClose: () => void;
}) {
  const info = ufBySigla(uf)!;
  const entry = snapshot?.states[uf];
  const r = entry?.result ?? null;
  const mun = selectedMun ? municipal.snapshot?.entries[selectedMun] : undefined;
  const munInfo = useMemo(
    () => municipal.municipios.find((m) => m.codigo === selectedMun),
    [municipal.municipios, selectedMun],
  );

  return (
    <section aria-labelledby="state-title" className="space-y-3" data-testid="state-detail">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="state-title" className="text-lg font-bold leading-tight">
            {info.nome} <span className="text-ink-400">({info.sigla})</span>
          </h2>
          <p className="text-xs text-ink-400">
            {election.cargoLabel} · {round.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r && <ApuracaoBadge status={r.progress.status} />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do estado"
            className="grid h-8 w-8 place-items-center rounded-md border border-ink-600 text-ink-300 hover:bg-ink-700"
          >
            ✕
          </button>
        </div>
      </div>

      {selectedMun && munInfo && (
        <div
          className="space-y-2 rounded-lg border border-amber-400/40 bg-ink-850 p-3"
          data-testid="municipality-detail"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold">
              {titleCase(munInfo.nome)}
              {munInfo.capital && (
                <span className="ml-1 text-xs font-normal text-ink-400">capital</span>
              )}
            </h3>
            <button
              type="button"
              onClick={() => onSelectMun(null)}
              className="text-xs text-ink-300 underline"
            >
              ver estado
            </button>
          </div>
          {mun?.status === 'stale' && <p className="text-xs text-amber-200">{mun.message}</p>}
          {mun?.result ? (
            <>
              <LeaderLine result={mun.result} election={election} />
              <HeadToHead result={mun.result} election={election} />
              <MetricsGrid result={mun.result} election={election} columns="grid-cols-2" />
            </>
          ) : (
            <p className="text-sm text-ink-300">
              {municipal.isLoading || !mun
                ? 'Carregando resultado…'
                : `Resultado indisponível: ${mun.message ?? ''}`}
            </p>
          )}
        </div>
      )}

      {entry?.status === 'stale' && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
          {entry.message}
        </p>
      )}
      {(!entry || !r) && (
        <p
          role="alert"
          className="rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-200"
        >
          Resultado indisponível para esta UF{entry?.message ? `: ${entry.message}` : '.'}
        </p>
      )}
      {r && !selectedMun && (
        <>
          <LeaderLine result={r} election={election} />
          <HeadToHead result={r} election={election} />
          <MetricsGrid result={r} election={election} columns="grid-cols-2" />
          <IssuesNotice result={r} />
        </>
      )}

      {municipal.error != null && (
        <p className="text-xs text-rose-300">Municípios: {describeError(municipal.error)}</p>
      )}
      {municipal.progress && municipal.progress.done < municipal.progress.total && (
        <p className="text-xs text-ink-400 tabular" role="status">
          Carregando resultados municipais: {formatInt(municipal.progress.done)} de{' '}
          {formatInt(municipal.progress.total)}
        </p>
      )}
      {municipal.municipios.length > 0 && (
        <MunicipalList
          municipios={municipal.municipios}
          snapshot={municipal.snapshot}
          election={election}
          selected={selectedMun}
          onSelect={(c) => onSelectMun(c === selectedMun ? null : c)}
          missingGeometry={municipal.missingGeometry}
        />
      )}
      {municipal.missingGeometry && municipal.missingGeometry.size > 0 && (
        <p className="text-[11px] text-ink-400">
          {municipal.missingGeometry.size === 1
            ? '1 município'
            : `${municipal.missingGeometry.size} municípios`}{' '}
          sem limites na malha atual do IBGE (criação recente) aparece
          {municipal.missingGeometry.size > 1 ? 'm' : ''} apenas na lista, com seus resultados
          oficiais.
        </p>
      )}
    </section>
  );
}

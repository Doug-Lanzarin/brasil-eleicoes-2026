import { ufBySigla, type UfSigla } from '../data/ufs';
import type { ElectionConfig, ElectionSnapshot, RoundConfig } from '../types/election';
import { ApuracaoBadge, HeadToHead, IssuesNotice, LeaderLine, MetricsGrid } from './ResultSummary';
import { MunicipalList } from './MunicipalList';

export function StateDetail({
  uf,
  snapshot,
  election,
  round,
  onClose,
}: {
  uf: UfSigla;
  snapshot: ElectionSnapshot | null;
  election: ElectionConfig;
  round: RoundConfig;
  onClose: () => void;
}) {
  const info = ufBySigla(uf)!;
  const entry = snapshot?.states[uf];
  const r = entry?.result ?? null;
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
      {r && (
        <>
          <LeaderLine result={r} election={election} />
          <HeadToHead result={r} election={election} />
          <MetricsGrid result={r} election={election} columns="grid-cols-2" />
          <IssuesNotice result={r} />
          <MunicipalList
            key={`${round.codigoEleicao}-${uf}`}
            uf={uf}
            election={election}
            round={round}
          />
        </>
      )}
    </section>
  );
}

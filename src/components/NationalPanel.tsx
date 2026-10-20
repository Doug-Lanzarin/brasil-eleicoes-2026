import type { ElectionConfig, ElectionSnapshot, MapFill } from '../types/election';
import {
  ApuracaoBadge,
  HeadToHead,
  IssuesNotice,
  LeaderLine,
  MetricsGrid,
  OfficialSituation,
} from './ResultSummary';

export function NationalPanel({
  snapshot,
  election,
  counts,
  compact = false,
}: {
  snapshot: ElectionSnapshot;
  election: ElectionConfig;
  counts: Record<MapFill, number>;
  compact?: boolean;
}) {
  const r = snapshot.national;
  return (
    <section aria-labelledby="national-title" className="space-y-3" data-testid="national-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="national-title"
          className="text-sm font-semibold uppercase tracking-wide text-ink-300"
        >
          Brasil · {election.cargoLabel}
        </h2>
        <ApuracaoBadge status={r.progress.status} />
      </div>
      <LeaderLine result={r} election={election} />
      <HeadToHead result={r} election={election} />
      <p className="text-xs text-ink-400">
        UFs com mais votos:{' '}
        <span className="text-lula-soft">
          {election.candidates[0].displayName} {counts.lula}
        </span>{' '}
        ·{' '}
        <span className="text-flavio-soft">
          {election.candidates[1].displayName} {counts.flavio}
        </span>
        {counts.tie > 0 && <> · empate {counts.tie}</>}
      </p>
      <OfficialSituation result={r} election={election} />
      <MetricsGrid
        result={r}
        election={election}
        fetchedAt={snapshot.fetchedAt}
        columns={compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}
      />
      <IssuesNotice result={r} />
    </section>
  );
}

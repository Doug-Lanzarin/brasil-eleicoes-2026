import type { ElectionConfig, ElectionSnapshot } from '../types/election';
import { compareCandidates } from '../utils/calc';
import { formatInt, formatPct, formatPP } from '../utils/format';
import { AnimatedNumber } from './AnimatedNumber';

/** Indicadores nacionais compactos (faixa acima do mapa). */
export function KpiStrip({
  snapshot,
  election,
}: {
  snapshot: ElectionSnapshot | null;
  election: ElectionConfig;
}) {
  const r = snapshot?.national ?? null;
  const cmp = compareCandidates(r, election);
  const [a, b] = election.candidates;
  const cards = [
    {
      label: a.displayName,
      accent: 'border-l-lula',
      value: <AnimatedNumber value={cmp.pctValidos[a.key]} format={formatPct} />,
      hint: <AnimatedNumber value={cmp.votes[a.key]} format={formatInt} />,
    },
    {
      label: b.displayName,
      accent: 'border-l-flavio',
      value: <AnimatedNumber value={cmp.pctValidos[b.key]} format={formatPct} />,
      hint: <AnimatedNumber value={cmp.votes[b.key]} format={formatInt} />,
    },
    {
      label: 'Diferença',
      accent: 'border-l-ink-400',
      value: <AnimatedNumber value={cmp.diffVotes} format={formatInt} />,
      hint: <AnimatedNumber value={cmp.diffPP} format={formatPP} />,
    },
    {
      label: 'Seções totalizadas',
      accent: 'border-l-emerald-400',
      value: <AnimatedNumber value={r?.progress.percentual ?? null} format={formatPct} />,
      hint: r
        ? `${formatInt(r.progress.secoesTotalizadas)} de ${formatInt(r.progress.secoesEsperadas)}`
        : '—',
    },
  ];
  return (
    <dl
      className="scrollbar-none -mx-3 flex snap-x gap-2 overflow-x-auto px-3 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0"
      data-testid="kpi-strip"
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className={`min-w-[42%] snap-start rounded-lg border border-ink-700 border-l-4 ${c.accent} bg-ink-850 px-3 py-2 sm:min-w-0`}
        >
          <dt className="truncate text-[11px] uppercase tracking-wide text-ink-400">{c.label}</dt>
          <dd className="text-xl font-bold leading-tight sm:text-2xl">{c.value}</dd>
          <dd className="truncate text-[11px] text-ink-400 tabular">{c.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

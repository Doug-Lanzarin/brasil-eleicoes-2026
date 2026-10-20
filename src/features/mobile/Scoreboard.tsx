import { AnimatedNumber } from '../../components/AnimatedNumber';
import type { AreaResult, ElectionConfig } from '../../types/election';
import { compareCandidates } from '../../utils/calc';
import { formatInt, formatPct, formatPP } from '../../utils/format';

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/**
 * Placar do que está em foco (Brasil, estado ou cidade): percentuais sobre os válidos,
 * votos, barra de confronto, diferença e andamento — com o caminho de navegação acima.
 */
export function Scoreboard({
  result,
  election,
  crumbs,
}: {
  result: AreaResult | null;
  election: ElectionConfig;
  crumbs: Crumb[];
}) {
  const [a, b] = election.candidates;
  const cmp = compareCandidates(result, election);
  const pa = cmp.pctValidos[a.key];
  const pb = cmp.pctValidos[b.key];
  const hasData = pa != null || pb != null;
  const leader = cmp.leader === a.key ? a : cmp.leader === b.key ? b : null;
  const p = result?.progress;

  return (
    <section
      aria-label="Placar"
      data-testid="scoreboard"
      className="mx-3 rounded-2xl border border-white/10 bg-gradient-to-b from-ink-800/90 to-ink-850/90 px-3.5 pb-3 pt-2.5 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <nav aria-label="Caminho" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1 text-[12px]">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li
                  key={`${c.label}-${i}`}
                  className={`flex min-w-0 items-center gap-1 ${last ? '' : 'shrink-0'}`}
                >
                  {i > 0 && (
                    <span className="text-ink-600" aria-hidden="true">
                      ›
                    </span>
                  )}
                  {last || !c.onClick ? (
                    <span
                      className="truncate font-semibold text-ink-100"
                      aria-current={last ? 'page' : undefined}
                    >
                      {c.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={c.onClick}
                      className="rounded px-0.5 text-sky-300 active:text-sky-200"
                    >
                      {c.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        {p && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular ${
              p.status === 'finalizada'
                ? 'bg-emerald-500/15 text-emerald-300'
                : p.status === 'parcial'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-white/5 text-ink-300'
            }`}
          >
            {p.status === 'finalizada'
              ? 'Finalizada'
              : p.status === 'parcial'
                ? `${formatPct(p.percentual)} apurado`
                : 'Não iniciada'}
          </span>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-3">
        <Side
          name={a.displayName}
          tone="red"
          pct={pa}
          votes={cmp.votes[a.key]}
          leading={leader === a}
        />
        <Side
          name={b.displayName}
          tone="blue"
          pct={pb}
          votes={cmp.votes[b.key]}
          leading={leader === b}
          align="right"
        />
      </div>

      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-ink-700"
        role="img"
        aria-label={`${a.displayName} ${formatPct(pa)}, ${b.displayName} ${formatPct(pb)} dos votos válidos`}
      >
        <div className="bg-lula transition-[width] duration-500" style={{ width: `${pa ?? 0}%` }} />
        <div className="flex-1" />
        <div
          className="bg-flavio transition-[width] duration-500"
          style={{ width: `${pb ?? 0}%` }}
        />
      </div>

      <p className="mt-1.5 truncate text-[12px] text-ink-300 tabular">
        {!result
          ? 'Carregando resultado…'
          : !hasData || cmp.leader === 'none'
            ? 'Ainda sem votos apurados para comparar.'
            : cmp.leader === 'tie'
              ? 'Empate entre os dois candidatos'
              : `${leader!.displayName} à frente por ${formatInt(cmp.diffVotes)} votos (${formatPP(cmp.diffPP)})`}
      </p>
    </section>
  );
}

function Side({
  name,
  tone,
  pct,
  votes,
  leading,
  align = 'left',
}: {
  name: string;
  tone: 'red' | 'blue';
  pct: number | null;
  votes: number | null;
  leading: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div
        className={`flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide ${
          align === 'right' ? 'justify-end' : ''
        } ${tone === 'red' ? 'text-lula-soft' : 'text-flavio-soft'}`}
      >
        {leading && align === 'right' && <LeaderMark />}
        <span className="truncate">{name}</span>
        {leading && align === 'left' && <LeaderMark />}
      </div>
      <div className="text-[30px] font-bold leading-none tracking-tight text-ink-100">
        <AnimatedNumber value={pct} format={formatPct} />
      </div>
      <div className="mt-0.5 text-[11px] text-ink-400">
        <AnimatedNumber value={votes} format={formatInt} /> votos
      </div>
    </div>
  );
}

function LeaderMark() {
  return (
    <span
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15 text-[10px] text-ink-100"
      title="À frente"
      aria-label="à frente"
      role="img"
    >
      ▲
    </span>
  );
}

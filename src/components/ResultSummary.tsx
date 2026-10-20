import type { AreaResult, ElectionConfig, Progress } from '../types/election';
import { compareCandidates, findCandidate } from '../utils/calc';
import { formatBrasilia } from '../utils/dates';
import { formatInt, formatPct, formatPP } from '../utils/format';
import { AnimatedNumber } from './AnimatedNumber';

const STATUS_LABEL: Record<Progress['status'], string> = {
  'nao-iniciada': 'Apuração não iniciada',
  parcial: 'Apuração parcial',
  finalizada: 'Totalização finalizada',
};

export function ApuracaoBadge({ status }: { status: Progress['status'] }) {
  const cls =
    status === 'finalizada'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : status === 'parcial'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-ink-600 bg-ink-800 text-ink-300';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LeaderLine({
  result,
  election,
}: {
  result: AreaResult | null;
  election: ElectionConfig;
}) {
  const cmp = compareCandidates(result, election);
  const [a, b] = election.candidates;
  if (!result) return <p className="text-sm text-ink-400">Resultado indisponível.</p>;
  if (cmp.leader === 'none') {
    return (
      <p className="text-sm text-ink-300">
        Ainda não há votos apurados para comparar os candidatos.
      </p>
    );
  }
  if (cmp.leader === 'tie') {
    return (
      <p className="text-base font-semibold text-ink-100">
        Empate entre {a.displayName} e {b.displayName}
      </p>
    );
  }
  const leader = cmp.leader === a.key ? a : b;
  const final = result.progress.status === 'finalizada';
  return (
    <p className="text-base font-semibold sm:text-lg">
      <span className={leader.color === 'red' ? 'text-lula-soft' : 'text-flavio-soft'}>
        {leader.displayName}
      </span>{' '}
      <span className="text-ink-200">
        {final ? 'recebeu mais votos entre os dois' : 'à frente entre os dois (parcial)'}
      </span>
    </p>
  );
}

/** Barra de confronto: percentuais de cada candidato sobre os votos válidos. */
export function HeadToHead({
  result,
  election,
}: {
  result: AreaResult | null;
  election: ElectionConfig;
}) {
  const cmp = compareCandidates(result, election);
  const [a, b] = election.candidates;
  const pa = cmp.pctValidos[a.key] ?? 0;
  const pb = cmp.pctValidos[b.key] ?? 0;
  const hasData = cmp.pctValidos[a.key] != null || cmp.pctValidos[b.key] != null;
  const others = hasData ? Math.max(0, 100 - pa - pb) : 0;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <CandidateFigure
          name={a.displayName}
          color="red"
          votes={cmp.votes[a.key]}
          pct={cmp.pctValidos[a.key]}
        />
        <CandidateFigure
          name={b.displayName}
          color="blue"
          votes={cmp.votes[b.key]}
          pct={cmp.pctValidos[b.key]}
          align="right"
        />
      </div>
      <div
        className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-700"
        role="img"
        aria-label={`${a.displayName} ${formatPct(cmp.pctValidos[a.key])}, ${b.displayName} ${formatPct(cmp.pctValidos[b.key])} dos votos válidos`}
      >
        <div
          className="h-full bg-lula transition-[width] duration-500"
          style={{ width: `${pa}%` }}
        />
        <div
          className="h-full bg-ink-600 transition-[width] duration-500"
          style={{ width: `${others}%` }}
        />
        <div
          className="h-full bg-flavio transition-[width] duration-500"
          style={{ width: `${pb}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-400">
        <span>% dos votos válidos</span>
        {others > 0.005 && <span className="tabular">outros candidatos: {formatPct(others)}</span>}
      </div>
    </div>
  );
}

function CandidateFigure({
  name,
  color,
  votes,
  pct,
  align = 'left',
}: {
  name: string;
  color: 'red' | 'blue';
  votes: number | null;
  pct: number | null;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div
        className={`text-xs font-medium uppercase tracking-wide ${color === 'red' ? 'text-lula-soft' : 'text-flavio-soft'}`}
      >
        {name}
      </div>
      <div className="text-2xl font-bold leading-tight sm:text-3xl">
        <AnimatedNumber value={pct} format={formatPct} />
      </div>
      <div className="text-xs text-ink-300">
        <AnimatedNumber value={votes} format={formatInt} /> votos
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <dt className="truncate text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd
        className={`font-semibold tabular text-ink-100 ${small ? 'text-[13px] leading-snug' : 'truncate text-base'}`}
      >
        {value}
      </dd>
      {hint && <dd className="truncate text-[11px] text-ink-400 tabular">{hint}</dd>}
    </div>
  );
}

/** Grade de métricas oficiais (votos, seções, horários) de uma abrangência. */
export function MetricsGrid({
  result,
  election,
  fetchedAt,
  columns = 'grid-cols-2 sm:grid-cols-3',
}: {
  result: AreaResult;
  election: ElectionConfig;
  fetchedAt?: string | null;
  columns?: string;
}) {
  const cmp = compareCandidates(result, election);
  const v = result.votos;
  const p = result.progress;
  return (
    <dl className={`grid gap-2 ${columns}`}>
      <Metric
        label="Diferença de votos"
        value={<AnimatedNumber value={cmp.diffVotes} format={formatInt} />}
      />
      <Metric label="Diferença" value={<AnimatedNumber value={cmp.diffPP} format={formatPP} />} />
      <Metric
        label="Votos válidos"
        value={<AnimatedNumber value={v.validos} format={formatInt} />}
      />
      <Metric
        label="Brancos"
        value={<AnimatedNumber value={v.brancos} format={formatInt} />}
        hint={v.total > 0 ? `${formatPct((v.brancos / v.total) * 100)} do total` : undefined}
      />
      <Metric
        label="Nulos"
        value={<AnimatedNumber value={v.nulos} format={formatInt} />}
        hint={v.nulosTecnicos > 0 ? `inclui ${formatInt(v.nulosTecnicos)} técnicos` : undefined}
      />
      <Metric
        label="Seções totalizadas"
        value={<AnimatedNumber value={p.percentual} format={formatPct} />}
        hint={`${formatInt(p.secoesTotalizadas)} de ${formatInt(p.secoesEsperadas)}`}
      />
      <Metric small label="Última totalização (TSE)" value={formatBrasilia(result.totalizadoEm)} />
      <Metric small label="Arquivo gerado (TSE)" value={formatBrasilia(result.geradoEm)} />
      {fetchedAt !== undefined && (
        <Metric small label="Consulta concluída" value={formatBrasilia(fetchedAt)} />
      )}
    </dl>
  );
}

/** Situação oficial publicada pelo TSE (ex.: "Eleito", "2º turno") — só após totalização final. */
export function OfficialSituation({
  result,
  election,
}: {
  result: AreaResult;
  election: ElectionConfig;
}) {
  if (result.progress.status !== 'finalizada' || result.tipo !== 'br') return null;
  const items = election.candidates
    .map((c) => ({ c, r: findCandidate(result.candidatos, c) }))
    .filter((x) => x.r?.situacao);
  if (!items.length) return null;
  return (
    <p className="text-xs text-ink-300">
      Situação oficial (TSE):{' '}
      {items.map(({ c, r }, i) => (
        <span key={c.key}>
          {i > 0 && ' · '}
          {c.displayName}: <strong className="text-ink-100">{r!.situacao}</strong>
        </span>
      ))}
    </p>
  );
}

export function IssuesNotice({ result }: { result: AreaResult | null | undefined }) {
  const issues = result?.issues ?? [];
  if (!issues.length) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      <p className="font-semibold">Verificação de integridade</p>
      <ul className="mt-1 list-disc pl-4">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`}>{i.message}</li>
        ))}
      </ul>
    </div>
  );
}

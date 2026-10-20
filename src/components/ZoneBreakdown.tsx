import { useMemo } from 'react';
import { describeError, isTseError } from '../services/tse/errors';
import type { AreaResult, ElectionConfig } from '../types/election';
import type { ZonasArquivo } from '../types/zonas';
import { compareFromVotes } from '../utils/calc';
import { formatAge, formatBrasilia } from '../utils/dates';
import { formatInt, formatPct, formatPP } from '../utils/format';

const LEADER_BORDER = {
  lula: 'border-l-lula',
  flavio: 'border-l-flavio',
  tie: 'border-l-tie',
  none: 'border-l-ink-600',
} as const;

/**
 * Resultado por zona eleitoral do município. As zonas não têm limites geográficos
 * oficiais, por isso aparecem como cartões, não no mapa.
 */
export function ZoneBreakdown({
  municipio,
  arquivo,
  isLoading,
  error,
  election,
  oficial,
  now,
}: {
  municipio: string;
  arquivo: ZonasArquivo | undefined;
  isLoading: boolean;
  error: unknown;
  election: ElectionConfig;
  /** Resultado oficial do município (para comparar a cobertura). */
  oficial: AreaResult | null;
  now: number;
}) {
  const [a, b] = election.candidates;
  const mun = arquivo?.municipios[municipio];
  const zonas = useMemo(
    () => Object.entries(mun?.zonas ?? {}).sort(([x], [y]) => Number(x) - Number(y)),
    [mun],
  );

  if (isLoading) return <p className="text-xs text-ink-400">Carregando zonas eleitorais…</p>;
  if (error) {
    const naoPublicado = isTseError(error, 'not-published');
    return (
      <p className="rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-ink-300">
        {naoPublicado
          ? 'Resultados por zona ainda não disponíveis para esta UF. Eles são calculados a partir dos boletins de urna à medida que o TSE os publica.'
          : `Zonas eleitorais indisponíveis: ${describeError(error)}`}
      </p>
    );
  }
  if (!arquivo || !mun) {
    return <p className="text-xs text-ink-400">Sem dados de zonas para este município.</p>;
  }

  const cobertura = mun.secoes > 0 ? (mun.secoesProcessadas / mun.secoes) * 100 : 0;
  const atraso =
    oficial != null && oficial.progress.secoesTotalizadas > mun.secoesProcessadas
      ? oficial.progress.secoesTotalizadas - mun.secoesProcessadas
      : 0;
  const idadeMin = (now - Date.parse(arquivo.geradoEm)) / 60_000;

  return (
    <section aria-labelledby="zonas-title" className="space-y-2" data-testid="zone-breakdown">
      <div className="flex items-baseline justify-between gap-2">
        <h4 id="zonas-title" className="text-sm font-semibold">
          Zonas eleitorais <span className="font-normal text-ink-400">({zonas.length})</span>
        </h4>
        <span className="text-[11px] text-ink-400 tabular" title={formatBrasilia(arquivo.geradoEm)}>
          calculado {formatAge(arquivo.geradoEm, now)}
        </span>
      </div>
      <p className="text-[11px] text-ink-300 tabular">
        {formatInt(mun.secoesProcessadas)} de {formatInt(mun.secoes)} seções com boletim processado
        ({formatPct(cobertura)})
        {atraso > 0 && (
          <span className="text-amber-300">
            {' '}
            · {formatInt(atraso)} seções já totalizadas pelo TSE ainda em processamento
          </span>
        )}
      </p>
      {idadeMin > 15 && mun.secoesProcessadas < mun.secoes && (
        <p className="text-[11px] text-amber-300">
          O cálculo por zonas não é atualizado há mais de 15 minutos.
        </p>
      )}
      <ul className="space-y-2">
        {zonas.map(([zona, z]) => {
          const cmp = compareFromVotes(z.votos, z.validos, election);
          const pa = cmp.pctValidos[a.key];
          const pb = cmp.pctValidos[b.key];
          return (
            <li
              key={zona}
              className={`rounded-lg border border-ink-700 border-l-4 bg-ink-850 px-3 py-2 ${LEADER_BORDER[cmp.leader]}`}
              data-zona={zona}
              data-leader={cmp.leader}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">Zona {Number(zona)}</span>
                <span className="text-[11px] text-ink-400 tabular">
                  {formatInt(z.secoesProcessadas)}/{formatInt(z.secoes)} seções
                </span>
              </div>
              {z.validos > 0 ? (
                <>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs tabular">
                    <div>
                      <div className="text-lula-soft">{a.displayName}</div>
                      <div className="text-base font-semibold text-ink-100">{formatPct(pa)}</div>
                      <div className="text-[11px] text-ink-400">
                        {formatInt(cmp.votes[a.key])} votos
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-flavio-soft">{b.displayName}</div>
                      <div className="text-base font-semibold text-ink-100">{formatPct(pb)}</div>
                      <div className="text-[11px] text-ink-400">
                        {formatInt(cmp.votes[b.key])} votos
                      </div>
                    </div>
                  </div>
                  <div
                    className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-ink-700"
                    aria-hidden="true"
                  >
                    <div className="bg-lula" style={{ width: `${pa ?? 0}%` }} />
                    <div className="flex-1" />
                    <div className="bg-flavio" style={{ width: `${pb ?? 0}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-ink-400 tabular">
                    {cmp.leader === 'tie'
                      ? 'Empate'
                      : `Diferença: ${formatInt(cmp.diffVotes)} votos (${formatPP(cmp.diffPP)})`}
                    {' · '}brancos {formatInt(z.brancos)} · nulos {formatInt(z.nulos)}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-xs text-ink-400">Nenhum boletim processado ainda.</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-ink-400">
        Fonte: soma dos boletins de urna (BU) totalizados, publicados pelo TSE. Percentuais sobre os
        votos válidos da zona. O TSE não publica limites geográficos das zonas eleitorais; por isso
        elas aparecem em lista, não no mapa.
      </p>
    </section>
  );
}

import { UFS, type UfSigla } from '../data/ufs';
import type { ElectionConfig, ElectionSnapshot } from '../types/election';
import { compareCandidates, mapFillFor } from '../utils/calc';
import { formatPct } from '../utils/format';
import { FILL_COLOR, FILL_LABEL } from './map/colors';

/** Alternativa acessível ao mapa: lista das UFs com o líder e a apuração. */
export function StateList({
  snapshot,
  election,
  selected,
  onSelect,
}: {
  snapshot: ElectionSnapshot | null;
  election: ElectionConfig;
  selected: UfSigla | null;
  onSelect: (uf: UfSigla) => void;
}) {
  const [a, b] = election.candidates;
  return (
    <div className="overflow-hidden rounded-lg border border-ink-700">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Resultado por unidade federativa</caption>
        <thead className="bg-ink-850 text-[11px] uppercase tracking-wide text-ink-400">
          <tr>
            <th scope="col" className="px-2 py-1.5">
              UF
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              {a.displayName}
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              {b.displayName}
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Apurado
            </th>
          </tr>
        </thead>
        <tbody>
          {UFS.map((u) => {
            const entry = snapshot?.states[u.sigla as UfSigla];
            const fill = mapFillFor(entry, election);
            const cmp = compareCandidates(entry?.result ?? null, election);
            const isSel = selected === u.sigla;
            return (
              <tr
                key={u.sigla}
                className={`border-t border-ink-800 ${isSel ? 'bg-ink-700/60' : 'hover:bg-ink-800'}`}
              >
                <th scope="row" className="px-2 py-1 font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(u.sigla as UfSigla)}
                    className="flex w-full items-center gap-2 text-left"
                    aria-label={`${u.nome}: ${FILL_LABEL[fill]}`}
                    aria-pressed={isSel}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        background:
                          fill === 'unavailable' ? 'var(--color-unavailable)' : FILL_COLOR[fill],
                      }}
                      aria-hidden="true"
                    />
                    <span className="font-semibold">{u.sigla}</span>
                    <span className="truncate text-ink-400">{u.nome}</span>
                  </button>
                </th>
                <td className="px-2 py-1 text-right tabular">{formatPct(cmp.pctValidos[a.key])}</td>
                <td className="px-2 py-1 text-right tabular">{formatPct(cmp.pctValidos[b.key])}</td>
                <td className="px-2 py-1 text-right tabular text-ink-400">
                  {entry?.result ? formatPct(entry.result.progress.percentual) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

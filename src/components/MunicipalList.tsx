import { useMemo, useState } from 'react';
import type { MunicipioInfo } from '../services/tse/adapter';
import type { MunicipalSnapshot } from '../services/tse/municipal';
import type { ElectionConfig } from '../types/election';
import { compareCandidates, mapFillFor } from '../utils/calc';
import { formatInt, formatPct, titleCase } from '../utils/format';
import { FILL_COLOR, FILL_LABEL } from './map/colors';

type SortKey = 'nome' | 'lula' | 'flavio' | 'apurado';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function SortButton({
  k,
  current,
  onSort,
  children,
}: {
  k: SortKey;
  current: SortKey;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-pressed={current === k}
      className={`uppercase ${current === k ? 'text-ink-100' : ''}`}
    >
      {children}
    </button>
  );
}

/** Lista dos municípios da UF (também é a alternativa acessível ao mapa municipal). */
export function MunicipalList({
  municipios,
  snapshot,
  election,
  selected,
  onSelect,
  missingGeometry,
}: {
  municipios: MunicipioInfo[];
  snapshot: MunicipalSnapshot | null;
  election: ElectionConfig;
  selected: string | null;
  onSelect: (codigo: string) => void;
  /** Municípios sem geometria na malha do IBGE (aparecem só na lista). */
  missingGeometry?: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('nome');
  const [a, b] = election.candidates;

  const rows = useMemo(() => {
    const q = normalize(query);
    const list = municipios
      .filter((m) => !q || normalize(m.nome).includes(q))
      .map((m) => {
        const entry = snapshot?.entries[m.codigo];
        return { m, entry, cmp: compareCandidates(entry?.result ?? null, election) };
      });
    const pct = (v: number | null) => v ?? -1;
    if (sort === 'lula')
      list.sort((x, y) => pct(y.cmp.pctValidos[a.key]) - pct(x.cmp.pctValidos[a.key]));
    if (sort === 'flavio')
      list.sort((x, y) => pct(y.cmp.pctValidos[b.key]) - pct(x.cmp.pctValidos[b.key]));
    if (sort === 'apurado')
      list.sort(
        (x, y) =>
          (y.entry?.result?.progress.percentual ?? -1) -
          (x.entry?.result?.progress.percentual ?? -1),
      );
    return list;
  }, [municipios, snapshot, election, query, sort, a.key, b.key]);

  return (
    <div className="space-y-2" data-testid="municipal-list">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Municípios</h3>
        <span className="text-xs text-ink-400">{municipios.length} municípios</span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar município"
        aria-label="Buscar município"
        className="w-full rounded-md border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm"
      />
      <div className="max-h-96 overflow-auto rounded-lg border border-ink-700">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Resultado por município</caption>
          <thead className="sticky top-0 z-[1] bg-ink-850 text-[11px] tracking-wide text-ink-400">
            <tr>
              <th scope="col" className="px-2 py-1.5">
                <SortButton current={sort} onSort={setSort} k="nome">
                  Município
                </SortButton>
              </th>
              <th scope="col" className="px-2 py-1.5 text-right">
                <SortButton current={sort} onSort={setSort} k="lula">
                  {a.displayName}
                </SortButton>
              </th>
              <th scope="col" className="px-2 py-1.5 text-right">
                <SortButton current={sort} onSort={setSort} k="flavio">
                  {b.displayName}
                </SortButton>
              </th>
              <th scope="col" className="px-2 py-1.5 text-right">
                <SortButton current={sort} onSort={setSort} k="apurado">
                  Apurado
                </SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, entry, cmp }) => {
              const fill = entry ? mapFillFor(entry, election) : 'unavailable';
              const isSel = selected === m.codigo;
              const nome = titleCase(m.nome);
              return (
                <tr
                  key={m.codigo}
                  className={`border-t border-ink-800 ${isSel ? 'bg-ink-700/60' : 'hover:bg-ink-800'}`}
                >
                  <th scope="row" className="px-2 py-1 font-normal">
                    <button
                      type="button"
                      onClick={() => onSelect(m.codigo)}
                      aria-pressed={isSel}
                      aria-label={`${nome}: ${FILL_LABEL[fill]}`}
                      className="flex w-full items-center gap-1.5 text-left"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{
                          background:
                            fill === 'unavailable' ? 'var(--color-unavailable)' : FILL_COLOR[fill],
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{nome}</span>
                      {m.capital && <span className="text-[10px] text-ink-400">capital</span>}
                      {missingGeometry?.has(m.codigo) && (
                        <span
                          className="text-[10px] text-amber-300"
                          title="Sem limites na malha do IBGE"
                        >
                          fora do mapa
                        </span>
                      )}
                    </button>
                  </th>
                  <td className="px-2 py-1 text-right tabular">
                    {entry?.result ? (
                      <>
                        {formatPct(cmp.pctValidos[a.key])}
                        <span className="block text-[10px] text-ink-400">
                          {formatInt(cmp.votes[a.key])}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular">
                    {entry?.result ? (
                      <>
                        {formatPct(cmp.pctValidos[b.key])}
                        <span className="block text-[10px] text-ink-400">
                          {formatInt(cmp.votes[b.key])}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular text-ink-400">
                    {entry?.result ? formatPct(entry.result.progress.percentual) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

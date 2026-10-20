import { useMemo, useState } from 'react';
import { ufBySigla, type UfSigla } from '../data/ufs';
import { useNow } from '../hooks/useNow';
import {
  useMunicipiosAndamento,
  useMunicipiosConfig,
  useMunicipiosResultados,
} from '../hooks/useMunicipal';
import { describeError } from '../services/tse/errors';
import type { ElectionConfig, RoundConfig } from '../types/election';
import { compareCandidates } from '../utils/calc';
import { formatInt, formatPct } from '../utils/format';

/**
 * Detalhamento municipal (opcional). O TSE publica um arquivo de resultado por município;
 * por isso a lista mostra primeiro o andamento (um único arquivo por UF) e só baixa os
 * votos de todos os municípios quando o usuário pede.
 */
export function MunicipalList({
  uf,
  election,
  round,
}: {
  uf: UfSigla;
  election: ElectionConfig;
  round: RoundConfig;
}) {
  const [open, setOpen] = useState(false);
  const [loadVotes, setLoadVotes] = useState(false);
  const [query, setQuery] = useState('');
  const tse = ufBySigla(uf)!.tse;
  const cm = useMunicipiosConfig(election, round, open);
  const ab = useMunicipiosAndamento(election, round, tse, open);
  const municipios = useMemo(() => cm.data?.get(tse) ?? [], [cm.data, tse]);
  const codigos = useMemo(() => municipios.map((m) => m.codigo), [municipios]);
  const res = useMunicipiosResultados(election, round, tse, codigos, open && loadVotes);
  const now = useNow(5000);
  const [a, b] = election.candidates;

  const filtered = useMemo(() => {
    const q = query
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (!q) return municipios;
    return municipios.filter((m) =>
      m.nome
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .includes(q),
    );
  }, [municipios, query]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-ink-600 px-3 py-2 text-sm text-ink-200 hover:bg-ink-800"
      >
        Ver municípios
      </button>
    );
  }

  return (
    <div className="space-y-2" data-testid="municipal-list">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Municípios</h3>
        <span className="text-xs text-ink-400">{municipios.length || '…'} municípios</span>
      </div>
      {cm.isError && <p className="text-xs text-rose-300">{describeError(cm.error)}</p>}
      {!loadVotes && municipios.length > 0 && (
        <button
          type="button"
          onClick={() => setLoadVotes(true)}
          className="w-full rounded-lg border border-ink-600 px-3 py-2 text-xs text-ink-200 hover:bg-ink-800"
        >
          Carregar votos dos {municipios.length} municípios ({municipios.length} arquivos do TSE, ~
          {Math.max(1, Math.round((municipios.length * 9) / 1024))} MB)
        </button>
      )}
      {loadVotes && res.isFetching && (
        <p className="text-xs text-ink-400">Carregando resultados municipais…</p>
      )}
      {res.isError && <p className="text-xs text-rose-300">{describeError(res.error)}</p>}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar município"
        aria-label="Buscar município"
        className="w-full rounded-md border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm"
      />
      <div className="max-h-80 overflow-auto rounded-lg border border-ink-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ink-850 text-[11px] uppercase tracking-wide text-ink-400">
            <tr>
              <th scope="col" className="px-2 py-1.5">
                Município
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
            {filtered.map((m) => {
              const progress =
                ab.data?.items.get(m.codigo)?.progress ??
                ab.data?.items.get(String(Number(m.codigo)))?.progress;
              const r = res.data?.get(m.codigo);
              const result = r && !(r instanceof Error) ? r : null;
              const cmp = compareCandidates(result, election);
              const leaderColor =
                cmp.leader === a.key
                  ? 'bg-lula'
                  : cmp.leader === b.key
                    ? 'bg-flavio'
                    : cmp.leader === 'tie'
                      ? 'bg-tie'
                      : 'bg-nodata';
              return (
                <tr key={m.codigo} className="border-t border-ink-800">
                  <th scope="row" className="px-2 py-1 font-normal">
                    <span className="flex items-center gap-1.5">
                      {result && (
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${leaderColor}`}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{m.nome}</span>
                      {m.capital && <span className="text-[10px] text-ink-400">capital</span>}
                    </span>
                  </th>
                  <td className="px-2 py-1 text-right tabular">
                    {result ? (
                      <>
                        {formatInt(cmp.votes[a.key])}
                        <span className="block text-[10px] text-ink-400">
                          {formatPct(cmp.pctValidos[a.key])}
                        </span>
                      </>
                    ) : r instanceof Error ? (
                      <span className="text-ink-400" title={describeError(r)}>
                        indisp.
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular">
                    {result ? (
                      <>
                        {formatInt(cmp.votes[b.key])}
                        <span className="block text-[10px] text-ink-400">
                          {formatPct(cmp.pctValidos[b.key])}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular text-ink-400">
                    {progress ? formatPct(progress.percentual) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loadVotes && res.data && (
        <button
          type="button"
          disabled={res.isFetching || now - res.dataUpdatedAt < 30_000}
          onClick={() => void res.refetch()}
          className="text-xs text-ink-300 underline disabled:opacity-50"
        >
          Recarregar votos municipais
        </button>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { UFS, type UfSigla } from '../../data/ufs';
import { useMunicipiosConfig } from '../../hooks/useMunicipal';
import type { ElectionConfig, RoundConfig } from '../../types/election';
import { titleCase } from '../../utils/format';
import { SearchIcon } from './MobileTopBar';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

interface Hit {
  kind: 'uf' | 'mun';
  uf: UfSigla;
  ufNome: string;
  mun?: string;
  nome: string;
  capital?: boolean;
}

/** Busca de estado ou cidade em tela cheia (lista oficial de municípios do TSE). */
export function SearchOverlay({
  open,
  onClose,
  onPick,
  election,
  round,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (uf: UfSigla, mun: string | null) => void;
  election: ElectionConfig;
  round: RoundConfig;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cm = useMunicipiosConfig(election, round, open);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const index = useMemo(() => {
    const out: (Hit & { key: string })[] = [];
    for (const u of UFS) {
      out.push({
        kind: 'uf',
        uf: u.sigla,
        ufNome: u.nome,
        nome: u.nome,
        key: norm(`${u.nome} ${u.sigla}`),
      });
      for (const m of cm.data?.get(u.tse) ?? []) {
        const nome = titleCase(m.nome);
        out.push({
          kind: 'mun',
          uf: u.sigla,
          ufNome: u.nome,
          mun: m.codigo,
          nome,
          capital: m.capital,
          key: norm(nome),
        });
      }
    }
    return out;
  }, [cm.data]);

  const hits = useMemo(() => {
    const t = norm(q);
    if (t.length < 2) return [];
    const starts = index.filter((h) => h.key.startsWith(t));
    const contains = index.filter((h) => !h.key.startsWith(t) && h.key.includes(t));
    // Estados, depois nome exato, capitais e nomes mais curtos (ex.: "Campinas" antes de
    // "Campinas do Sul").
    const score = (h: Hit & { key: string }) => [
      h.kind === 'uf' ? 0 : 1,
      h.key === t ? 0 : 1,
      h.capital ? 0 : 1,
      h.key.length,
    ];
    const cmp = (x: Hit & { key: string }, y: Hit & { key: string }) => {
      const a = score(x);
      const b = score(y);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
      return x.nome.localeCompare(y.nome, 'pt-BR');
    };
    return [...starts.sort(cmp), ...contains.sort(cmp)].slice(0, 40);
  }, [index, q]);

  if (!open) return null;

  const pick = (uf: UfSigla, mun: string | null) => {
    setQ('');
    onPick(uf, mun);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar estado ou cidade"
      className="fixed inset-0 z-50 flex flex-col bg-ink-950/98 pt-safe backdrop-blur-xl"
      data-testid="search-overlay"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <SearchIcon className="h-4 w-4 text-ink-400" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Estado ou cidade"
            aria-label="Estado ou cidade"
            enterKeyHint="search"
            autoComplete="off"
            className="h-full flex-1 bg-transparent text-[16px] text-ink-100 outline-none placeholder:text-ink-400"
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          className="px-1 text-[15px] font-medium text-sky-300"
        >
          Cancelar
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-safe">
        {norm(q).length < 2 ? (
          <>
            <p className="px-1 pb-2 pt-1 text-[12px] uppercase tracking-wide text-ink-400">
              Estados
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {UFS.map((u) => (
                <li key={u.sigla}>
                  <button
                    type="button"
                    onClick={() => pick(u.sigla, null)}
                    className="flex w-full flex-col items-start rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-left active:bg-white/10"
                  >
                    <span className="text-[15px] font-bold">{u.sigla}</span>
                    <span className="w-full truncate text-[11px] text-ink-400">{u.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="px-1 pt-4 text-center text-[12px] text-ink-400">
              Digite ao menos 2 letras para buscar uma cidade.
            </p>
          </>
        ) : hits.length === 0 ? (
          <p className="px-1 pt-6 text-center text-[14px] text-ink-400">
            {cm.isLoading ? 'Carregando lista de cidades…' : 'Nada encontrado.'}
          </p>
        ) : (
          <ul className="divide-y divide-white/5" aria-label="Resultados">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.uf}-${h.mun ?? ''}`}>
                <button
                  type="button"
                  onClick={() => pick(h.uf, h.mun ?? null)}
                  className="flex w-full items-center gap-3 px-1 py-3 text-left active:bg-white/5"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold ${
                      h.kind === 'uf' ? 'bg-sky-500/15 text-sky-300' : 'bg-white/5 text-ink-300'
                    }`}
                  >
                    {h.uf}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink-100">{h.nome}</span>
                    <span className="block truncate text-[12px] text-ink-400">
                      {h.kind === 'uf' ? 'Estado' : `${h.capital ? 'Capital · ' : ''}${h.ufNome}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

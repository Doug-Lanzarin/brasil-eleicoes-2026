import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_ELECTION_ID, ELECTIONS, getElection } from '../../data/elections';
import { isUfSigla, type UfSigla } from '../../data/ufs';

export interface Selection {
  electionId: string;
  turno: 1 | 2;
  uf: UfSigla | null;
}

const envTurno = Number(import.meta.env.VITE_DEFAULT_TURNO);
const DEFAULT_TURNO: 1 | 2 = envTurno === 2 ? 2 : 1;

/** Lê a seleção da URL (?eleicao=&turno=&uf=), para links compartilháveis. */
export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const election =
    getElection(params.get('eleicao') ?? '') ?? getElection(DEFAULT_ELECTION_ID) ?? ELECTIONS[0]!;
  const t = Number(params.get('turno'));
  const turno = election.rounds.some((r) => r.turno === t) ? (t as 1 | 2) : DEFAULT_TURNO;
  const ufRaw = (params.get('uf') ?? '').toUpperCase();
  return { electionId: election.id, turno, uf: isUfSigla(ufRaw) ? ufRaw : null };
}

export function serializeSelection(sel: Selection): string {
  const params = new URLSearchParams();
  if (sel.electionId !== DEFAULT_ELECTION_ID) params.set('eleicao', sel.electionId);
  params.set('turno', String(sel.turno));
  if (sel.uf) params.set('uf', sel.uf);
  return `?${params.toString()}`;
}

export function useSelection() {
  const [sel, setSel] = useState<Selection>(() => parseSelection(window.location.search));

  useEffect(() => {
    const onPop = () => setSel(parseSelection(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const update = useCallback((patch: Partial<Selection>) => {
    setSel((prev) => {
      const next = { ...prev, ...patch };
      const url = serializeSelection(next) + window.location.hash;
      window.history.replaceState(null, '', url);
      return next;
    });
  }, []);

  return [sel, update] as const;
}

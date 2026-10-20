import { ELECTIONS } from '../../data/elections';
import { UFS, type UfSigla } from '../../data/ufs';
import type { ElectionConfig } from '../../types/election';

export function TurnoSwitch({
  election,
  turno,
  onChange,
  className = '',
}: {
  election: ElectionConfig;
  turno: 1 | 2;
  onChange: (t: 1 | 2) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Turno"
      className={`inline-flex rounded-lg border border-ink-600 bg-ink-850 p-0.5 ${className}`}
    >
      {election.rounds.map((r) => {
        const active = r.turno === turno;
        return (
          <button
            key={r.turno}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(r.turno)}
            className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
              active ? 'bg-ink-100 text-ink-900' : 'text-ink-300 hover:text-ink-100'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function ElectionSelect({
  electionId,
  onChange,
}: {
  electionId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Eleição</span>
      <select
        value={electionId}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 rounded-lg border border-ink-600 bg-ink-850 px-2 text-sm text-ink-100"
      >
        {ELECTIONS.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label} — {e.cargoLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AbrangenciaSelect({
  uf,
  onChange,
  className = '',
}: {
  uf: UfSigla | null;
  onChange: (uf: UfSigla | null) => void;
  className?: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="sr-only">Abrangência</span>
      <select
        aria-label="Abrangência"
        value={uf ?? ''}
        onChange={(e) => onChange((e.target.value || null) as UfSigla | null)}
        className="min-h-9 w-full rounded-lg border border-ink-600 bg-ink-850 px-2 text-sm text-ink-100"
      >
        <option value="">Brasil</option>
        {UFS.map((u) => (
          <option key={u.sigla} value={u.sigla}>
            {u.nome} ({u.sigla})
          </option>
        ))}
      </select>
    </label>
  );
}

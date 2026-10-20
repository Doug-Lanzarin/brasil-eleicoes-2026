import { ufByTse } from '../data/ufs';
import type { PrefetchStatus } from '../services/prefetch';
import { formatInt } from '../utils/format';

/** Situação do pré-carregamento dos municípios, com botão para ligar/desligar. */
export function PrefetchIndicator({
  enabled,
  setEnabled,
  status,
  connection,
  now,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  status: PrefetchStatus | null;
  connection: { allowed: boolean; reason?: string };
  now: number;
}) {
  let text: string;
  if (!enabled) {
    text = connection.allowed
      ? 'Pré-carregamento dos municípios desligado.'
      : `Pré-carregamento dos municípios desligado (${connection.reason}).`;
  } else if (!status || status.state === 'idle') {
    text = 'Pré-carregamento dos municípios vai começar em instantes.';
  } else if (status.state === 'paused') {
    text = `Pré-carregamento pausado (${status.pausedReason}).`;
  } else if (status.state === 'running') {
    const uf = status.current ? ufByTse(status.current)?.sigla : null;
    const cur =
      uf && status.currentProgress
        ? ` · ${uf} ${formatInt(status.currentProgress.done)}/${formatInt(status.currentProgress.total)}`
        : '';
    text = `Pré-carregando municípios: ${status.done}/${status.total} estados${cur}`;
  } else {
    const min = status.nextPassAt
      ? Math.max(0, Math.ceil((status.nextPassAt - now) / 60_000))
      : null;
    text = `Municípios de todos os estados salvos neste aparelho${
      min != null ? ` · nova verificação em ${min} min` : ''
    }.`;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400"
      role="status"
      data-testid="prefetch-indicator"
      data-state={enabled ? (status?.state ?? 'idle') : 'off'}
    >
      <span className="tabular">{text}</span>
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className="rounded border border-ink-700 px-1.5 py-0.5 text-ink-300 hover:bg-ink-800"
        title={
          enabled
            ? 'Parar de baixar os municípios em segundo plano'
            : 'Baixar em segundo plano os resultados de todos os municípios (~50 MB na primeira vez; depois, só o que mudar)'
        }
      >
        {enabled ? 'Desligar' : 'Ligar'}
      </button>
    </div>
  );
}

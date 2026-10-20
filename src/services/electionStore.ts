import { MAX_BACKOFF_SECONDS, MIN_REFRESH_SECONDS } from '../data/appConfig';
import type { ElectionConfig, ElectionSnapshot, RoundConfig } from '../types/election';
import * as persistence from './persistence';
import { Poller, type PollerState } from './poller';
import { describeError, TseError, type TseErrorKind } from './tse/errors';
import { loadSnapshot } from './tse/snapshot';

export interface ElectionDataState {
  snapshot: ElectionSnapshot | null;
  /** Origem do snapshot exibido. */
  source: 'network' | 'persisted' | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorKind: TseErrorKind | 'unknown' | null;
  /** O arquivo nacional do turno ainda não foi publicado pelo TSE. */
  notPublished: boolean;
  poller: PollerState;
}

export interface ElectionStoreOptions {
  base: string;
  election: ElectionConfig;
  round: RoundConfig;
  refreshSeconds: number;
  persistedMaxAgeDays: number;
  fetchImpl?: typeof fetch;
  persist?: boolean;
  isOnline?: () => boolean;
}

/**
 * Fonte única dos dados de um turno. Existe exatamente um poller por turno ativo:
 * todos os componentes leem deste store (sem consultas independentes ao TSE).
 */
export class ElectionStore {
  private listeners = new Set<() => void>();
  private poller: Poller<ElectionSnapshot>;
  private state: ElectionDataState;
  readonly opts: ElectionStoreOptions;

  constructor(opts: ElectionStoreOptions) {
    this.opts = opts;
    const persisted =
      opts.persist === false
        ? null
        : persistence.loadSnapshot(
            opts.election.id,
            opts.round.turno,
            opts.round.codigoEleicao,
            opts.persistedMaxAgeDays,
          );
    this.poller = new Poller<ElectionSnapshot>({
      task: (signal) =>
        loadSnapshot({
          base: opts.base,
          election: opts.election,
          round: opts.round,
          previous: this.state.snapshot,
          signal,
          fetchImpl: opts.fetchImpl,
        }),
      intervalMs: Math.max(MIN_REFRESH_SECONDS, opts.refreshSeconds) * 1000,
      minIntervalMs: MIN_REFRESH_SECONDS * 1000,
      maxBackoffMs: MAX_BACKOFF_SECONDS * 1000,
      onSuccess: (snap) => this.handleSuccess(snap),
      onError: (e) => this.handleError(e),
      onStateChange: (poller) => this.patch({ poller }),
      isOnline: opts.isOnline,
    });
    this.state = {
      snapshot: persisted,
      source: persisted ? 'persisted' : null,
      lastSuccessAt: persisted?.fetchedAt ?? null,
      lastAttemptAt: null,
      lastError: null,
      lastErrorKind: null,
      notPublished: false,
      poller: this.poller.getState(),
    };
  }

  private handleSuccess(snap: ElectionSnapshot) {
    const { election, round } = this.opts;
    // Defesa final: nada de outro turno/eleição entra no estado deste store.
    if (
      snap.electionId !== election.id ||
      snap.turno !== round.turno ||
      snap.codigoEleicao !== round.codigoEleicao
    ) {
      this.handleError(new TseError('wrong-election', 'Dados de outro turno descartados.'));
      return;
    }
    const prev = this.state.snapshot;
    // Nunca deixar uma geração mais antiga sobrescrever a atual.
    const accepted = prev && prev.national.idg > snap.national.idg ? prev : snap;
    this.patch({
      snapshot: accepted,
      source: 'network',
      lastSuccessAt: snap.fetchedAt,
      lastAttemptAt: snap.fetchedAt,
      lastError: null,
      lastErrorKind: null,
      notPublished: false,
    });
    if (this.opts.persist !== false) persistence.saveSnapshot(accepted);
  }

  private handleError(e: unknown) {
    const kind = e instanceof TseError ? e.kind : 'unknown';
    if (kind === 'aborted') return;
    this.patch({
      lastAttemptAt: new Date().toISOString(),
      lastError: describeError(e),
      lastErrorKind: kind,
      notPublished: kind === 'not-published' && !this.state.snapshot,
    });
  }

  private patch(p: Partial<ElectionDataState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  start() {
    this.poller.start();
  }

  stop() {
    this.poller.stop();
  }

  refreshNow() {
    return this.poller.refreshNow();
  }
}

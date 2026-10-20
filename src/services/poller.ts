/**
 * Agendador de consultas periódicas com garantias explícitas:
 *  - nunca há duas execuções simultâneas (a próxima só é agendada após o término da atual);
 *  - o intervalo entre inícios nunca é menor que `minIntervalMs` (30 s), inclusive para
 *    atualizações manuais e ao reconectar;
 *  - após falhas consecutivas aplica backoff exponencial (intervalo × 2^n, com teto);
 *  - `stop()` cancela a requisição em andamento (AbortController) e descarta seu resultado.
 */
export interface PollerState {
  inFlight: boolean;
  consecutiveErrors: number;
  lastStartAt: number | null;
  lastEndAt: number | null;
  nextRunAt: number | null;
  offline: boolean;
}

export interface PollerOptions<T> {
  task: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  minIntervalMs: number;
  maxBackoffMs: number;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  onStateChange?: (state: PollerState) => void;
  isOnline?: () => boolean;
  now?: () => number;
}

export function backoffDelay(
  intervalMs: number,
  consecutiveErrors: number,
  maxBackoffMs: number,
): number {
  if (consecutiveErrors <= 0) return intervalMs;
  return Math.max(intervalMs, Math.min(intervalMs * 2 ** consecutiveErrors, maxBackoffMs));
}

export class Poller<T> {
  private opts: PollerOptions<T>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private running = false;
  private state: PollerState = {
    inFlight: false,
    consecutiveErrors: 0,
    lastStartAt: null,
    lastEndAt: null,
    nextRunAt: null,
    offline: false,
  };

  constructor(opts: PollerOptions<T>) {
    if (opts.intervalMs < opts.minIntervalMs) {
      opts = { ...opts, intervalMs: opts.minIntervalMs };
    }
    this.opts = opts;
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  getState(): PollerState {
    return this.state;
  }

  private setState(patch: Partial<PollerState>) {
    this.state = { ...this.state, ...patch };
    this.opts.onStateChange?.(this.state);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleAt(this.earliestAllowedStart());
  }

  stop() {
    this.running = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.setState({ inFlight: false, nextRunAt: null });
  }

  /** Antecipa a próxima consulta, respeitando o intervalo mínimo. Retorna o horário agendado. */
  refreshNow(): number | null {
    if (!this.running || this.state.inFlight) return this.state.nextRunAt;
    const at = this.earliestAllowedStart();
    if (this.state.nextRunAt != null && this.state.nextRunAt <= at) return this.state.nextRunAt;
    this.scheduleAt(at);
    return at;
  }

  /** Momento mais cedo em que uma nova consulta pode começar. */
  earliestAllowedStart(): number {
    const last = this.state.lastStartAt;
    return last == null ? this.now() : Math.max(this.now(), last + this.opts.minIntervalMs);
  }

  private scheduleAt(at: number) {
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, at - this.now());
    this.timer = setTimeout(() => void this.tick(), delay);
    this.setState({ nextRunAt: at });
  }

  private async tick() {
    this.timer = null;
    if (!this.running || this.state.inFlight) return;
    // Proteção extra: nunca iniciar antes do mínimo, mesmo se o timer disparar cedo.
    const earliest = this.earliestAllowedStart();
    if (earliest > this.now()) {
      this.scheduleAt(earliest);
      return;
    }
    if (this.opts.isOnline && !this.opts.isOnline()) {
      this.setState({ offline: true });
      this.scheduleAt(this.now() + this.opts.intervalMs);
      return;
    }

    const gen = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ inFlight: true, offline: false, lastStartAt: this.now(), nextRunAt: null });

    let ok = false;
    let value: T | undefined;
    let error: unknown;
    try {
      value = await this.opts.task(controller.signal);
      ok = true;
    } catch (e) {
      error = e;
    }
    if (gen !== this.generation) return; // parado ou substituído: resultado descartado
    this.controller = null;
    const consecutiveErrors = ok ? 0 : this.state.consecutiveErrors + 1;
    this.setState({ inFlight: false, lastEndAt: this.now(), consecutiveErrors });
    if (ok) this.opts.onSuccess(value as T);
    else this.opts.onError(error);
    if (!this.running) return;
    const delay = backoffDelay(this.opts.intervalMs, consecutiveErrors, this.opts.maxBackoffMs);
    this.scheduleAt(Math.max(this.now() + delay, this.earliestAllowedStart()));
  }
}

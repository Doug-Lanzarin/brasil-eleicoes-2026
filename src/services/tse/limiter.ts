/**
 * Limitador global das requisições ao TSE.
 *
 * O servidor do TSE responde HTTP 429 a rajadas de requisições (observado ao baixar
 * centenas de arquivos municipais). Este limitador:
 *  - limita a concorrência total e, para a prioridade "low" (municípios), também a
 *    concorrência própria e o intervalo mínimo entre inícios;
 *  - dá preferência às requisições "high" (painel nacional/estadual);
 *  - após um 429, pausa TODAS as requisições (5 s, dobrando até 60 s; volta ao normal
 *    após uma resposta bem-sucedida).
 */
export type Priority = 'high' | 'low';

export interface LimiterOptions {
  maxConcurrent: number;
  maxConcurrentLow: number;
  lowGapMs: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
  now?: () => number;
}

interface Waiter {
  priority: Priority;
  resolve: () => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class RequestLimiter {
  private active = { high: 0, low: 0 };
  private queue: Waiter[] = [];
  private lastLowStart = -Infinity;
  private cooldownUntil = 0;
  private cooldownMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opts: LimiterOptions;

  constructor(opts: LimiterOptions) {
    this.opts = opts;
    this.cooldownMs = opts.baseCooldownMs;
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** Aguarda uma vaga. Retorna a função que libera a vaga. */
  acquire(priority: Priority, signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }
      const w: Waiter = {
        priority,
        signal,
        resolve: () => resolve(this.releaser(priority)),
        reject,
      };
      if (signal) {
        w.onAbort = () => {
          this.queue = this.queue.filter((x) => x !== w);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', w.onAbort, { once: true });
      }
      this.queue.push(w);
      this.pump();
    });
  }

  private releaser(priority: Priority) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active[priority]--;
      this.pump();
    };
  }

  /** Informa o resultado HTTP para ajustar a pausa. */
  report(status: number | 'error') {
    if (status === 429) {
      this.cooldownUntil = this.now() + this.cooldownMs;
      this.cooldownMs = Math.min(this.cooldownMs * 2, this.opts.maxCooldownMs);
    } else if (typeof status === 'number' && status < 400) {
      this.cooldownMs = this.opts.baseCooldownMs;
    }
  }

  private schedule(at: number) {
    if (this.timer) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.pump();
      },
      Math.max(0, at - this.now()),
    );
  }

  private pump() {
    const now = this.now();
    if (now < this.cooldownUntil) {
      if (this.queue.length) this.schedule(this.cooldownUntil);
      return;
    }
    // Prioridade alta primeiro.
    for (const priority of ['high', 'low'] as const) {
      for (let i = 0; i < this.queue.length;) {
        const w = this.queue[i]!;
        if (w.priority !== priority) {
          i++;
          continue;
        }
        const total = this.active.high + this.active.low;
        if (total >= this.opts.maxConcurrent) return;
        if (priority === 'low') {
          if (this.active.low >= this.opts.maxConcurrentLow) break;
          const nextAllowed = this.lastLowStart + this.opts.lowGapMs;
          if (now < nextAllowed) {
            this.schedule(nextAllowed);
            break;
          }
          this.lastLowStart = now;
        }
        this.queue.splice(i, 1);
        if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort);
        this.active[priority]++;
        w.resolve();
      }
    }
  }
}

/** Instância compartilhada por toda a aplicação. */
export const tseLimiter = new RequestLimiter({
  maxConcurrent: 6,
  maxConcurrentLow: 3,
  lowGapMs: 150,
  baseCooldownMs: 5_000,
  maxCooldownMs: 60_000,
});

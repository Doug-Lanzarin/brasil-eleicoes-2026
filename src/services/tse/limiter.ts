/**
 * Limitador global das requisições ao TSE.
 *
 * O servidor do TSE responde HTTP 429 a rajadas de requisições (observado ao baixar
 * centenas de arquivos municipais). Este limitador:
 *  - limita a concorrência total e, para a prioridade "low" (municípios), também a
 *    concorrência própria e o intervalo mínimo entre inícios;
 *  - dá preferência às requisições "high" (painel nacional/estadual);
 *  - "background" (pré-carregamento) só usa a rede quando não há nenhuma requisição "low"
 *    em andamento ou na fila, com concorrência e ritmo próprios, mais baixos;
 *  - após um 429, pausa TODAS as requisições (5 s, dobrando até 60 s; volta ao normal
 *    após uma resposta bem-sucedida).
 */
export type Priority = 'high' | 'low' | 'background';

export interface LimiterOptions {
  maxConcurrent: number;
  maxConcurrentLow: number;
  lowGapMs: number;
  /** Pré-carregamento: concorrência e intervalo entre inícios (padrão 1 e 2× lowGapMs). */
  maxConcurrentBackground?: number;
  backgroundGapMs?: number;
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
  private active = { high: 0, low: 0, background: 0 };
  private queue: Waiter[] = [];
  private lastStart = { low: -Infinity, background: -Infinity };
  private timerAt = Infinity;
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
    if (this.timer && this.timerAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.timerAt = Infinity;
        this.pump();
      },
      Math.max(0, at - this.now()),
    );
  }

  /** Há requisições de primeiro plano (municípios do estado aberto) ativas ou na fila? */
  private foregroundBusy() {
    return this.active.low > 0 || this.queue.some((w) => w.priority === 'low');
  }

  private pump() {
    const now = this.now();
    if (now < this.cooldownUntil) {
      if (this.queue.length) this.schedule(this.cooldownUntil);
      return;
    }
    // Prioridade alta primeiro, depois "low" e por último "background".
    for (const priority of ['high', 'low', 'background'] as const) {
      if (priority === 'background' && this.foregroundBusy()) return;
      for (let i = 0; i < this.queue.length;) {
        const w = this.queue[i]!;
        if (w.priority !== priority) {
          i++;
          continue;
        }
        const total = this.active.high + this.active.low + this.active.background;
        if (total >= this.opts.maxConcurrent) return;
        if (priority !== 'high') {
          const max =
            priority === 'low'
              ? this.opts.maxConcurrentLow
              : (this.opts.maxConcurrentBackground ?? 1);
          const gap =
            priority === 'low'
              ? this.opts.lowGapMs
              : (this.opts.backgroundGapMs ?? this.opts.lowGapMs * 2);
          if (this.active[priority] >= max) break;
          const nextAllowed = this.lastStart[priority] + gap;
          if (now < nextAllowed) {
            this.schedule(nextAllowed);
            break;
          }
          this.lastStart[priority] = now;
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
  maxConcurrentBackground: 2,
  backgroundGapMs: 200,
  baseCooldownMs: 5_000,
  maxCooldownMs: 60_000,
});

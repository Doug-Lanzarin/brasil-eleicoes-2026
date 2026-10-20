import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, Poller } from '../services/poller';

const S = 1000;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Poller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('consulta imediatamente e depois a cada 30 s', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    const p = new Poller({
      task,
      intervalMs: 30 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29 * S);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 * S);
    expect(task).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it('não permite intervalo configurado menor que 30 s', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    const p = new Poller({
      task,
      intervalMs: 5 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(29 * S);
    expect(task).toHaveBeenCalledTimes(1);
    p.stop();
  });

  it('nunca executa consultas simultâneas, mesmo se uma demorar mais de 30 s', async () => {
    let active = 0;
    let maxActive = 0;
    const pending: ReturnType<typeof deferred<string>>[] = [];
    const task = vi.fn(() => {
      active++;
      maxActive = Math.max(maxActive, active);
      const d = deferred<string>();
      pending.push(d);
      return d.promise.finally(() => active--);
    });
    const p = new Poller({
      task,
      intervalMs: 30 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    p.refreshNow(); // pedido manual durante a consulta é ignorado
    await vi.advanceTimersByTimeAsync(90 * S); // requisição lenta
    expect(task).toHaveBeenCalledTimes(1);
    pending[0]!.resolve('ok');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30 * S);
    expect(task).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    p.stop();
  });

  it('atualização manual respeita o mínimo de 30 s desde o último início', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    const p = new Poller({
      task,
      intervalMs: 60 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10 * S);
    p.refreshNow();
    await vi.advanceTimersByTimeAsync(19 * S);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 * S);
    expect(task).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it('aplica backoff exponencial após erros e volta ao normal após sucesso', async () => {
    const onError = vi.fn();
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');
    const p = new Poller({
      task,
      intervalMs: 30 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError,
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0); // falha 1 → próxima em 60 s
    await vi.advanceTimersByTimeAsync(59 * S);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 * S); // falha 2 → próxima em 120 s
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(119 * S);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1 * S); // sucesso → 30 s
    expect(task).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * S);
    expect(task).toHaveBeenCalledTimes(4);
    p.stop();
  });

  it('backoffDelay nunca fica abaixo do intervalo e respeita o teto', () => {
    expect(backoffDelay(30, 0, 300)).toBe(30);
    expect(backoffDelay(30, 1, 300)).toBe(60);
    expect(backoffDelay(30, 10, 300)).toBe(300);
  });

  it('stop() cancela a requisição em andamento e descarta o resultado', async () => {
    let signal: AbortSignal | undefined;
    const d = deferred<string>();
    const onSuccess = vi.fn();
    const p = new Poller({
      task: (s) => {
        signal = s;
        return d.promise;
      },
      intervalMs: 30 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess,
      onError: vi.fn(),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    expect(signal?.aborted).toBe(true);
    d.resolve('antigo');
    await vi.advanceTimersByTimeAsync(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('não consulta quando offline, mas continua agendado', async () => {
    let online = false;
    const task = vi.fn().mockResolvedValue('ok');
    const p = new Poller({
      task,
      intervalMs: 30 * S,
      minIntervalMs: 30 * S,
      maxBackoffMs: 300 * S,
      onSuccess: vi.fn(),
      onError: vi.fn(),
      isOnline: () => online,
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
    expect(p.getState().offline).toBe(true);
    online = true;
    await vi.advanceTimersByTimeAsync(30 * S);
    expect(task).toHaveBeenCalledTimes(1);
    p.stop();
  });
});

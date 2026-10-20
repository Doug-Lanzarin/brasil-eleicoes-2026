import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTseJson } from '../services/tse/client';
import { TseError } from '../services/tse/errors';
import { RequestLimiter } from '../services/tse/limiter';

const opts = {
  maxConcurrent: 2,
  maxConcurrentLow: 1,
  lowGapMs: 100,
  baseCooldownMs: 5_000,
  maxCooldownMs: 60_000,
};

describe('RequestLimiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('respeita a concorrência e dá prioridade às requisições "high"', async () => {
    const l = new RequestLimiter(opts);
    const order: string[] = [];
    const r1 = await l.acquire('low');
    const pLow = l.acquire('low').then((r) => (order.push('low'), r));
    const pHigh = l.acquire('high').then((r) => (order.push('high'), r));
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['high']);
    r1();
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['high', 'low']);
    (await pLow)();
    (await pHigh)();
  });

  it('espaça os inícios de prioridade "low"', async () => {
    const l = new RequestLimiter({ ...opts, maxConcurrentLow: 5, maxConcurrent: 5 });
    const started: number[] = [];
    for (let i = 0; i < 3; i++) void l.acquire('low').then(() => started.push(Date.now()));
    await vi.advanceTimersByTimeAsync(250);
    expect(started).toHaveLength(3);
    expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(100);
    expect(started[2]! - started[1]!).toBeGreaterThanOrEqual(100);
  });

  it('após HTTP 429 pausa todas as requisições, com pausa crescente', async () => {
    const l = new RequestLimiter(opts);
    l.report(429);
    let got = false;
    void l.acquire('high').then(() => (got = true));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(got).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toBe(true);
    l.report(429); // segunda pausa: 10 s
    let got2 = false;
    void l.acquire('high').then(() => (got2 = true));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(got2).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(got2).toBe(true);
  });

  it('remove da fila requisições canceladas', async () => {
    const l = new RequestLimiter({ ...opts, maxConcurrent: 1 });
    const release = await l.acquire('high');
    const ctrl = new AbortController();
    const p = l.acquire('high', ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toBeDefined();
    release();
  });
});

describe('fetchTseJson com HTTP 429', () => {
  it('classifica como "rate-limited" e aciona a pausa do limitador', async () => {
    const l = new RequestLimiter(opts);
    const spy = vi.spyOn(l, 'report');
    const fetchImpl = (async () => new Response('', { status: 429 })) as typeof fetch;
    const err = await fetchTseJson('https://x/y.json', { fetchImpl, limiter: l }).catch((e) => e);
    expect(err).toBeInstanceOf(TseError);
    expect((err as TseError).kind).toBe('rate-limited');
    expect(spy).toHaveBeenCalledWith(429);
  });
});

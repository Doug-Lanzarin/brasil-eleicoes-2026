import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELECTIONS, getRound } from '../data/elections';
import { ElectionStore } from '../services/electionStore';
import { loadSnapshot as loadPersisted, saveSnapshot, storageKey } from '../services/persistence';
import { defaultRouter, mockFetch } from './fixtures/tse';

const election = ELECTIONS[0]!;
const round1 = getRound(election, 1)!;
const round2 = getRound(election, 2)!;
const base = 'https://fixture.test/oficial';

function makeStore(fetchImpl: typeof fetch, round = round1, persist = true) {
  return new ElectionStore({
    base,
    election,
    round,
    refreshSeconds: 30,
    persistedMaxAgeDays: 7,
    fetchImpl,
    persist,
  });
}

describe('ElectionStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mantém o último conjunto válido quando a atualização seguinte falha', async () => {
    let fail = false;
    const router = defaultRouter({ national: { st: 40 } });
    const { impl } = mockFetch((url) =>
      fail ? new Response('indisponível', { status: 503 }) : router(url),
    );
    const store = makeStore(impl);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = store.getState();
    expect(first.snapshot?.national.progress.secoesTotalizadas).toBe(40);
    expect(first.lastError).toBeNull();

    fail = true;
    await vi.advanceTimersByTimeAsync(30_000);
    const after = store.getState();
    expect(after.snapshot).toBe(first.snapshot);
    expect(after.lastSuccessAt).toBe(first.lastSuccessAt);
    expect(after.lastError).toMatch(/HTTP 503/);
    expect(after.lastErrorKind).toBe('http');
    store.stop();
  });

  it('indica "não publicado" quando o turno ainda não tem arquivos', async () => {
    const { impl } = mockFetch(() => undefined);
    const store = makeStore(impl, round2);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().notPublished).toBe(true);
    expect(store.getState().snapshot).toBeNull();
    store.stop();
  });

  it('persiste localmente e reabre com o último resultado marcado como salvo', async () => {
    const { impl } = mockFetch(defaultRouter({}));
    const store = makeStore(impl);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.stop();
    expect(localStorage.getItem(storageKey(election.id, 1))).toBeTruthy();

    const offline = mockFetch(() => new Response('', { status: 503 }));
    const reopened = makeStore(offline.impl);
    expect(reopened.getState().source).toBe('persisted');
    expect(reopened.getState().snapshot?.codigoEleicao).toBe('6257');
  });

  it('não carrega dados salvos de outro turno nem dados expirados', async () => {
    const { impl } = mockFetch(defaultRouter({}));
    const store = makeStore(impl);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.stop();
    const snap = store.getState().snapshot!;
    // Turno 2 não enxerga o snapshot do turno 1.
    expect(loadPersisted(election.id, 2, '6258', 7)).toBeNull();
    // Mesmo turno com código de eleição diferente é descartado.
    saveSnapshot(snap);
    expect(loadPersisted(election.id, 1, '9999', 7)).toBeNull();
    // Expirado.
    saveSnapshot(snap);
    expect(loadPersisted(election.id, 1, '6257', 7, Date.now() + 8 * 86_400_000)).toBeNull();
  });
});

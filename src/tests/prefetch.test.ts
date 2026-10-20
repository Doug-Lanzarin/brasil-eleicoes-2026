import { describe, expect, it, vi } from 'vitest';
import { ELECTIONS, getRound } from '../data/elections';
import { loadMunicipalCache } from '../services/municipalCache';
import { connectionAllowsPrefetch, MunicipalPrefetcher } from '../services/prefetch';
import type { MunicipioInfo } from '../services/tse/adapter';
import { RequestLimiter } from '../services/tse/limiter';
import { makeResultado, mockFetch } from './fixtures/tse';

const election = ELECTIONS[0]!;
const round = getRound(election, 1)!;

/** Municípios FICTÍCIOS de duas UFs. */
const MUNS = new Map<string, MunicipioInfo[]>([
  [
    'ac',
    [
      { codigo: '01120', ibge: '1', nome: 'A', capital: false },
      { codigo: '01392', ibge: '2', nome: 'B', capital: true },
    ],
  ],
  ['rr', [{ codigo: '03018', ibge: '3', nome: 'C', capital: true }]],
]);

function ab(uf: string, st = 5) {
  return {
    ele: '6257',
    t: '1',
    dg: '04/10/2026',
    hg: '20:00:00',
    idg: '1',
    abr: (MUNS.get(uf) ?? []).map((m) => ({
      and: 'f',
      tpabr: 'mun',
      cdabr: m.codigo,
      dt: '04/10/2026',
      ht: '19:00:00',
      s: { ts: '10', st: String(st) },
    })),
  };
}

function router(url: string) {
  const a = /dados\/([a-z]{2})\/([a-z]{2})-e006257-ab\.json$/.exec(url);
  if (a) return ab(a[1]!);
  const m = /dados\/([a-z]{2})\/([a-z]{2})(\d{5})-c0001-e006257-u\.json$/.exec(url);
  if (m) return makeResultado({ tpabr: 'mu', cdabr: m[3] });
  return undefined;
}

function make(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof MunicipalPrefetcher>[0]> = {},
) {
  return new MunicipalPrefetcher({
    base: 'https://fixture.test/oficial',
    election,
    round,
    maxAgeDays: 7,
    getMunicipios: async () => MUNS,
    getOpenUf: () => null,
    isUfFinalized: () => false,
    ufs: ['ac', 'rr'],
    fetchImpl,
    limiter: null,
    passIntervalMs: 60_000,
    ...extra,
  });
}

const until = (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true), { timeout: 3000 });

describe('MunicipalPrefetcher', () => {
  it('pré-carrega todas as UFs e salva no aparelho', async () => {
    const { impl, calls } = mockFetch(router);
    const got: string[] = [];
    const p = make(impl, { onSnapshot: (uf) => got.push(uf) });
    p.start();
    await until(() => p.getStatus().state === 'waiting');
    p.stop();
    expect(got).toEqual(['ac', 'rr']);
    expect(calls.filter((c) => c.endsWith('-u.json'))).toHaveLength(3);
    const ac = await loadMunicipalCache(
      { electionId: election.id, codigoEleicao: '6257', turno: 1, uf: 'ac' },
      7,
    );
    expect(Object.keys(ac!.snapshot.entries).sort()).toEqual(['01120', '01392']);
  });

  it('na passada seguinte só baixa o que mudou; pula UF finalizada e completa', async () => {
    const first = mockFetch(router);
    const p1 = make(first.impl);
    p1.start();
    await until(() => p1.getStatus().state === 'waiting');
    p1.stop();

    const second = mockFetch(router);
    const p2 = make(second.impl, { isUfFinalized: (uf) => uf === 'rr' });
    p2.start();
    await until(() => p2.getStatus().state === 'waiting');
    p2.stop();
    // AC: andamento inalterado → nenhum arquivo municipal; RR finalizada e completa → nem consulta.
    expect(second.calls.filter((c) => c.endsWith('-u.json'))).toHaveLength(0);
    expect(second.calls.some((c) => c.includes('/rr/'))).toBe(false);
  });

  it('pula a UF aberta pelo usuário (tratada em primeiro plano)', async () => {
    const { impl, calls } = mockFetch(router);
    const p = make(impl, { getOpenUf: () => 'ac' });
    p.start();
    await until(() => p.getStatus().state === 'waiting');
    p.stop();
    expect(calls.some((c) => c.includes('/ac/'))).toBe(false);
    expect(calls.some((c) => c.includes('/rr/'))).toBe(true);
  });

  it('pausa e retoma sem refazer o que já salvou', async () => {
    const { impl } = mockFetch(router);
    const p = make(impl);
    p.pause('aba em segundo plano');
    p.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(p.getStatus()).toMatchObject({ state: 'paused', pausedReason: 'aba em segundo plano' });
    p.resume('aba em segundo plano');
    await until(() => p.getStatus().state === 'waiting');
    p.stop();
  });
});

describe('prioridade "background" no limitador', () => {
  it('só libera o pré-carregamento quando não há requisição de primeiro plano', async () => {
    const l = new RequestLimiter({
      maxConcurrent: 6,
      maxConcurrentLow: 3,
      lowGapMs: 0,
      maxConcurrentBackground: 2,
      backgroundGapMs: 0,
      baseCooldownMs: 5_000,
      maxCooldownMs: 60_000,
    });
    const releaseLow = await l.acquire('low');
    let bg = false;
    const pBg = l.acquire('background').then((r) => ((bg = true), r));
    await new Promise((r) => setTimeout(r, 10));
    expect(bg).toBe(false);
    releaseLow();
    (await pBg)();
    expect(bg).toBe(true);
  });
});

describe('connectionAllowsPrefetch', () => {
  const nav = (connection: unknown) => ({ connection }) as unknown as Navigator;
  it('respeita economia de dados, rede celular e conexão lenta', () => {
    expect(connectionAllowsPrefetch(nav(undefined)).allowed).toBe(true);
    expect(connectionAllowsPrefetch(nav({ saveData: true })).allowed).toBe(false);
    expect(connectionAllowsPrefetch(nav({ type: 'cellular' })).allowed).toBe(false);
    expect(connectionAllowsPrefetch(nav({ effectiveType: '3g' })).allowed).toBe(false);
    expect(connectionAllowsPrefetch(nav({ effectiveType: 'slow-2g' })).allowed).toBe(false);
    expect(connectionAllowsPrefetch(nav({ effectiveType: '4g', type: 'wifi' })).allowed).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { ELECTIONS, getRound } from '../data/elections';
import type { MunicipioInfo } from '../services/tse/adapter';
import { loadMunicipalSnapshot } from '../services/tse/municipal';
import { cand, FIXTURE_FLAVIO, FIXTURE_LULA, makeResultado, mockFetch } from './fixtures/tse';

const election = ELECTIONS[0]!;
const round1 = getRound(election, 1)!;
const base = 'https://fixture.test/oficial';

/** Municípios FICTÍCIOS para teste. */
const MUNS: MunicipioInfo[] = [
  { codigo: '01120', ibge: '1200013', nome: 'MUNICÍPIO A', capital: false },
  { codigo: '01392', ibge: '1200401', nome: 'MUNICÍPIO B', capital: true },
  { codigo: '01570', ibge: '1200054', nome: 'MUNICÍPIO C', capital: false },
];

function abFixture(stamps: Record<string, number>, ele = '6257', t = '1') {
  return {
    ele,
    t,
    dg: '04/10/2026',
    hg: '20:00:00',
    idg: '1',
    abr: Object.entries(stamps).map(([cd, st]) => ({
      and: 'p',
      tpabr: 'mun',
      cdabr: cd,
      dt: '04/10/2026',
      ht: '19:00:00',
      s: { ts: '10', st: String(st) },
    })),
  };
}

function router(opts: {
  stamps?: Record<string, number>;
  per?: (cod: string) => Parameters<typeof makeResultado>[0] | Response | undefined;
}) {
  return (url: string) => {
    if (url.endsWith('/dados/ac/ac-e006257-ab.json')) {
      return abFixture(opts.stamps ?? { '01120': 5, '01392': 5, '01570': 5 });
    }
    const m = /dados\/ac\/ac(\d{5})-c0001-e006257-u\.json$/.exec(url);
    if (m) {
      const custom = opts.per?.(m[1]!);
      if (custom instanceof Response) return custom;
      return makeResultado({ tpabr: 'mu', cdabr: m[1], ...custom });
    }
    return undefined;
  };
}

const load = (
  fetchImpl: typeof fetch,
  previous: Awaited<ReturnType<typeof loadMunicipalSnapshot>> | null = null,
) =>
  loadMunicipalSnapshot({
    base,
    election,
    round: round1,
    uf: 'ac',
    municipios: MUNS,
    previous,
    fetchImpl,
    limiter: null,
  });

describe('loadMunicipalSnapshot', () => {
  it('carrega o resultado oficial de cada município da UF', async () => {
    const { impl, calls } = mockFetch(
      router({
        per: (c) =>
          c === '01392'
            ? { candidates: [cand(FIXTURE_LULA, 10), cand(FIXTURE_FLAVIO, 30)] }
            : undefined,
      }),
    );
    const snap = await load(impl);
    expect(Object.keys(snap.entries)).toHaveLength(3);
    expect(snap.entries['01392']!.result!.candidatos[0]!.sqcand).toBe(FIXTURE_FLAVIO.sqcand);
    expect(calls).toContain(`${base}/ele2026/6257/dados/ac/ac01120-c0001-e006257-u.json`);
  });

  it('só baixa novamente municípios cujo andamento mudou', async () => {
    const first = mockFetch(router({}));
    const prev = await load(first.impl);
    const second = mockFetch(router({ stamps: { '01120': 5, '01392': 7, '01570': 5 } }));
    const snap = await load(second.impl, prev);
    expect(second.calls.filter((c) => c.endsWith('-u.json'))).toEqual([
      `${base}/ele2026/6257/dados/ac/ac01392-c0001-e006257-u.json`,
    ]);
    expect(snap.entries['01120']).toBe(prev.entries['01120']);
  });

  it('preserva o último resultado válido do município quando a atualização falha', async () => {
    const prev = await load(mockFetch(router({})).impl);
    const failing = mockFetch(
      router({
        stamps: { '01120': 9, '01392': 5, '01570': 5 },
        per: (c) => (c === '01120' ? new Response('', { status: 500 }) : undefined),
      }),
    );
    const snap = await load(failing.impl, prev);
    expect(snap.entries['01120']!.status).toBe('stale');
    expect(snap.entries['01120']!.result).toEqual(prev.entries['01120']!.result);
  });

  it('rejeita arquivo de outro turno e arquivo de outro município', async () => {
    const { impl } = mockFetch(
      router({
        per: (c) =>
          c === '01120' ? { ele: '6258', t: '2' } : c === '01570' ? { cdabr: '99999' } : undefined,
      }),
    );
    const snap = await load(impl);
    expect(snap.entries['01120']).toMatchObject({ status: 'invalid', result: null });
    expect(snap.entries['01570']).toMatchObject({ status: 'invalid', result: null });
    expect(snap.entries['01392']!.status).toBe('ok');
  });

  it('município ainda não publicado fica indisponível', async () => {
    const { impl } = mockFetch(
      router({ per: (c) => (c === '01570' ? new Response('', { status: 404 }) : undefined) }),
    );
    const snap = await load(impl);
    expect(snap.entries['01570']).toMatchObject({ status: 'unavailable', result: null });
  });

  it('não reaproveita dados municipais de outro turno', async () => {
    const prev = await load(mockFetch(router({})).impl);
    const other = { ...prev, turno: 2 as const, codigoEleicao: '6258' };
    const second = mockFetch(router({}));
    await load(second.impl, other);
    expect(second.calls.filter((c) => c.endsWith('-u.json'))).toHaveLength(3);
  });

  it('limite de requisições (429): município fica pendente e é tentado no próximo ciclo', async () => {
    const first = mockFetch(
      router({ per: (c) => (c === '01392' ? new Response('', { status: 429 }) : undefined) }),
    );
    const prev = await load(first.impl);
    expect(prev.entries['01392']).toMatchObject({ status: 'pending', result: null });
    const second = mockFetch(router({}));
    const snap = await load(second.impl, prev);
    expect(second.calls.filter((c) => c.endsWith('-u.json'))).toEqual([
      `${base}/ele2026/6257/dados/ac/ac01392-c0001-e006257-u.json`,
    ]);
    expect(snap.entries['01392']!.status).toBe('ok');
  });

  it('andamento indisponível por 429 não força baixar tudo de novo', async () => {
    const prev = await load(mockFetch(router({})).impl);
    const second = mockFetch((url) =>
      url.endsWith('-ab.json') ? new Response('', { status: 429 }) : router({})(url),
    );
    await load(second.impl, prev);
    expect(second.calls.filter((c) => c.endsWith('-u.json'))).toHaveLength(0);
  });
});

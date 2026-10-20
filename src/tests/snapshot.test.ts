import { describe, expect, it } from 'vitest';
import { ELECTIONS, getRound } from '../data/elections';
import { UFS } from '../data/ufs';
import { TseError } from '../services/tse/errors';
import { loadSnapshot } from '../services/tse/snapshot';
import { cand, defaultRouter, FIXTURE_FLAVIO, FIXTURE_LULA, mockFetch } from './fixtures/tse';

const election = ELECTIONS[0]!;
const round1 = getRound(election, 1)!;
const round2 = getRound(election, 2)!;
const base = 'https://fixture.test/oficial';

describe('loadSnapshot', () => {
  it('monta Brasil + 27 UFs + exterior a partir dos arquivos oficiais', async () => {
    const { impl, calls } = mockFetch(
      defaultRouter({
        perUf: (c) =>
          c === 'sp' ? { candidates: [cand(FIXTURE_LULA, 1), cand(FIXTURE_FLAVIO, 2)] } : undefined,
      }),
    );
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: impl,
    });
    expect(Object.keys(snap.states)).toHaveLength(27);
    expect(snap.states.SP.result!.codigo).toBe('sp');
    expect(snap.states.SP.result!.candidatos[0]!.sqcand).toBe(FIXTURE_FLAVIO.sqcand);
    expect(snap.exterior?.result?.codigo).toBe('zz');
    expect(calls).toContain(`${base}/ele2026/6257/dados/br/br-c0001-e006257-u.json`);
    expect(calls).toContain(`${base}/ele2026/6257/dados/sp/sp-c0001-e006257-u.json`);
    expect(calls).toHaveLength(2 + 28);
  });

  it('não baixa novamente UFs cujo andamento não mudou', async () => {
    const first = mockFetch(defaultRouter({}));
    const prev = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: first.impl,
    });
    const second = mockFetch(defaultRouter({ ab: { idg: 1001, stamps: { sp: { st: 60 } } } }));
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: prev,
      fetchImpl: second.impl,
    });
    const ufCalls = second.calls.filter((u) => /dados\/(?!br\/)/.test(u));
    expect(ufCalls).toEqual([`${base}/ele2026/6257/dados/sp/sp-c0001-e006257-u.json`]);
    expect(snap.states.RJ).toBe(prev.states.RJ);
  });

  it('preserva o último resultado válido de uma UF quando a atualização dela falha', async () => {
    const first = mockFetch(defaultRouter({}));
    const prev = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: first.impl,
    });
    const second = mockFetch(
      defaultRouter({
        ab: { stamps: { sp: { st: 70 } } },
        perUf: (c) => (c === 'sp' ? new Response('erro', { status: 500 }) : undefined),
      }),
    );
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: prev,
      fetchImpl: second.impl,
    });
    expect(snap.states.SP.status).toBe('stale');
    expect(snap.states.SP.result).toEqual(prev.states.SP.result);
    expect(snap.states.SP.message).toMatch(/último resultado válido/);
  });

  it('UF ainda não publicada fica indisponível (sem inventar zeros)', async () => {
    const { impl } = mockFetch(
      defaultRouter({ perUf: (c) => (c === 'ac' ? new Response('', { status: 404 }) : undefined) }),
    );
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: impl,
    });
    expect(snap.states.AC).toMatchObject({ status: 'unavailable', result: null });
  });

  it('UF com arquivo de outro turno é rejeitada', async () => {
    const { impl } = mockFetch(
      defaultRouter({ perUf: (c) => (c === 'ba' ? { ele: '6258', t: '2' } : undefined) }),
    );
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: impl,
    });
    expect(snap.states.BA.status).toBe('invalid');
    expect(snap.states.BA.result).toBeNull();
  });

  it('arquivo nacional de outro turno invalida o ciclo inteiro', async () => {
    const { impl } = mockFetch(
      defaultRouter({ national: { ele: '6257', t: '1' }, ele: '6258', t: '2' }),
    );
    await expect(
      loadSnapshot({ base, election, round: round2, previous: null, fetchImpl: impl }),
    ).rejects.toMatchObject({ kind: 'wrong-election' });
  });

  it('não regride para uma geração (idg) mais antiga', async () => {
    const first = mockFetch(defaultRouter({ national: { idg: 500, st: 80 } }));
    const prev = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: first.impl,
    });
    const second = mockFetch(defaultRouter({ national: { idg: 400, st: 60 } }));
    const snap = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: prev,
      fetchImpl: second.impl,
    });
    expect(snap.national.idg).toBe(500);
    expect(snap.national.progress.secoesTotalizadas).toBe(80);
  });

  it('não reaproveita dados do 1º turno ao consultar o 2º turno', async () => {
    const first = mockFetch(defaultRouter({}));
    const prev1 = await loadSnapshot({
      base,
      election,
      round: round1,
      previous: null,
      fetchImpl: first.impl,
    });
    const second = mockFetch(
      defaultRouter({ ele: '6258', t: '2', ab: { ele: '6258', t: '2', stamps: {} } }),
    );
    const snap2 = await loadSnapshot({
      base,
      election,
      round: round2,
      previous: prev1,
      fetchImpl: second.impl,
    });
    expect(snap2.turno).toBe(2);
    expect(snap2.codigoEleicao).toBe('6258');
    for (const u of UFS) expect(snap2.states[u.sigla].result?.codigoEleicao).toBe('6258');
    expect(second.calls.filter((c) => c.includes('-u.json'))).toHaveLength(29);
  });

  it('propaga "não publicado" quando o arquivo nacional não existe', async () => {
    const { impl } = mockFetch(() => undefined);
    const err = await loadSnapshot({
      base,
      election,
      round: round2,
      previous: null,
      fetchImpl: impl,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TseError);
    expect(err.kind).toBe('not-published');
  });
});

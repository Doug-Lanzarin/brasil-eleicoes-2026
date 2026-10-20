import { describe, expect, it } from 'vitest';
import { ELECTIONS } from '../data/elections';
import {
  loadMunicipalCache,
  pruneMunicipalCache,
  saveMunicipalCache,
} from '../services/municipalCache';
import { parseResultado } from '../services/tse/adapter';
import type { MunicipalSnapshot } from '../services/tse/municipal';
import { cand, FIXTURE_FLAVIO, FIXTURE_LULA, FIXTURE_OTHER, makeResultado } from './fixtures/tse';

const election = ELECTIONS[0]!;
const expected = { electionId: election.id, codigoEleicao: '6257', turno: 1, uf: 'ac' };

/** Snapshot FICTÍCIO para teste. */
function snapshot(): MunicipalSnapshot {
  const result = parseResultado(
    makeResultado({
      tpabr: 'mu',
      cdabr: '01120',
      candidates: [cand(FIXTURE_LULA, 10), cand(FIXTURE_FLAVIO, 20), cand(FIXTURE_OTHER, 5)],
    }),
    { codigoEleicao: '6257', turno: 1, cargo: '1', tipo: 'mu', codigo: '01120' },
  );
  const base = { ibge: '1', nome: 'X', capital: false };
  return {
    electionId: election.id,
    turno: 1,
    codigoEleicao: '6257',
    uf: 'ac',
    fetchedAt: '2026-10-04T22:00:00Z',
    entries: {
      '01120': { ...base, codigo: '01120', status: 'ok', result, stamp: 's1' },
      '01392': { ...base, codigo: '01392', status: 'pending', result: null, stamp: null },
      '01570': { ...base, codigo: '01570', status: 'stale', result, stamp: 's2', message: 'x' },
    },
  };
}

describe('cache municipal (IndexedDB)', () => {
  it('salva e recupera, guardando só o necessário', async () => {
    await saveMunicipalCache(snapshot(), election);
    const got = await loadMunicipalCache(expected, 7);
    expect(got).not.toBeNull();
    const e = got!.snapshot.entries;
    // Pendente não vira cache; "stale" volta sem carimbo para ser consultado de novo.
    expect(Object.keys(e).sort()).toEqual(['01120', '01570']);
    expect(e['01570']!.stamp).toBeNull();
    expect(e['01120']!.stamp).toBe('s1');
    // Somente os candidatos configurados (Lula e Flávio); válidos continuam os oficiais.
    expect(e['01120']!.result!.candidatos.map((c) => c.sqcand).sort()).toEqual(
      [FIXTURE_LULA.sqcand, FIXTURE_FLAVIO.sqcand].sort(),
    );
    expect(e['01120']!.result!.votos.validos).toBe(35);
  });

  it('nunca devolve dados de outro turno ou UF', async () => {
    await saveMunicipalCache(snapshot(), election);
    expect(
      await loadMunicipalCache({ ...expected, codigoEleicao: '6258', turno: 2 }, 7),
    ).toBeNull();
    expect(await loadMunicipalCache({ ...expected, uf: 'sp' }, 7)).toBeNull();
  });

  it('descarta registros expirados', async () => {
    const t0 = Date.parse('2026-10-05T00:00:00Z');
    await saveMunicipalCache(snapshot(), election, t0);
    expect(await loadMunicipalCache(expected, 7, t0 + 6 * 86_400_000)).not.toBeNull();
    expect(await loadMunicipalCache(expected, 7, t0 + 8 * 86_400_000)).toBeNull();
    // Foi removido de vez.
    expect(await loadMunicipalCache(expected, 7, t0)).toBeNull();
  });

  it('limpeza remove apenas os expirados', async () => {
    const t0 = Date.parse('2026-10-05T00:00:00Z');
    await saveMunicipalCache(snapshot(), election, t0);
    await saveMunicipalCache({ ...snapshot(), uf: 'rr' }, election, t0 + 5 * 86_400_000);
    await pruneMunicipalCache(7, t0 + 9 * 86_400_000);
    expect(await loadMunicipalCache(expected, 30, t0 + 9 * 86_400_000)).toBeNull();
    expect(
      await loadMunicipalCache({ ...expected, uf: 'rr' }, 30, t0 + 9 * 86_400_000),
    ).not.toBeNull();
  });
});

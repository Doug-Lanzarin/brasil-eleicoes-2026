import { describe, expect, it } from 'vitest';
import { ELECTIONS } from '../data/elections';
import { parseResultado } from '../services/tse/adapter';
import type { StateEntry } from '../types/election';
import {
  compareCandidates,
  computeProgress,
  determineLeader,
  findCandidate,
  mapFillFor,
  percentOfValid,
} from '../utils/calc';
import { cand, FIXTURE_FLAVIO, FIXTURE_LULA, FIXTURE_OTHER, makeResultado } from './fixtures/tse';

const election = ELECTIONS[0]!;
const [lulaCfg, flavioCfg] = election.candidates;

function parse(opts: Parameters<typeof makeResultado>[0] = {}) {
  return parseResultado(makeResultado({ tpabr: 'uf', cdabr: 'sp', ...opts }), {
    codigoEleicao: '6257',
    turno: 1,
    cargo: '1',
    tipo: 'uf',
    codigo: 'sp',
  });
}

function entry(opts: Parameters<typeof makeResultado>[0] = {}): StateEntry {
  return { uf: 'SP', status: 'ok', result: parse(opts), stamp: 'x' };
}

describe('identificação dos candidatos', () => {
  it('localiza Lula e Flávio pelo sequencial (sqcand) e confere o número', () => {
    const r = parse({
      candidates: [cand(FIXTURE_OTHER, 50), cand(FIXTURE_FLAVIO, 300), cand(FIXTURE_LULA, 200)],
    });
    expect(findCandidate(r.candidatos, lulaCfg)?.votos).toBe(200);
    expect(findCandidate(r.candidatos, flavioCfg)?.votos).toBe(300);
  });

  it('não identifica pelo nome: nome igual com sqcand diferente não é aceito', () => {
    const r = parse({
      candidates: [cand({ ...FIXTURE_LULA, sqcand: '123' }, 200), cand(FIXTURE_FLAVIO, 300)],
    });
    expect(findCandidate(r.candidatos, lulaCfg)).toBeNull();
  });

  it('rejeita sqcand correto com número de urna divergente', () => {
    const r = parse({
      candidates: [cand({ ...FIXTURE_LULA, n: '99' }, 200), cand(FIXTURE_FLAVIO, 300)],
    });
    expect(findCandidate(r.candidatos, lulaCfg)).toBeNull();
  });
});

describe('percentuais e diferenças', () => {
  it('usa votos válidos como denominador (inclui outros candidatos)', () => {
    const r = parse({
      candidates: [cand(FIXTURE_LULA, 450), cand(FIXTURE_FLAVIO, 470), cand(FIXTURE_OTHER, 80)],
      brancos: 500,
      nulos: 500,
    });
    const cmp = compareCandidates(r, election);
    expect(r.votos.validos).toBe(1000);
    expect(cmp.pctValidos.lula).toBeCloseTo(45, 10);
    expect(cmp.pctValidos.flavio).toBeCloseTo(47, 10);
    // Brancos e nulos não entram no denominador.
    expect(cmp.diffVotes).toBe(20);
    expect(cmp.diffPP).toBeCloseTo(2, 10);
    expect(cmp.leader).toBe('flavio');
  });

  it('percentOfValid retorna null para denominador zero ou inconsistente', () => {
    expect(percentOfValid(10, 0)).toBeNull();
    expect(percentOfValid(null, 100)).toBeNull();
    expect(percentOfValid(200, 100)).toBeNull();
    expect(percentOfValid(25, 100)).toBe(25);
  });

  it('confere com o percentual oficial publicado (pvapn)', () => {
    const r = parse({ candidates: [cand(FIXTURE_LULA, 1234), cand(FIXTURE_FLAVIO, 4321)] });
    const cmp = compareCandidates(r, election);
    const oficial = findCandidate(r.candidatos, lulaCfg)!.percentualOficial!;
    expect(cmp.pctValidos.lula).toBeCloseTo(oficial, 6);
  });

  it('diferença em p.p. é a subtração dos percentuais', () => {
    const r = parse({ candidates: [cand(FIXTURE_LULA, 523), cand(FIXTURE_FLAVIO, 477)] });
    const cmp = compareCandidates(r, election);
    expect(cmp.diffPP).toBeCloseTo(cmp.pctValidos.lula! - cmp.pctValidos.flavio!, 12);
    expect(cmp.diffVotes).toBe(46);
  });
});

describe('cor dos estados', () => {
  it('vermelho quando Lula tem mais votos', () => {
    expect(
      mapFillFor(
        entry({ candidates: [cand(FIXTURE_LULA, 10), cand(FIXTURE_FLAVIO, 9)] }),
        election,
      ),
    ).toBe('lula');
  });
  it('azul quando Flávio tem mais votos', () => {
    expect(
      mapFillFor(
        entry({ candidates: [cand(FIXTURE_LULA, 9), cand(FIXTURE_FLAVIO, 10)] }),
        election,
      ),
    ).toBe('flavio');
  });
  it('compara só os dois, mesmo que outro candidato lidere a UF', () => {
    const e = entry({
      candidates: [cand(FIXTURE_OTHER, 1000), cand(FIXTURE_LULA, 10), cand(FIXTURE_FLAVIO, 11)],
    });
    expect(mapFillFor(e, election)).toBe('flavio');
  });
  it('empate → cor neutra de empate', () => {
    const e = entry({ candidates: [cand(FIXTURE_LULA, 500), cand(FIXTURE_FLAVIO, 500)] });
    expect(mapFillFor(e, election)).toBe('tie');
    expect(compareCandidates(e.result, election).leader).toBe('tie');
    expect(compareCandidates(e.result, election).diffVotes).toBe(0);
  });
  it('sem votos apurados → cinza "sem dados" (nunca vermelho/azul)', () => {
    const e = entry({
      candidates: [cand(FIXTURE_LULA, 0), cand(FIXTURE_FLAVIO, 0)],
      st: 0,
      brancos: 0,
      nulos: 0,
    });
    expect(mapFillFor(e, election)).toBe('no-data');
  });
  it('estado sem resultado disponível → indisponível', () => {
    expect(mapFillFor(undefined, election)).toBe('unavailable');
    expect(mapFillFor({ status: 'unavailable', result: null }, election)).toBe('unavailable');
    expect(mapFillFor({ status: 'invalid', result: null }, election)).toBe('unavailable');
  });
  it('candidato ausente no arquivo → sem dados (não presume zero)', () => {
    const e = entry({ candidates: [cand(FIXTURE_LULA, 10), cand(FIXTURE_OTHER, 5)] });
    const cmp = compareCandidates(e.result, election);
    expect(cmp.votes.flavio).toBeNull();
    expect(cmp.leader).toBe('none');
    expect(mapFillFor(e, election)).toBe('no-data');
  });
  it('determineLeader', () => {
    expect(determineLeader(null, 1, ['lula', 'flavio'])).toBe('none');
    expect(determineLeader(0, 0, ['lula', 'flavio'])).toBe('none');
    expect(determineLeader(2, 2, ['lula', 'flavio'])).toBe('tie');
  });
});

describe('progresso da apuração', () => {
  it('calcula percentual e status', () => {
    expect(computeProgress(0, 200, false)).toMatchObject({ percentual: 0, status: 'nao-iniciada' });
    expect(computeProgress(50, 200, false)).toMatchObject({ percentual: 25, status: 'parcial' });
    expect(computeProgress(200, 200, false).status).toBe('parcial'); // só "finalizada" com sinal oficial
    expect(computeProgress(200, 200, true)).toMatchObject({
      percentual: 100,
      status: 'finalizada',
    });
    expect(computeProgress(0, 0, false).percentual).toBe(0);
  });
});

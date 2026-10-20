import { describe, expect, it } from 'vitest';
import { ELECTIONS } from '../data/elections';
import {
  candidateIssues,
  parseAbrangencia,
  parseMunicipiosConfig,
  parseResultado,
  type ExpectedArea,
} from '../services/tse/adapter';
import { TseError } from '../services/tse/errors';
import {
  cand,
  FIXTURE_FLAVIO,
  FIXTURE_LULA,
  FIXTURE_OTHER,
  makeAbrangencia,
  makeResultado,
} from './fixtures/tse';

const election = ELECTIONS[0]!;
const BR1: ExpectedArea = { codigoEleicao: '6257', turno: 1, cargo: '1', tipo: 'br', codigo: 'br' };
const BR2: ExpectedArea = { codigoEleicao: '6258', turno: 2, cargo: '1', tipo: 'br', codigo: 'br' };

function expectKind(fn: () => unknown, kind: TseError['kind']) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TseError);
    expect((e as TseError).kind).toBe(kind);
    return;
  }
  throw new Error('esperava exceção');
}

describe('parseResultado', () => {
  it('converte o formato do TSE para o modelo interno', () => {
    const r = parseResultado(makeResultado({ st: 25, ts: 100, idg: 77 }), BR1);
    expect(r.idg).toBe(77);
    expect(r.tipo).toBe('br');
    expect(r.votos).toMatchObject({ validos: 1000, brancos: 30, nulos: 20, total: 1050 });
    expect(r.progress).toMatchObject({
      secoesTotalizadas: 25,
      secoesEsperadas: 100,
      percentual: 25,
      status: 'parcial',
    });
    expect(r.totalizadoEm).toBe('2026-10-04T19:59:00-03:00');
    expect(r.candidatos[0]!.votos).toBe(600);
    expect(r.issues).toEqual([]);
  });

  it('rejeita arquivo de outro turno', () => {
    expectKind(() => parseResultado(makeResultado({ ele: '6257', t: '1' }), BR2), 'wrong-election');
    expectKind(() => parseResultado(makeResultado({ ele: '6258', t: '1' }), BR2), 'wrong-election');
    expectKind(() => parseResultado(makeResultado({ ele: '6258', t: '2' }), BR1), 'wrong-election');
  });

  it('rejeita abrangência diferente da solicitada (evita atribuir à UF errada)', () => {
    const raw = makeResultado({ tpabr: 'uf', cdabr: 'rj' });
    expectKind(() => parseResultado(raw, { ...BR1, tipo: 'uf', codigo: 'sp' }), 'invalid-data');
  });

  it('rejeita candidatos duplicados', () => {
    const raw = makeResultado({ candidates: [cand(FIXTURE_LULA, 1), cand(FIXTURE_LULA, 2)] });
    expectKind(() => parseResultado(raw, BR1), 'invalid-data');
  });

  it('rejeita valores numéricos inválidos em vez de assumir zero', () => {
    const raw = makeResultado();
    raw.carg[0]!.agr[0]!.par[0]!.cand[0]!.vap = 'abc';
    expectKind(() => parseResultado(raw, BR1), 'invalid-data');

    const raw2 = makeResultado() as Record<string, unknown>;
    (raw2.v as Record<string, unknown>).vv = '';
    expectKind(() => parseResultado(raw2, BR1), 'invalid-data');

    const raw3 = makeResultado() as Record<string, unknown>;
    delete raw3.s;
    expectKind(() => parseResultado(raw3, BR1), 'invalid-data');
  });

  it('rejeita seções totalizadas acima do total', () => {
    expectKind(() => parseResultado(makeResultado({ st: 101, ts: 100 }), BR1), 'invalid-data');
  });

  it('marca finalizada somente com o indicador oficial', () => {
    expect(parseResultado(makeResultado({ st: 100, ts: 100, tf: 'n' }), BR1).progress.status).toBe(
      'parcial',
    );
    expect(parseResultado(makeResultado({ st: 100, ts: 100, tf: 's' }), BR1).progress.status).toBe(
      'finalizada',
    );
  });

  it('sinaliza soma inconsistente com votos nominais', () => {
    const raw = makeResultado();
    raw.v.vnom = '999';
    const r = parseResultado(raw, BR1);
    expect(r.issues.map((i) => i.code)).toContain('sum-mismatch');
  });

  it('candidateIssues aponta candidato não encontrado e candidato desconhecido no 2º turno', () => {
    const r1 = parseResultado(makeResultado({ candidates: [cand(FIXTURE_LULA, 1)] }), BR1);
    expect(candidateIssues(r1, election).map((i) => i.code)).toEqual(['candidate-not-found']);

    const r2 = parseResultado(
      makeResultado({
        ele: '6258',
        t: '2',
        candidates: [cand(FIXTURE_LULA, 1), cand(FIXTURE_FLAVIO, 2), cand(FIXTURE_OTHER, 3)],
      }),
      BR2,
    );
    expect(candidateIssues(r2, election).map((i) => i.code)).toEqual(['unrecognized-candidate']);
  });
});

describe('parseAbrangencia', () => {
  it('indexa o andamento por UF', () => {
    const ab = parseAbrangencia(makeAbrangencia({ stamps: { sp: { st: 10 } } }), '6257', 1);
    expect(ab.items.size).toBe(28);
    expect(ab.items.get('sp')!.progress.percentual).toBe(10);
    expect(ab.items.get('sp')!.stamp).not.toBe(ab.items.get('rj')!.stamp);
  });
  it('rejeita andamento de outro turno', () => {
    expect(() => parseAbrangencia(makeAbrangencia({ ele: '6258', t: '2' }), '6257', 1)).toThrow(
      TseError,
    );
  });
  it('rejeita abrangência duplicada', () => {
    const raw = makeAbrangencia();
    raw.abr.push(raw.abr[0]!);
    expect(() => parseAbrangencia(raw, '6257', 1)).toThrow(/duplicada/);
  });
});

describe('parseMunicipiosConfig', () => {
  it('lê municípios por UF', () => {
    const map = parseMunicipiosConfig({
      dg: '02/10/2026',
      hg: '18:30:22',
      idg: '1',
      abr: [
        {
          cd: 'ac',
          ds: 'ACRE',
          mu: [
            { cd: '01392', cdi: '1200401', nm: 'RIO BRANCO', c: 's' },
            { cd: '01120', cdi: '1200013', nm: 'ACRELÂNDIA', c: 'n' },
          ],
        },
      ],
    });
    expect(map.get('ac')!.map((m) => m.nome)).toEqual(['ACRELÂNDIA', 'RIO BRANCO']);
    expect(map.get('ac')!.find((m) => m.capital)!.codigo).toBe('01392');
  });
});

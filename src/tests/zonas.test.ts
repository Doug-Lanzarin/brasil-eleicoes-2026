import { describe, expect, it } from 'vitest';
import {
  agregarZonas,
  secaoKey,
  validarZonasArquivo,
  type SecaoEsperada,
  type SecaoEstado,
} from '../services/zonas/aggregate';
import type { ZonasArquivo } from '../types/zonas';

/** Dados FICTÍCIOS para teste. */
const esperadas: SecaoEsperada[] = [
  { municipio: '01066', zona: '0004', secao: '0001', stamp: 'a' },
  { municipio: '01066', zona: '0004', secao: '0002', stamp: 'a' },
  { municipio: '01066', zona: '0008', secao: '0003', stamp: 'a' },
  { municipio: '01066', zona: '0008', secao: '0004', stamp: null },
];
const validos = new Set(['13', '22', '55']);

function estado(entries: [SecaoEsperada, SecaoEstado][]) {
  return new Map(entries.map(([s, st]) => [secaoKey(s), st]));
}

describe('agregarZonas', () => {
  const st = estado([
    [
      esperadas[0]!,
      {
        stamp: 'a',
        status: 'ok',
        votos: {
          nominais: { '13': 10, '22': 20, '55': 3 },
          brancos: 1,
          nulos: 2,
          comparecimento: 36,
        },
      },
    ],
    [
      esperadas[1]!,
      {
        stamp: 'a',
        status: 'ok',
        // "28": número sem candidatura válida → nulo técnico.
        votos: {
          nominais: { '13': 5, '22': 4, '28': 1 },
          brancos: 0,
          nulos: 1,
          comparecimento: 11,
        },
      },
    ],
    [esperadas[2]!, { stamp: null, status: 'pendente' }],
  ]);

  it('soma as seções por município e zona', () => {
    const out = agregarZonas(esperadas, st, validos);
    const z4 = out['01066']!.zonas['0004']!;
    expect(z4).toEqual({
      secoes: 2,
      secoesProcessadas: 2,
      votos: { '13': 15, '22': 24, '55': 3 },
      validos: 42,
      brancos: 1,
      nulos: 4,
      comparecimento: 47,
    });
  });

  it('conta votos em números sem candidatura válida como nulos', () => {
    const z4 = agregarZonas(esperadas, st, validos)['01066']!.zonas['0004']!;
    expect(z4.votos['28']).toBeUndefined();
    expect(z4.nulos).toBe(4); // 2 + 1 nulos + 1 técnico
  });

  it('seções sem boletim processado entram só na contagem de esperadas', () => {
    const out = agregarZonas(esperadas, st, validos);
    expect(out['01066']).toMatchObject({ secoes: 4, secoesProcessadas: 2 });
    expect(out['01066']!.zonas['0008']).toMatchObject({
      secoes: 2,
      secoesProcessadas: 0,
      validos: 0,
    });
  });
});

describe('validarZonasArquivo', () => {
  const base: ZonasArquivo = {
    versao: 1,
    fonte: 'teste',
    eleicao: '6258',
    turno: 2,
    pleito: '3221',
    uf: 'ac',
    cargo: '1',
    geradoEm: '2026-10-25T20:00:00Z',
    candidatosValidos: ['13', '22'],
    municipios: {
      '01066': {
        secoes: 1,
        secoesProcessadas: 1,
        zonas: {
          '0004': {
            secoes: 1,
            secoesProcessadas: 1,
            votos: { '13': 3, '22': 4 },
            validos: 7,
            brancos: 0,
            nulos: 0,
            comparecimento: 7,
          },
        },
      },
    },
  };
  const esperado = { eleicao: '6258', turno: 2, uf: 'ac' };

  it('aceita arquivo do turno e UF esperados', () => {
    expect(validarZonasArquivo(base, esperado)).toBe(base);
  });
  it('rejeita arquivo de outro turno ou UF', () => {
    expect(() => validarZonasArquivo({ ...base, turno: 1, eleicao: '6257' }, esperado)).toThrow(
      /outra/,
    );
    expect(() => validarZonasArquivo({ ...base, uf: 'sp' }, esperado)).toThrow(/outra/);
  });
  it('rejeita somas inconsistentes e valores inválidos', () => {
    const bad = structuredClone(base);
    bad.municipios['01066']!.zonas['0004']!.validos = 8;
    expect(() => validarZonasArquivo(bad, esperado)).toThrow(/inconsistente/);
    const neg = structuredClone(base);
    neg.municipios['01066']!.zonas['0004']!.secoesProcessadas = 2;
    expect(() => validarZonasArquivo(neg, esperado)).toThrow(/inválidos/);
    expect(() => validarZonasArquivo({ versao: 2 }, esperado)).toThrow(/formato/);
  });
});

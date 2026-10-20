import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuDecodeError, decodeBoletimUrna, votosDoCargo } from '../services/tse/bu';

/**
 * Amostra de BU (arquivo binário publicado pelo TSE) usada SOMENTE para testar o
 * decodificador: Porto Walter/AC, zona 4, seção 77, 1º turno de 2026. Os valores esperados
 * foram conferidos com o arquivo oficial "Boletim de Urna na Web" (bweb_1t_AC).
 */
const sample = new Uint8Array(
  readFileSync(resolve(__dirname, 'fixtures/bu-ac-m01066-z0004-s0077.bu')),
);

describe('decodeBoletimUrna', () => {
  it('lê a identificação da seção e do pleito', () => {
    const bu = decodeBoletimUrna(sample);
    expect(bu).toMatchObject({ pleito: 3220, municipio: 1066, zona: 4, secao: 77, local: 1031 });
    expect(bu.eleicoes.map((e) => e.idEleicao)).toEqual([6257, 6259]);
  });

  it('extrai os votos de Presidente iguais ao boletim oficial', () => {
    const v = votosDoCargo(decodeBoletimUrna(sample), 6257, 1)!;
    expect(v.nominais).toEqual({ '13': 99, '14': 4, '22': 103, '55': 5, '70': 6 });
    expect(v.brancos).toBe(4);
    expect(v.nulos).toBe(13);
    expect(v.comparecimento).toBe(234);
    const soma = Object.values(v.nominais).reduce((a, b) => a + b, 0) + v.brancos + v.nulos;
    expect(soma).toBe(v.comparecimento);
  });

  it('retorna null para eleição/cargo inexistente no BU', () => {
    const bu = decodeBoletimUrna(sample);
    expect(votosDoCargo(bu, 6258, 1)).toBeNull();
    expect(votosDoCargo(bu, 6257, 3)).toBeNull();
  });

  it('rejeita arquivos truncados ou corrompidos', () => {
    expect(() => decodeBoletimUrna(sample.subarray(0, 500))).toThrow(BuDecodeError);
    expect(() => decodeBoletimUrna(new Uint8Array([0x30, 0x03, 0x02, 0x01]))).toThrow(
      BuDecodeError,
    );
    expect(() => decodeBoletimUrna(new Uint8Array())).toThrow(BuDecodeError);
  });
});

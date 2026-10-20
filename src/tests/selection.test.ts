import { describe, expect, it } from 'vitest';
import { parseSelection, serializeSelection } from '../features/election/useSelection';

describe('seleção via URL', () => {
  it('lê turno e UF válidos', () => {
    expect(parseSelection('?turno=2&uf=sp')).toEqual({
      electionId: 'presidente-2026',
      turno: 2,
      uf: 'SP',
      mun: null,
    });
  });
  it('ignora valores inválidos e usa o 1º turno por padrão', () => {
    expect(parseSelection('?turno=7&uf=XX')).toEqual({
      electionId: 'presidente-2026',
      turno: 1,
      uf: null,
      mun: null,
    });
  });
  it('lê o município apenas com UF selecionada', () => {
    expect(parseSelection('?uf=sp&mun=71072').mun).toBe('71072');
    expect(parseSelection('?uf=ac&mun=1120').mun).toBe('01120');
    expect(parseSelection('?mun=71072').mun).toBeNull();
    expect(parseSelection('?uf=sp&mun=abc').mun).toBeNull();
  });
  it('serializa', () => {
    expect(
      serializeSelection({ electionId: 'presidente-2026', turno: 2, uf: 'RJ', mun: null }),
    ).toBe('?turno=2&uf=RJ');
    expect(
      serializeSelection({ electionId: 'presidente-2026', turno: 1, uf: 'SP', mun: '71072' }),
    ).toBe('?turno=1&uf=SP&mun=71072');
  });
});

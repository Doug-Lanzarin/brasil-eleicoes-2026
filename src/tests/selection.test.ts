import { describe, expect, it } from 'vitest';
import { parseSelection, serializeSelection } from '../features/election/useSelection';

describe('seleção via URL', () => {
  it('lê turno e UF válidos', () => {
    expect(parseSelection('?turno=2&uf=sp')).toEqual({
      electionId: 'presidente-2026',
      turno: 2,
      uf: 'SP',
    });
  });
  it('ignora valores inválidos e usa o 1º turno por padrão', () => {
    expect(parseSelection('?turno=7&uf=XX')).toEqual({
      electionId: 'presidente-2026',
      turno: 1,
      uf: null,
    });
  });
  it('serializa', () => {
    expect(serializeSelection({ electionId: 'presidente-2026', turno: 2, uf: 'RJ' })).toBe(
      '?turno=2&uf=RJ',
    );
  });
});

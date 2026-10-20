import type { MapFill } from '../../types/election';

export const FILL_COLOR: Record<MapFill, string> = {
  lula: 'var(--color-lula)',
  flavio: 'var(--color-flavio)',
  tie: 'var(--color-tie)',
  'no-data': 'var(--color-nodata)',
  unavailable: 'url(#hatch-unavailable)',
};

export const FILL_LABEL: Record<MapFill, string> = {
  lula: 'Lula à frente',
  flavio: 'Flávio Bolsonaro à frente',
  tie: 'Empate',
  'no-data': 'Sem votos apurados',
  unavailable: 'Resultado indisponível',
};

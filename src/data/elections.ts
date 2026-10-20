import type { ElectionConfig } from '../types/election';

/**
 * Configuração das eleições suportadas.
 *
 * Os códigos foram validados no arquivo oficial de configuração
 * https://resultados.tse.jus.br/oficial/comum/config/ele-c.json (pleitos 3220 e 3221):
 *   - 6257 "Eleição Ordinária Federal - 2026 1º Turno" (04/10/2026), cdt2 = 6258
 *   - 6258 "Eleição Ordinária Federal - 2026 2º Turno" (25/10/2026)
 * Pleitos (boletins de urna em arquivo-urna/<pleito>): 3220 (04/10/2026) e 3221 (25/10/2026).
 *
 * Os candidatos são identificados pelo sequencial (`sqcand`) publicado nos arquivos de
 * resultado do TSE; o número de urna é conferido como verificação cruzada.
 *
 * Para incluir outra eleição, acrescente um objeto a este array: nenhum componente visual
 * depende de códigos fixos.
 */
export const ELECTIONS: ElectionConfig[] = [
  {
    id: 'presidente-2026',
    label: 'Eleições Gerais de 2026',
    ciclo: 'ele2026',
    cargo: '1',
    cargoLabel: 'Presidente',
    rounds: [
      { turno: 1, label: '1º turno', codigoEleicao: '6257', pleito: '3220', date: '2026-10-04' },
      { turno: 2, label: '2º turno', codigoEleicao: '6258', pleito: '3221', date: '2026-10-25' },
    ],
    candidates: [
      {
        key: 'lula',
        displayName: 'Lula',
        fullName: 'Luiz Inácio Lula da Silva',
        numero: '13',
        sqcand: '280002542548',
        party: 'PT',
        color: 'red',
      },
      {
        key: 'flavio',
        displayName: 'Flávio Bolsonaro',
        fullName: 'Flávio Nantes Bolsonaro',
        numero: '22',
        sqcand: '280002551544',
        party: 'PL',
        color: 'blue',
      },
    ],
  },
];

export const DEFAULT_ELECTION_ID = 'presidente-2026';

export function getElection(id: string): ElectionConfig | undefined {
  return ELECTIONS.find((e) => e.id === id);
}

export function getRound(election: ElectionConfig, turno: number) {
  return election.rounds.find((r) => r.turno === turno);
}

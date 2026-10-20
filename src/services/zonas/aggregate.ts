import type { SecaoVotos } from '../tse/bu';
import type { ZonaResultado, ZonasArquivo, ZonasMunicipio } from '../../types/zonas';

export type SecaoStatus = 'ok' | 'pendente' | 'sem-cargo' | 'erro';

/** Estado de uma seção no processo (persistido entre execuções). */
export interface SecaoEstado {
  /** Carimbo de chegada do BU na configuração oficial (cs: da + ha). */
  stamp: string | null;
  status: SecaoStatus;
  hash?: string;
  votos?: SecaoVotos;
  /** Última tentativa (ms) — evita repetir seções pendentes a cada ciclo. */
  tentativaEm?: number;
  erro?: string;
}

/** Seção esperada segundo a configuração oficial. */
export interface SecaoEsperada {
  municipio: string;
  zona: string;
  secao: string;
  stamp: string | null;
}

export const secaoKey = (s: { municipio: string; zona: string; secao: string }) =>
  `${s.municipio}/${s.zona}/${s.secao}`;

function zonaVazia(): ZonaResultado {
  return {
    secoes: 0,
    secoesProcessadas: 0,
    votos: {},
    validos: 0,
    brancos: 0,
    nulos: 0,
    comparecimento: 0,
  };
}

/**
 * Soma os votos das seções processadas por município e zona.
 * Votos nominais em números fora de `candidatosValidos` são contados como nulos (técnicos),
 * como faz a totalização oficial.
 */
export function agregarZonas(
  esperadas: SecaoEsperada[],
  estado: ReadonlyMap<string, SecaoEstado>,
  candidatosValidos: ReadonlySet<string>,
): Record<string, ZonasMunicipio> {
  const municipios: Record<string, ZonasMunicipio> = {};
  for (const s of esperadas) {
    const mun = (municipios[s.municipio] ??= { secoes: 0, secoesProcessadas: 0, zonas: {} });
    const z = (mun.zonas[s.zona] ??= zonaVazia());
    z.secoes++;
    mun.secoes++;
    const st = estado.get(secaoKey(s));
    if (st?.status !== 'ok' || !st.votos) continue;
    z.secoesProcessadas++;
    mun.secoesProcessadas++;
    const v = st.votos;
    for (const [num, q] of Object.entries(v.nominais)) {
      if (candidatosValidos.has(num)) {
        z.votos[num] = (z.votos[num] ?? 0) + q;
        z.validos += q;
      } else {
        z.nulos += q;
      }
    }
    z.brancos += v.brancos;
    z.nulos += v.nulos;
    z.comparecimento += v.comparecimento;
  }
  return municipios;
}

/** Validação do arquivo recebido pelo app: nunca aceita dados de outro turno/UF. */
export function validarZonasArquivo(
  raw: unknown,
  esperado: { eleicao: string; turno: number; uf: string },
): ZonasArquivo {
  const r = raw as Partial<ZonasArquivo> | null;
  if (!r || typeof r !== 'object' || r.versao !== 1 || typeof r.municipios !== 'object') {
    throw new Error('Arquivo de zonas em formato inesperado.');
  }
  if (r.eleicao !== esperado.eleicao || r.turno !== esperado.turno || r.uf !== esperado.uf) {
    throw new Error(
      `Arquivo de zonas de outra eleição/turno/UF (${r.eleicao}/${r.turno}/${r.uf}). Descartado.`,
    );
  }
  for (const mun of Object.values(r.municipios!)) {
    for (const z of Object.values(mun.zonas)) {
      const numeros = [
        z.secoes,
        z.secoesProcessadas,
        z.validos,
        z.brancos,
        z.nulos,
        z.comparecimento,
      ];
      if (
        numeros.some((n) => !Number.isSafeInteger(n) || n < 0) ||
        z.secoesProcessadas > z.secoes
      ) {
        throw new Error('Arquivo de zonas com valores inválidos.');
      }
      const soma = Object.values(z.votos).reduce((a, b) => a + b, 0);
      if (soma !== z.validos) throw new Error('Arquivo de zonas inconsistente (soma de válidos).');
    }
  }
  return r as ZonasArquivo;
}

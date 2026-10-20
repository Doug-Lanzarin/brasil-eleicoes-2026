/** Intervalo mínimo entre consultas automáticas (s). Não pode ser reduzido por configuração. */
export const MIN_REFRESH_SECONDS = 30;
/** Teto do backoff exponencial após falhas consecutivas (s). */
export const MAX_BACKOFF_SECONDS = 300;
export const OFFICIAL_TSE_BASE_URL = 'https://resultados.tse.jus.br/oficial';

function readNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Garante o mínimo de 30 s mesmo quando a variável de ambiente pede menos. */
export function clampRefreshSeconds(value: number): number {
  return Math.max(MIN_REFRESH_SECONDS, Math.round(value));
}

const env = import.meta.env;

export const appConfig = {
  tseBaseUrl: (env.VITE_TSE_BASE_URL || OFFICIAL_TSE_BASE_URL).replace(/\/+$/, ''),
  refreshSeconds: clampRefreshSeconds(readNumber(env.VITE_REFRESH_INTERVAL_SECONDS, 30)),
  staleAfterSeconds: readNumber(env.VITE_STALE_AFTER_SECONDS, 120),
  /**
   * Base dos arquivos de resultados por zona gerados por server/zonas/worker.ts.
   * Padrão "/zonas": na Vercel, reescrito para a branch `dados-zonas` (vercel.json).
   */
  zonasBaseUrl: (env.VITE_ZONAS_BASE_URL || '/zonas').replace(/\/+$/, ''),
  /** Dados locais mais antigos que isso são descartados (não são mostrados como atuais). */
  persistedMaxAgeDays: 7,
};

export const isOfficialSource = appConfig.tseBaseUrl === OFFICIAL_TSE_BASE_URL;

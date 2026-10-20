/**
 * Converte um inteiro em string (formato TSE: "12345") em número.
 * Retorna null para valores ausentes, vazios, negativos ou não inteiros — nunca 0 por omissão.
 */
export function parseCount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Converte decimal com vírgula ("45,162767911") em número. */
export function parseDecimalBR(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^-?\d+(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseIdg(raw: unknown): number | null {
  return parseCount(raw);
}

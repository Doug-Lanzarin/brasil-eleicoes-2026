const intFmt = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatInt(n: number | null | undefined): string {
  return n == null ? '—' : intFmt.format(n);
}

export function formatPct(n: number | null | undefined): string {
  return n == null ? '—' : `${pctFmt.format(n)}%`;
}

export function formatPP(n: number | null | undefined): string {
  return n == null ? '—' : `${pctFmt.format(n)} p.p.`;
}

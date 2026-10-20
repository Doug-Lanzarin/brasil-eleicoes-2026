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

/** "SÃO JOSÉ DOS CAMPOS" → "São José dos Campos". */
export function titleCase(name: string): string {
  const lower = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);
  return name
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w, i) =>
      i > 0 && lower.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1),
    )
    .join(' ');
}

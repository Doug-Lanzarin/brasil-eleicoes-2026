/**
 * Datas do TSE chegam como "dd/mm/aaaa" + "hh:mm:ss" no horário de Brasília.
 * Desde 2019 não há horário de verão, então o deslocamento é fixo em -03:00.
 */
export function parseTseDateTime(date: unknown, time: unknown): string | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim());
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!d || !t) return null;
  const iso = `${d[3]}-${d[2]}-${d[1]}T${t[1]}:${t[2]}:${t[3] ?? '00'}-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

/** Formata no horário de Brasília (o mesmo usado pelo TSE). */
export function formatBrasilia(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return dateTimeFmt.format(ms);
}

export function formatAge(fromIso: string | null | undefined, now: number = Date.now()): string {
  if (!fromIso) return '—';
  const sec = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  if (sec < 60) return `há ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h ${min % 60} min`;
  return `há ${Math.floor(h / 24)} dias`;
}

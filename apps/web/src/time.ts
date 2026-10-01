/** Timestamps are stored as UTC ISO strings and displayed in the viewer's local time. */

const dateTime = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' });

export function formatLocalDateTime(iso: string | null, fmt: Intl.DateTimeFormat = dateTime): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : fmt.format(t);
}

/** Calendar date (YYYY-MM-DD) shown without timezone shifting. */
export function formatCalendarDate(ymd: string, fmt: Intl.DateTimeFormat = dateOnly): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return fmt.format(new Date(y, m - 1, d));
}

/** "just now", "4 min ago", "3 h ago", "2 d ago". */
export function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** Today's date as YYYY-MM-DD in local time (for date inputs and defaults). */
export function todayYmd(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

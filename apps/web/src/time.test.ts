import { describe, expect, it } from 'vitest';
import { formatCalendarDate, formatLocalDateTime, formatRelative, todayYmd } from './time.ts';

describe('time helpers', () => {
  it('formats UTC ISO in local time with a fixed formatter', () => {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    expect(formatLocalDateTime('2026-10-01T16:30:00.000Z', fmt)).toBe('12:30');
    expect(formatLocalDateTime(null)).toBe('—');
  });

  it('formats calendar dates without shifting the day', () => {
    const fmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    expect(formatCalendarDate('2026-10-01', fmt)).toBe('Oct 01, 2026');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-01T12:00:00.000Z');
    expect(formatRelative('2026-10-01T11:59:40.000Z', now)).toBe('just now');
    expect(formatRelative('2026-10-01T11:56:00.000Z', now)).toBe('4 min ago');
    expect(formatRelative('2026-10-01T09:00:00.000Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-09-29T12:00:00.000Z', now)).toBe('2 d ago');
    expect(formatRelative(null, now)).toBe('never');
  });

  it('builds a local YYYY-MM-DD', () => {
    expect(todayYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

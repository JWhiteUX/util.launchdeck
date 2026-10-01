import { describe, expect, it } from 'vitest';
import { badgeLabel } from './badge.ts';

describe('badgeLabel', () => {
  it('green → READY', () => {
    expect(badgeLabel({ badge: 'green', badgeReason: 'ok', unreviewedCount: 0 })).toMatchObject({
      label: 'READY',
      tone: 'ok',
    });
  });

  it('amber → change count, singular and plural', () => {
    expect(badgeLabel({ badge: 'amber', badgeReason: 'unreviewed', unreviewedCount: 1 })).toMatchObject({
      label: '1 CHANGE',
      tone: 'warn',
      title: '1 change since the last review',
    });
    expect(badgeLabel({ badge: 'amber', badgeReason: 'unreviewed', unreviewedCount: 3 }).label).toBe('3 CHANGES');
  });

  it('red → ERROR or EMPTY by reason', () => {
    expect(badgeLabel({ badge: 'red', badgeReason: 'watcher_error', unreviewedCount: 0 })).toMatchObject({
      label: 'ERROR',
      tone: 'error',
    });
    expect(badgeLabel({ badge: 'red', badgeReason: 'empty_near_launch', unreviewedCount: 2 })).toEqual({
      label: 'EMPTY',
      tone: 'error',
      title: 'Folder empty and launch is within 7 days',
    });
  });

  it('always carries text and a title', () => {
    for (const b of ['green', 'amber', 'red'] as const) {
      const d = badgeLabel({ badge: b, badgeReason: 'ok', unreviewedCount: 2 });
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { CampaignView } from '@launchdeck/shared';
import { barClass, ganttId, LANE, lanesHeight, rangePadding, seriesSlots, seriesVar, tasksKey, toGanttTasks } from './gantt.ts';

const campaign = (over: Partial<CampaignView> = {}): CampaignView => ({
  id: 'c1',
  name: 'Fall launch',
  startDate: '2026-10-01',
  launchDate: '2026-10-20',
  owner: 'jdoe',
  status: 'planned',
  folders: ['/content/dam/fall'],
  reviewedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  badge: 'green',
  badgeReason: 'ok',
  unreviewedCount: 0,
  ...over,
});

describe('toGanttTasks', () => {
  it('maps a campaign to a read-only task spanning start → launch', () => {
    expect(toGanttTasks([campaign()])).toEqual([
      { id: 'c1', name: 'Fall launch', start: '2026-10-01', end: '2026-10-20', progress: 0, custom_class: 'bar--green' },
    ]);
  });

  it('uses one class token per badge (frappe calls classList.add with it)', () => {
    const tasks = toGanttTasks([
      campaign({ id: 'a', badge: 'green' }),
      campaign({ id: 'b', badge: 'amber' }),
      campaign({ id: 'c', badge: 'red' }),
    ]);
    expect(tasks.map((t) => t.custom_class)).toEqual(['bar--green', 'bar--amber', 'bar--red']);
    for (const t of tasks) expect(t.custom_class).not.toMatch(/\s/);
    expect(barClass('red')).toBe('bar--red');
  });

  it('keeps campaign order', () => {
    expect(toGanttTasks([campaign({ id: 'x' }), campaign({ id: 'y' })]).map((t) => t.id)).toEqual(['x', 'y']);
  });
});

describe('tasksKey', () => {
  it('is stable for identical data and changes when a badge changes', () => {
    const a = tasksKey(toGanttTasks([campaign()]));
    expect(tasksKey(toGanttTasks([campaign()]))).toBe(a);
    expect(tasksKey(toGanttTasks([campaign({ badge: 'amber' })]))).not.toBe(a);
    expect(tasksKey(toGanttTasks([campaign({ launchDate: '2026-10-21' })]))).not.toBe(a);
  });
});

describe('ganttId', () => {
  it('matches frappe id normalisation', () => {
    expect(ganttId('a b c')).toBe('a_b_c');
    expect(ganttId('uuid-1')).toBe('uuid-1');
  });
});

describe('rangePadding', () => {
  const cs = [campaign({ startDate: '2026-10-01', launchDate: '2026-10-20' })];

  it('uses the base padding when today is inside the range', () => {
    expect(rangePadding(cs, 'Week', '2026-10-05')).toEqual(['28d', '28d']);
    expect(rangePadding(cs, 'Day', '2026-10-05')).toEqual(['7d', '7d']);
  });

  it('extends the start back to today when campaigns are in the future', () => {
    expect(rangePadding(cs, 'Week', '2026-09-01')).toEqual(['58d', '28d']);
  });

  it('extends the end to today when campaigns are in the past', () => {
    expect(rangePadding(cs, 'Day', '2026-11-01')).toEqual(['7d', '19d']);
  });

  it('handles no campaigns', () => {
    expect(rangePadding([], 'Month', '2026-10-05')).toEqual(['62d', '62d']);
  });
});

describe('seriesSlots', () => {
  const mk = (id: string, createdAt: string) => ({ id, createdAt });
  it('assigns slots in creation order, independent of list order', () => {
    const slots = seriesSlots([mk('b', '2026-10-02T00:00:00.000Z'), mk('a', '2026-10-01T00:00:00.000Z')]);
    expect(slots.get('a')).toBe(1);
    expect(slots.get('b')).toBe(2);
  });
  it('never cycles past eight', () => {
    const many = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`));
    const slots = seriesSlots(many);
    expect(slots.get('c7')).toBe(8);
    expect(slots.get('c8')).toBeNull();
    expect(slots.get('c9')).toBeNull();
    expect(seriesVar(slots.get('c8'))).toBeUndefined();
    expect(seriesVar(3)).toBe('var(--series-3)');
  });
});

describe('lanesHeight', () => {
  it('fits the chart to header plus 80px lanes exactly', () => {
    expect(LANE.barHeight + LANE.padding).toBe(80);
    expect(lanesHeight(85, LANE, 4)).toBe(85 + 80 * 4);
  });
});

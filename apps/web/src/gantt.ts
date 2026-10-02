import type { Badge, CampaignView } from '@launchdeck/shared';
import type { GanttTask, GanttViewModeName } from 'frappe-gantt';

export const VIEW_MODES = ['Day', 'Week', 'Month'] as const satisfies readonly GanttViewModeName[];
export type ViewMode = (typeof VIEW_MODES)[number];

export const SELECTED_CLASS = 'bar--selected';

/** frappe-gantt adds custom_class with classList.add, so it must be a single token. */
export const barClass = (badge: Badge) => `bar--${badge}`;

/**
 * Campaign → read-only task. Dates are inclusive calendar days (frappe treats a
 * date-only end as end of day). Selection is a class toggled after render, so
 * selecting a bar never re-renders the chart or resets its scroll.
 */
export function toGanttTasks(campaigns: readonly CampaignView[]): GanttTask[] {
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    start: c.startDate,
    end: c.launchDate,
    progress: 0,
    custom_class: barClass(c.badge),
  }));
}

/** Stable signature so identical refetches don't re-render the chart. */
export const tasksKey = (tasks: readonly GanttTask[]) =>
  tasks.map((t) => [t.id, t.name, t.start, t.end, t.custom_class].join('|')).join('\n');

/** frappe rewrites spaces in ids to underscores; match its data-id. */
export const ganttId = (id: string) => id.replaceAll(' ', '_');

const DAY_MS = 86_400_000;
const BASE_PADDING_DAYS: Record<ViewMode, number> = { Day: 7, Week: 28, Month: 62 };
const dayNumber = (ymd: string) => {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/**
 * [before, after] padding for a view mode, widened so today always falls inside
 * the chart (the today marker is only drawn when today is in range).
 */
export function rangePadding(
  campaigns: readonly Pick<CampaignView, 'startDate' | 'launchDate'>[],
  mode: ViewMode,
  today: string,
): [string, string] {
  const base = BASE_PADDING_DAYS[mode];
  if (campaigns.length === 0) return [`${base}d`, `${base}d`];
  const t = dayNumber(today);
  const first = Math.min(...campaigns.map((c) => dayNumber(c.startDate)));
  const last = Math.max(...campaigns.map((c) => dayNumber(c.launchDate)));
  return [`${base + Math.max(0, first - t)}d`, `${base + Math.max(0, t - last)}d`];
}

export const SERIES_COUNT = 8;

/**
 * Campaign → colour slot 1..8 in creation order, so a campaign keeps its colour
 * when others are added or the list re-sorts. Slots are never cycled: past
 * eight, campaigns get null (neutral ink bar); the bar label still names them.
 */
export function seriesSlots(campaigns: readonly Pick<CampaignView, 'id' | 'createdAt'>[]): Map<string, number | null> {
  const ordered = [...campaigns].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return new Map(ordered.map((c, i) => [c.id, i < SERIES_COUNT ? i + 1 : null]));
}

export const seriesVar = (slot: number | null | undefined) => (slot ? `var(--series-${slot})` : undefined);

export interface LaneDims {
  barHeight: number;
  padding: number;
}

/** Swimlane: an 80px lane with a 40px bar centred in it. */
export const LANE: LaneDims = { barHeight: 40, padding: 40 };

/** Chart height that fits the header plus every swimlane exactly (no trailing partial row). */
export const lanesHeight = (headerHeight: number, lane: LaneDims, rows: number) =>
  headerHeight + (lane.barHeight + lane.padding) * rows;

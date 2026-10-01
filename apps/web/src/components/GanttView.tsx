import { useEffect, useMemo, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import type { GanttTask, GanttViewMode } from 'frappe-gantt';
import type { CampaignView } from '@launchdeck/shared';
import {
  HEIGHTS,
  SELECTED_CLASS,
  VIEW_MODES,
  containerHeight,
  ganttId,
  isChartHeight,
  rangePadding,
  seriesSlots,
  seriesVar,
  tasksKey,
  toGanttTasks,
} from '../gantt.ts';
import type { ChartHeight, ViewMode } from '../gantt.ts';
import type { CSSProperties } from 'react';
import { formatCalendarDate, todayYmd } from '../time.ts';
import { StatusBadge } from './StatusBadge.tsx';
import '../styles/gantt.css';

export interface GanttViewProps {
  campaigns: CampaignView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const BAR_HEIGHT = 32;
const PADDING = 16;
const UPPER_HEADER = 45;
const LOWER_HEADER = 30;
// frappe's config.header_height = upper + lower + 10.
const DIMS = { headerHeight: UPPER_HEADER + LOWER_HEADER + 10, barHeight: BAR_HEIGHT, padding: PADDING };
const HEIGHT_KEY = 'launchdeck.ganttHeight';

function loadHeight(): ChartHeight {
  try {
    const v = localStorage.getItem(HEIGHT_KEY);
    return isChartHeight(v) ? v : 'Default';
  } catch {
    return 'Default';
  }
}

function saveHeight(h: ChartHeight) {
  try {
    localStorage.setItem(HEIGHT_KEY, h);
  } catch {
    // Storage unavailable (private window): the choice just isn't remembered.
  }
}

/** Redraws wipe the SVG, so campaign colours and selection are re-applied after every render. */
class LaunchGantt extends Gantt {
  declare selectedId: string | null;
  /** gantt id → CSS colour (var(--series-n)); absent = neutral ink bar. */
  declare colors: Map<string, string | undefined>;

  override render() {
    super.render();
    // Resizing the container in decorate() cancels frappe's smooth scroll to today, so redo it.
    if (this.decorate() && this.options.scroll_to === 'today') this.scroll_current();
  }

  /** Returns true when the container was resized. */
  decorate(): boolean {
    const selected = this.selectedId ? ganttId(this.selectedId) : null;
    for (const bar of this.bars) {
      bar.$bar.querySelector('animate')?.remove();
      const color = this.colors?.get(bar.task.id);
      bar.$bar.style.fill = color ?? '';
      bar.group.classList.toggle('bar--series', Boolean(color));
      bar.group.classList.toggle(SELECTED_CLASS, bar.task.id === selected);
    }
    // frappe sizes the container to the grid only in 'auto' mode, and never leaves room for the
    // horizontal scrollbar, which then forces a vertical one. Size it to the grid plus scrollbar.
    const c = this.$container;
    const before = c.style.height;
    // offsetHeight - clientHeight = borders + horizontal scrollbar.
    const target = `${this.grid_height + (c.offsetHeight - c.clientHeight)}px`;
    if (before !== target) c.style.height = target;
    // The chart is aria-hidden (the list below is the accessible view); keep its scroll button out of tab order.
    c.querySelector('.adjust')?.setAttribute('tabindex', '-1');
    return before !== target;
  }

  revealSelected() {
    const bar = this.bars.find((b) => b.group.classList.contains(SELECTED_CLASS));
    if (!bar) return;
    const c = this.$container;
    const x = Number(bar.$bar.getAttribute('x'));
    const end = x + Number(bar.$bar.getAttribute('width'));
    if (end < c.scrollLeft || x > c.scrollLeft + c.clientWidth) {
      c.scrollTo({ left: Math.max(0, x - 24), behavior: 'instant' });
    }
  }
}

function makeModes(): Record<ViewMode, GanttViewMode> {
  return {
    Day: { ...Gantt.VIEW_MODE.DAY },
    Week: { ...Gantt.VIEW_MODE.WEEK, column_width: 160 },
    Month: { ...Gantt.VIEW_MODE.MONTH },
  };
}

function applyPadding(modes: Record<ViewMode, GanttViewMode>, campaigns: readonly CampaignView[]) {
  const today = todayYmd();
  for (const m of VIEW_MODES) modes[m].padding = rangePadding(campaigns, m, today);
}

// frappe mutates task objects (ids, parsed dates), so hand it copies.
const copy = (tasks: readonly GanttTask[]) => tasks.map((t) => ({ ...t }));

export function GanttView({ campaigns, selectedId, onSelect }: GanttViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<LaunchGantt | null>(null);
  const modesRef = useRef<Record<ViewMode, GanttViewMode> | null>(null);
  const keyRef = useRef('');
  const idMapRef = useRef(new Map<string, string>());
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const [mode, setMode] = useState<ViewMode>('Week');
  const [height, setHeight] = useState<ChartHeight>(loadHeight);
  const heightRef = useRef(height);

  const tasks = useMemo(() => toGanttTasks(campaigns), [campaigns]);
  const slots = useMemo(() => seriesSlots(campaigns), [campaigns]);
  const colors = useMemo(
    () => new Map(campaigns.map((c) => [ganttId(c.id), seriesVar(slots.get(c.id))])),
    [campaigns, slots],
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selectedId;
    heightRef.current = height;
  });

  // Create once; refresh only when the rendered task data actually changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || tasks.length === 0) return;
    idMapRef.current = new Map(campaigns.map((c) => [ganttId(c.id), c.id]));
    const colorsKey = [...colors].map(([id, v]) => `${id}=${v ?? ''}`).join(',');
    const key = `${tasksKey(tasks)}|${colorsKey}`;
    const existing = ganttRef.current;
    if (existing && modesRef.current) {
      if (key === keyRef.current) return;
      keyRef.current = key;
      applyPadding(modesRef.current, campaigns);
      existing.colors = colors;
      const left = existing.$container.scrollLeft;
      existing.refresh(copy(tasks));
      existing.$container.scrollTo({ left, behavior: 'instant' });
      return;
    }
    const modes = makeModes();
    applyPadding(modes, campaigns);
    modesRef.current = modes;
    keyRef.current = key;
    const gantt = new LaunchGantt(host, copy(tasks), {
      view_modes: [modes[mode], ...VIEW_MODES.filter((m) => m !== mode).map((m) => modes[m])],
      infinite_padding: false,
      readonly: true,
      readonly_dates: true,
      readonly_progress: true,
      popup: false,
      today_button: false,
      view_mode_select: false,
      bar_corner_radius: 0,
      bar_height: BAR_HEIGHT,
      padding: PADDING,
      upper_header_height: UPPER_HEADER,
      lower_header_height: LOWER_HEADER,
      container_height: containerHeight(heightRef.current, DIMS),
      scroll_to: 'today',
      on_click: (task) => onSelectRef.current(idMapRef.current.get(task.id) ?? task.id),
    });
    gantt.selectedId = selectedRef.current;
    gantt.colors = colors;
    gantt.decorate();
    ganttRef.current = gantt;
  }, [tasks, campaigns, mode, colors]);

  useEffect(() => {
    saveHeight(height);
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.update_options({ container_height: containerHeight(height, DIMS) });
  }, [height]);

  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt || gantt.options.view_mode === mode) return;
    gantt.change_view_mode(mode);
  }, [mode]);

  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.selectedId = selectedId;
    gantt.decorate();
    gantt.revealSelected();
  }, [selectedId]);

  useEffect(() => {
    const host = hostRef.current;
    return () => {
      ganttRef.current?.clear();
      ganttRef.current = null;
      keyRef.current = '';
      host?.replaceChildren();
    };
  }, []);

  return (
    <div className="gantt-view">
      <div className="gantt-view__toolbar">
        <span className="label" id="gantt-height-label">
          HEIGHT
        </span>
        <div className="gantt-scale" role="group" aria-labelledby="gantt-height-label">
          {HEIGHTS.map((h) => (
            <button
              key={h}
              type="button"
              className="gantt-scale__item"
              aria-pressed={height === h}
              onClick={() => setHeight(h)}
            >
              {h === 'Default' ? 'DEFAULT' : h.replace('x', '×')}
            </button>
          ))}
        </div>
        <span className="label" id="gantt-scale-label">
          SCALE
        </span>
        <div className="gantt-scale" role="group" aria-labelledby="gantt-scale-label">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="gantt-scale__item"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="gantt-view__chart" ref={hostRef} aria-hidden="true" />

      <ul className="gantt-list" aria-label="Campaigns">
        {campaigns.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="gantt-list__item"
              aria-current={c.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(c.id)}
            >
              <span className="gantt-list__name">
                <span
                  className="swatch"
                  aria-hidden="true"
                  style={{ '--swatch': seriesVar(slots.get(c.id)) } as CSSProperties}
                />
                {c.name}
              </span>
              <span className="visually-hidden"> · </span>
              <span className="gantt-list__dates mono">
                {formatCalendarDate(c.startDate)} – {formatCalendarDate(c.launchDate)}
              </span>
              <span className="visually-hidden"> · </span>
              <StatusBadge campaign={c} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

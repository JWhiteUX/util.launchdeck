import { useEffect, useMemo, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import type { GanttTask, GanttViewMode } from 'frappe-gantt';
import type { CampaignView } from '@launchdeck/shared';
import { SELECTED_CLASS, VIEW_MODES, ganttId, rangePadding, tasksKey, toGanttTasks } from '../gantt.ts';
import type { ViewMode } from '../gantt.ts';
import { formatCalendarDate, todayYmd } from '../time.ts';
import { StatusBadge } from './StatusBadge.tsx';
import '../styles/gantt.css';

export interface GanttViewProps {
  campaigns: CampaignView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STRIP_WIDTH = 4;

/** Redraws wipe the SVG, so status strips and selection are re-applied after every render. */
class LaunchGantt extends Gantt {
  declare selectedId: string | null;

  override render() {
    super.render();
    this.decorate();
  }

  decorate() {
    const selected = this.selectedId ? ganttId(this.selectedId) : null;
    for (const bar of this.bars) {
      bar.$bar.querySelector('animate')?.remove();
      if (!bar.bar_group.querySelector('.bar-strip')) {
        const strip = document.createElementNS(SVG_NS, 'rect');
        strip.setAttribute('class', 'bar-strip');
        strip.setAttribute('x', bar.$bar.getAttribute('x') ?? '0');
        strip.setAttribute('y', bar.$bar.getAttribute('y') ?? '0');
        strip.setAttribute('width', String(STRIP_WIDTH));
        strip.setAttribute('height', bar.$bar.getAttribute('height') ?? '0');
        bar.$bar.after(strip);
      }
      bar.group.classList.toggle(SELECTED_CLASS, bar.task.id === selected);
    }
    // The chart is aria-hidden (the list below is the accessible view); keep its scroll button out of tab order.
    this.$container.querySelector('.adjust')?.setAttribute('tabindex', '-1');
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

  const tasks = useMemo(() => toGanttTasks(campaigns), [campaigns]);

  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selectedId;
  });

  // Create once; refresh only when the rendered task data actually changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || tasks.length === 0) return;
    idMapRef.current = new Map(campaigns.map((c) => [ganttId(c.id), c.id]));
    const key = tasksKey(tasks);
    const existing = ganttRef.current;
    if (existing && modesRef.current) {
      if (key === keyRef.current) return;
      keyRef.current = key;
      applyPadding(modesRef.current, campaigns);
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
      bar_height: 32,
      padding: 16,
      scroll_to: 'today',
      on_click: (task) => onSelectRef.current(idMapRef.current.get(task.id) ?? task.id),
    });
    gantt.selectedId = selectedRef.current;
    gantt.decorate();
    ganttRef.current = gantt;
  }, [tasks, campaigns, mode]);

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
              <span className="gantt-list__name">{c.name}</span>
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

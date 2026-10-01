// Minimal typings for frappe-gantt 1.2 (ships no .d.ts). Covers what launchdeck uses.
declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string;
    name: string;
    /** 'YYYY-MM-DD' or Date. A date-only end is treated as inclusive (end of day). */
    start: string | Date;
    end?: string | Date;
    /** Alternative to `end`, e.g. '3d'. */
    duration?: string;
    /** 0–100. */
    progress?: number;
    /** Comma-separated ids or an array of ids. */
    dependencies?: string | string[];
    /** Class added to the bar's SVG group. */
    custom_class?: string;
    color?: string;
    color_progress?: string;
    description?: string;
  }

  export type GanttViewModeName =
    | 'Hour'
    | 'Quarter Day'
    | 'Half Day'
    | 'Day'
    | 'Week'
    | 'Month'
    | 'Year';

  export default class Gantt {
    constructor(
      wrapper: HTMLElement | SVGElement | string,
      tasks: GanttTask[],
      options?: Record<string, unknown>,
    );
    options: Record<string, unknown>;
    tasks: GanttTask[];
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode?: GanttViewModeName | Record<string, unknown>, maintain_pos?: boolean): void;
    update_options(options: Record<string, unknown>): void;
    update_task(id: string, new_details: Partial<GanttTask>): void;
    scroll_current(): void;
    unselect_all(): void;
    clear(): void;
  }
}

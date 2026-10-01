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
    /** Class added to the bar's group. Must be ONE token: Bar.refresh() uses classList.add. */
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

  /** A view mode object (Gantt.VIEW_MODE.*); padding is [before, after] durations like '14d'. */
  export interface GanttViewMode {
    name: GanttViewModeName;
    step: string;
    padding?: string | [string, string];
    column_width?: number;
    [key: string]: unknown;
  }

  export interface GanttOptions {
    bar_corner_radius?: number;
    bar_height?: number;
    padding?: number;
    upper_header_height?: number;
    lower_header_height?: number;
    column_width?: number | null;
    container_height?: number | 'auto';
    infinite_padding?: boolean;
    lines?: 'both' | 'vertical' | 'horizontal' | 'none';
    /** `false` disables the popup entirely. */
    popup?: false | ((ctx: unknown) => void);
    popup_on?: 'click' | 'hover';
    readonly?: boolean;
    readonly_dates?: boolean;
    readonly_progress?: boolean;
    scroll_to?: 'today' | 'start' | 'end' | string | null;
    today_button?: boolean;
    view_mode?: GanttViewModeName;
    /** Objects are used by reference; the first becomes the initial view mode. */
    view_modes?: GanttViewMode[];
    view_mode_select?: boolean;
    language?: string;
    on_click?: (task: GanttTask) => void;
    on_view_change?: (mode: { name: GanttViewModeName }) => void;
  }

  /** Internal bar instance (one per task), used for post-render decoration. */
  export interface GanttBar {
    task: GanttTask;
    group: SVGGElement;
    bar_group: SVGGElement;
    $bar: SVGRectElement;
  }

  export default class Gantt {
    static VIEW_MODE: Record<'HOUR' | 'QUARTER_DAY' | 'HALF_DAY' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR', GanttViewMode>;
    constructor(wrapper: HTMLElement | SVGElement | string, tasks: GanttTask[], options?: GanttOptions);
    options: GanttOptions;
    tasks: GanttTask[];
    bars: GanttBar[];
    $svg: SVGSVGElement;
    $container: HTMLDivElement;
    /** Grid height in px, set on every render. */
    grid_height: number;
    /** Called on every redraw (constructor, refresh, view change, infinite-padding extension). */
    render(): void;
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode?: GanttViewModeName, maintain_pos?: boolean): void;
    update_options(options: GanttOptions): void;
    update_task(id: string, new_details: Partial<GanttTask>): void;
    scroll_current(): void;
    unselect_all(): void;
    clear(): void;
  }
}

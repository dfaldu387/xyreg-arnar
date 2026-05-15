import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type { GanttTask } from '@/types/ganttChart';

/**
 * One column rendered in the task-list pane to the right of the always-present
 * "Task name" column. Consumers pass an array of these to add `Assigned`,
 * `Duration`, `Status`, or anything else they want to see.
 */
export interface GanttColumn {
    /** Unique id used as a React key. */
    id: string;
    /** Header cell text. */
    header: string;
    /** Pixel width of the column. */
    width: number;
    /** Optional Tailwind classes applied to the body cell (e.g. `'text-right'`). */
    className?: string;
    /** How to render the cell content for a given task. */
    render: (task: GanttTask) => React.ReactNode;

    // ── Per-column filtering. Owned by the parent — TaskListPane only renders
    //    the funnel icon + popover and reports changes via `onFilterChange`.
    /** When true, the header shows a funnel icon that opens a value picker. */
    filterable?: boolean;
    /** All unique values to show in the popover (already deduped + sorted). */
    filterValues?: readonly string[];
    /** Currently selected values (subset of `filterValues`). Empty Set means
     *  "no filter active". */
    filterSelection?: Set<string>;
    /** Fired when the user toggles a checkbox or clears the column filter. */
    onFilterChange?: (selected: Set<string>) => void;
}

interface TaskListPaneProps {
    tasks: GanttTask[];
    rowHeight: number;
    headerHeight: number;
    selectedId?: GanttTask['id'];
    onSelect?: (id: GanttTask['id']) => void;
    onDoubleSelect?: (id: GanttTask['id']) => void;
    innerRef?: React.Ref<HTMLDivElement>;
    onWheel?: React.WheelEventHandler<HTMLDivElement>;
    collapsedIds?: Set<GanttTask['id']>;
    hasChildrenSet?: Set<GanttTask['id']>;
    depthById?: Map<GanttTask['id'], number>;
    onToggleCollapse?: (id: GanttTask['id']) => void;
    /** Pixel width of the always-present task-name column. Default 200. */
    nameColumnWidth?: number;
    /** Additional columns appended after the task-name column. Defaults to
     *  the original Start / End date columns. Pass an empty array to hide
     *  every column except the task name. */
    columns?: GanttColumn[];
}

// Per-level indent step. A row's text starts at depth*INDENT_STEP + 28px,
// so a leaf and a parent-with-chevron at the same depth align horizontally.
const INDENT_STEP = 20;

// ─── Column resize handle ────────────────────────────────────────────────────
// A 4px-wide drag strip pinned to the right edge of a header cell. Invisible
// by default; shows a blue line on hover and during the drag itself so the
// user can see where they're aiming.
function ColumnResizeHandle({
    onPointerDown,
}: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
    return (
        <div
            onPointerDown={onPointerDown}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group/resize z-10"
            style={{ touchAction: 'none' }}
        >
            <div className="absolute right-0 top-0 bottom-0 w-px bg-transparent group-hover/resize:bg-blue-400 transition-colors" />
        </div>
    );
}

// ─── Column filter popover ───────────────────────────────────────────────────
// Rendered next to a column header when `col.filterable === true`. Lists every
// unique value in `col.filterValues` as a checkbox, with a small search box on
// top so long lists (e.g. authors) stay navigable.
interface ColumnFilterPopoverProps {
    columnHeader: string;
    values: readonly string[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
}

function ColumnFilterPopover({
    columnHeader,
    values,
    selected,
    onChange,
}: ColumnFilterPopoverProps) {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return values;
        return values.filter((v) => v.toLowerCase().includes(q));
    }, [values, query]);

    const toggle = (v: string) => {
        const next = new Set(selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        onChange(next);
    };

    return (
        <div className="w-64 p-0 normal-case">
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-700 normal-case">
                    Filter by {columnHeader}
                </span>
                {selected.size > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange(new Set())}
                        className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                    >
                        <X className="h-3 w-3" />
                        Clear
                    </button>
                )}
            </div>
            <div className="p-2">
                {values.length > 5 && (
                    <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                        <Input
                            placeholder="Search…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-7 pl-7 text-sm"
                        />
                    </div>
                )}
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {filtered.length === 0 ? (
                        <div className="text-xs text-slate-400 px-1.5 py-1">
                            No matches
                        </div>
                    ) : (
                        filtered.map((v) => (
                            <label
                                key={v}
                                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer"
                            >
                                <Checkbox
                                    checked={selected.has(v)}
                                    onCheckedChange={() => toggle(v)}
                                />
                                <span className="text-sm text-slate-700 truncate">{v}</span>
                            </label>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

const COL_DATE_W = 84;

const DEFAULT_COLUMNS: GanttColumn[] = [
    {
        id: 'start',
        header: 'Start',
        width: COL_DATE_W,
        render: (t) => format(t.start, 'MMM d, yyyy'),
    },
    {
        id: 'end',
        header: 'End',
        width: COL_DATE_W,
        render: (t) =>
            t.type === 'milestone' ? (
                <span className="text-slate-300">—</span>
            ) : (
                format(t.end, 'MMM d, yyyy')
            ),
    },
];

// Sentinel id used as the key for the always-present task-name column in
// the resize state map.
const NAME_COL_KEY = '__task_name__';
const MIN_COL_WIDTH = 60;

export function TaskListPane({
    tasks,
    rowHeight,
    headerHeight,
    selectedId,
    onSelect,
    onDoubleSelect,
    innerRef,
    onWheel,
    collapsedIds,
    hasChildrenSet,
    depthById,
    onToggleCollapse,
    nameColumnWidth = 200,
    columns = DEFAULT_COLUMNS,
}: TaskListPaneProps) {
    // Per-column resize overrides. A column's effective width is
    // `widths[col.id] ?? col.width` (or `widths[NAME_COL_KEY] ?? nameColumnWidth`
    // for the task-name column). Drags update this map; clearing the entry
    // resets the column to its prop-defined default.
    const [widths, setWidths] = useState<Record<string, number>>({});
    const effNameWidth = widths[NAME_COL_KEY] ?? nameColumnWidth;
    const effColWidth = (c: GanttColumn) => widths[c.id] ?? c.width;

    // Pointer-down on a column's right-edge handle starts a global drag that
    // updates the width as the cursor moves. Listeners detach on pointerup.
    const startResize = (
        key: string,
        currentWidth: number,
        e: React.PointerEvent<HTMLDivElement>,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = currentWidth;
        const onMove = (ev: PointerEvent) => {
            const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
            setWidths((prev) => ({ ...prev, [key]: next }));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const totalWidth =
        effNameWidth + columns.reduce((sum, c) => sum + effColWidth(c), 0);

    return (
        <div
            // `h-full` is critical: without it the outer takes its content's
            // natural height (header + every row), the body's `flex-1` has
            // nothing to size against, and the row container ends up much
            // taller than the right pane's viewport — so the translateY-based
            // scroll-sync slides things off by hundreds of pixels at the
            // bottom of the scroll range.
            className="flex flex-col h-full shrink-0 border-r border-slate-200 bg-white"
            style={{ width: totalWidth }}
        >
            {/* Sticky header row */}
            <div
                className="flex items-stretch bg-slate-50 border-b border-slate-200 sticky top-0 z-30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"
                style={{ height: headerHeight }}
            >
                <div
                    className="relative flex items-center px-3"
                    style={{ width: effNameWidth }}
                >
                    Task
                    <ColumnResizeHandle
                        onPointerDown={(e) => startResize(NAME_COL_KEY, effNameWidth, e)}
                    />
                </div>
                {columns.map((col) => {
                    const filterActive = (col.filterSelection?.size ?? 0) > 0;
                    const w = effColWidth(col);
                    return (
                        <div
                            key={col.id}
                            className="relative flex items-center gap-1 px-2 border-l border-slate-200"
                            style={{ width: w }}
                        >
                            <span className="truncate flex-1">{col.header}</span>
                            {col.filterable &&
                                col.filterValues &&
                                col.filterValues.length > 0 &&
                                col.onFilterChange && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={`Filter ${col.header}`}
                                                className={cn(
                                                    'shrink-0 inline-flex items-center justify-center h-4 w-4 rounded transition-colors',
                                                    filterActive
                                                        ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                                                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200',
                                                )}
                                            >
                                                <Filter className="h-3 w-3" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            align="start"
                                            className="p-0 w-auto"
                                        >
                                            <ColumnFilterPopover
                                                columnHeader={col.header}
                                                values={col.filterValues}
                                                selected={col.filterSelection ?? new Set()}
                                                onChange={col.onFilterChange}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            <ColumnResizeHandle
                                onPointerDown={(e) => startResize(col.id, w, e)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Body — overflow-hidden + translateY mirrors the timeline's vertical scroll */}
            <div className="flex-1 overflow-hidden" onWheel={onWheel}>
                <div ref={innerRef} style={{ willChange: 'transform' }}>
                    {tasks.map((t) => {
                        const isCategory =
                            t.type === 'category' ||
                            t.type === 'summary' ||
                            t.type === 'summarie';
                        const isMilestone = t.type === 'milestone';
                        const hasChildren = hasChildrenSet?.has(t.id) ?? false;
                        const isCollapsed = collapsedIds?.has(t.id) ?? false;
                        const depth = depthById?.get(t.id) ?? 0;
                        // Parents place the chevron in the indent slot
                        // (paddingLeft 4); leaves push their text to the same
                        // x as a sibling parent's text (chevron 20px + 4px
                        // gap = 24px past the parent's pad).
                        const paddingLeft = depth * INDENT_STEP + (hasChildren ? 4 : 28);
                        return (
                            <div
                                key={t.id}
                                onClick={() => onSelect?.(t.id)}
                                onDoubleClick={() => onDoubleSelect?.(t.id)}
                                className={cn(
                                    'flex items-stretch cursor-pointer transition-colors border-b border-slate-100 last:border-b-0',
                                    isCategory
                                        ? 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                                        : 'hover:bg-blue-50 text-slate-700',
                                    selectedId === t.id && '!bg-blue-50',
                                )}
                                style={{ height: rowHeight }}
                            >
                                {/* Task name (always-present first column) */}
                                <div
                                    className="flex items-center gap-1 min-w-0 pr-2"
                                    style={{ width: effNameWidth, paddingLeft }}
                                >
                                    {hasChildren ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleCollapse?.(t.id);
                                            }}
                                            className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                                            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                                            aria-expanded={!isCollapsed}
                                        >
                                            <ChevronRight
                                                className={cn(
                                                    'h-3.5 w-3.5 transition-transform duration-150',
                                                    !isCollapsed && 'rotate-90',
                                                )}
                                            />
                                        </button>
                                    ) : null}
                                    {isMilestone && (
                                        <span className="text-amber-500 text-[10px] shrink-0">
                                            ◆
                                        </span>
                                    )}
                                    <span
                                        className={cn(
                                            'truncate text-[13px]',
                                            isCategory ? 'font-bold' : 'font-medium',
                                        )}
                                        title={t.text}
                                    >
                                        {t.text}
                                    </span>
                                </div>

                                {/* Configurable extra columns */}
                                {columns.map((col) => (
                                    <div
                                        key={col.id}
                                        className={cn(
                                            'flex items-center px-2 text-[11px] text-slate-600 border-l border-slate-100 tabular-nums min-w-0',
                                            col.className,
                                        )}
                                        style={{ width: effColWidth(col) }}
                                    >
                                        <span className="truncate">{col.render(t)}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

import React, { useState, useMemo } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { GanttTask } from '@/types/ganttChart';

export type GanttFilterStatus = 'completed' | 'overdue' | 'running' | 'not-started';

export interface GanttFilterState {
    search: string;
    /** Selected status strings. Match either the date-driven defaults
     * (`completed` / `overdue` / `running` / `not-started`) OR any custom
     * status string supplied by the caller via `availableStatuses`. */
    statuses: Set<string>;
    authors: Set<string>;
}

export const EMPTY_FILTER: GanttFilterState = {
    search: '',
    statuses: new Set(),
    authors: new Set(),
};

const DEFAULT_STATUS_OPTIONS: { id: string; label: string; dot: string }[] = [
    { id: 'overdue', label: 'Overdue', dot: 'bg-red-500' },
    { id: 'running', label: 'Running', dot: 'bg-amber-400' },
    { id: 'not-started', label: 'Not Started', dot: 'bg-slate-500' },
    { id: 'completed', label: 'Completed', dot: 'bg-emerald-600' },
];

interface GanttFilterBarProps {
    value: GanttFilterState;
    onChange: (next: GanttFilterState) => void;
    /** All distinct author names present in the data — used to populate the
     *  author multi-select. */
    availableAuthors: string[];
    /** Optional. If supplied, replaces the default date-driven status list
     *  with whatever strings the caller passes — e.g. document workflow
     *  statuses ("Draft", "In Review", "Approved"). */
    availableStatuses?: string[];
}

export function GanttFilterBar({
    value,
    onChange,
    availableAuthors,
    availableStatuses,
}: GanttFilterBarProps) {
    const [authorQuery, setAuthorQuery] = useState('');

    const activeCount =
        (value.search ? 1 : 0) + value.statuses.size + value.authors.size;

    const statusOptions = useMemo(() => {
        if (availableStatuses && availableStatuses.length > 0) {
            return availableStatuses.map((s) => ({ id: s, label: s, dot: undefined as string | undefined }));
        }
        return DEFAULT_STATUS_OPTIONS;
    }, [availableStatuses]);

    const toggleStatus = (s: string) => {
        const next = new Set(value.statuses);
        if (next.has(s)) next.delete(s);
        else next.add(s);
        onChange({ ...value, statuses: next });
    };

    const toggleAuthor = (a: string) => {
        const next = new Set(value.authors);
        if (next.has(a)) next.delete(a);
        else next.add(a);
        onChange({ ...value, authors: next });
    };

    const filteredAuthors = useMemo(() => {
        const q = authorQuery.trim().toLowerCase();
        if (!q) return availableAuthors;
        return availableAuthors.filter((a) => a.toLowerCase().includes(q));
    }, [availableAuthors, authorQuery]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-8">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Search and filter</span>
                    {activeCount > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-semibold">
                            {activeCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
                <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Filters
                    </span>
                    {activeCount > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange(EMPTY_FILTER)}
                            className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                        >
                            <X className="h-3 w-3" />
                            Clear all
                        </button>
                    )}
                </div>

                <div className="p-3 space-y-4 max-h-[420px] overflow-y-auto">
                    {/* Search */}
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                            Search
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Task name…"
                                value={value.search}
                                onChange={(e) =>
                                    onChange({ ...value, search: e.target.value })
                                }
                                className="h-8 pl-8 text-sm"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    {statusOptions.length > 0 && (
                        <div>
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                                Status
                            </label>
                            <div className="space-y-1">
                                {statusOptions.map((opt) => (
                                    <label
                                        key={opt.id}
                                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={value.statuses.has(opt.id)}
                                            onCheckedChange={() => toggleStatus(opt.id)}
                                        />
                                        {opt.dot && (
                                            <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                                        )}
                                        <span className="text-sm text-slate-700">
                                            {opt.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Authors */}
                    {availableAuthors.length > 0 && (
                        <div>
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                                Authors
                            </label>
                            <Input
                                placeholder="Filter authors…"
                                value={authorQuery}
                                onChange={(e) => setAuthorQuery(e.target.value)}
                                className="h-7 mb-1.5 text-sm"
                            />
                            <div className="max-h-44 overflow-y-auto space-y-0.5">
                                {filteredAuthors.length === 0 ? (
                                    <div className="text-xs text-slate-400 px-1.5 py-1">
                                        No matches
                                    </div>
                                ) : (
                                    filteredAuthors.map((a) => (
                                        <label
                                            key={a}
                                            className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={value.authors.has(a)}
                                                onCheckedChange={() => toggleAuthor(a)}
                                            />
                                            <span className="text-sm text-slate-700 truncate">
                                                {a}
                                            </span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── Helpers exposed for the demo page so its filtering logic stays in sync
//     with how the bar's status options are rendered. ────────────────────────

const MS_PER_DAY_FILTER = 86_400_000;

export function computeFilterStatus(task: GanttTask): GanttFilterStatus {
    if (task.progressStatus === 'completed' || (task.progress ?? 0) >= 100) {
        return 'completed';
    }
    const now = Date.now();
    if (task.end.getTime() < now) return 'overdue';
    if (task.start.getTime() <= now) return 'running';
    return 'not-started';
}

/**
 * Apply a filter state to a flat task list. To keep the hierarchy intact
 * (so a matched leaf isn't orphaned without its phase/category), every
 * ancestor of a matched row is also retained. Original array order is
 * preserved so the rendered tree remains parent-before-child.
 */
export function applyGanttFilter(
    tasks: GanttTask[],
    filter: GanttFilterState,
): GanttTask[] {
    const hasSearch = filter.search.trim() !== '';
    const hasStatuses = filter.statuses.size > 0;
    const hasAuthors = filter.authors.size > 0;
    if (!hasSearch && !hasStatuses && !hasAuthors) return tasks;

    const q = filter.search.trim().toLowerCase();
    const byId = new Map<GanttTask['id'], GanttTask>(tasks.map((t) => [t.id, t]));

    const matches = (t: GanttTask) => {
        if (hasSearch && !t.text.toLowerCase().includes(q)) {
            // Also try the assigned field so searching by author name works.
            const a = t.assigned ? String(t.assigned).toLowerCase() : '';
            if (!a.includes(q)) return false;
        }
        if (hasStatuses && !filter.statuses.has(computeFilterStatus(t))) {
            return false;
        }
        if (hasAuthors) {
            const a = t.assigned ? String(t.assigned) : '';
            const names = a
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (!names.some((n) => filter.authors.has(n))) return false;
        }
        return true;
    };

    const keep = new Set<GanttTask['id']>();
    for (const t of tasks) {
        if (!matches(t)) continue;
        keep.add(t.id);
        // Walk up parents so the row's ancestor chain stays visible.
        let p = t.parent;
        while (p != null && !keep.has(p)) {
            keep.add(p);
            p = byId.get(p)?.parent;
        }
    }
    return tasks.filter((t) => keep.has(t.id));
}

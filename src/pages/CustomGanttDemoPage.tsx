import React, { useMemo, useState } from 'react';
import {
    GanttContainer,
    useGanttUpdate,
    type GanttColumn,
} from '@/components/gantt/GanttContainer';
import {
    LIVE_TASKS,
    LIVE_LINKS,
    LIVE_DOMAIN,
    DOCUMENT_STATUS_BY_ID,
    AVAILABLE_DOCUMENT_STATUSES,
} from '@/components/gantt/live.data';
import { DocumentDraftDrawer } from '@/components/product/documents/DocumentDraftDrawer';
import type { GanttTask } from '@/types/ganttChart';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// The live data file was captured from this specific product/company. The
// DocumentDraftDrawer needs both IDs to scope its loads and saves.
const PRODUCT_ID = 'aba5cc63-1b27-413a-9833-bf7ab30682d1';
const COMPANY_ID = 'bafcaade-2ea7-4594-b33b-1279c1d2912b';

type OpenDoc = { id: string; name: string };

// A task is an individual document if its parent id starts with the synthetic
// `docs-` prefix the adapter uses for each phase's Documents container.
const isDocumentRow = (t: GanttTask) =>
    t.parent != null && String(t.parent).startsWith('docs-');

// Split a task's joined-author string into individual names.
const authorsOf = (t: GanttTask): string[] => {
    if (!t.assigned) return [];
    return String(t.assigned)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

// Workflow status colour mapping for document rows. Falls back to slate for
// unknown values so a never-seen-before status still renders cleanly.
function workflowBadgeClasses(rawStatus: string): string {
    const key = rawStatus.toLowerCase().replace(/[\s_-]+/g, '');
    if (['approved', 'effective', 'live', 'released', 'completed'].includes(key))
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (['rejected', 'overdue', 'expired'].includes(key))
        return 'bg-red-100 text-red-700 border-red-200';
    if (
        [
            'inreview',
            'underreview',
            'reviewing',
            'pendingapproval',
            'pendingreview',
            'inprogress',
        ].includes(key)
    )
        return 'bg-blue-100 text-blue-700 border-blue-200';
    if (['draft', 'editing'].includes(key))
        return 'bg-amber-100 text-amber-800 border-amber-200';
    if (['obsolete', 'archived'].includes(key))
        return 'bg-slate-200 text-slate-500 border-slate-300';
    return 'bg-slate-100 text-slate-600 border-slate-200';
}

const renderStatus = (t: GanttTask) => {
    if (!isDocumentRow(t)) {
        return <span className="text-slate-300">—</span>;
    }
    const raw = DOCUMENT_STATUS_BY_ID.get(String(t.id));
    if (!raw) {
        return <span className="text-slate-400">—</span>;
    }
    return (
        <span
            className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap',
                workflowBadgeClasses(raw),
            )}
        >
            {raw}
        </span>
    );
};

// Only rows backed by their own DB record should accept date edits.
// Read-only rows:
//   • category       — rolled up from its child phases (no own dates)
//   • docs container — synthetic group node, just inherits its phase
//   • milestone      — Design Review, anchored to phase.end (moves with phase)
// Editable rows: phase, document, activity (each has its own start/end column
// in the underlying table).
const isEditableDateRow = (t: GanttTask): boolean => {
    if (t.type === 'milestone') return false;
    if (t.type === 'category') return false;
    if (String(t.id).startsWith('docs-')) return false;
    return true;
};

// Inline date editor — click a date cell to swap to an `<input type="date">`
// + Done button. Committing runs the change through the dependency cascade
// (via the Gantt's `updateTaskField`) so downstream tasks reflow.
function DateCell({ task, field }: { task: GanttTask; field: 'start' | 'end' }) {
    const update = useGanttUpdate();
    const date = field === 'start' ? task.start : task.end;
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');

    // Milestones don't have a separate end date — render a dash and skip edit.
    if (task.type === 'milestone' && field === 'end') {
        return <span className="text-slate-300">—</span>;
    }

    // Read-only rows render the formatted date as plain text — no click-to-edit
    // affordance, no hover underline. Keeps the look identical to editable
    // rows but signals "you can't change this here."
    if (!isEditableDateRow(task)) {
        return (
            <span className="text-slate-500">
                {format(date, 'MMM d, yyyy')}
            </span>
        );
    }

    const toIsoDay = (d: Date) => {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    const commit = () => {
        if (!update) {
            setEditing(false);
            return;
        }
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
            // Parse as LOCAL midnight to avoid timezone shifts from
            // `new Date('YYYY-MM-DD')` (which is UTC midnight).
            const next = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            update.updateTaskField(task.id, field, next);
        }
        setEditing(false);
    };

    if (editing) {
        return (
            <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    type="date"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditing(false);
                        }
                    }}
                    autoFocus
                    className="text-[11px] border border-slate-300 rounded px-1 h-6 min-w-0 w-[110px]"
                />
                <button
                    type="button"
                    onClick={commit}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0"
                >
                    Done
                </button>
            </div>
        );
    }

    return (
        <span
            onClick={(e) => {
                e.stopPropagation();
                setValue(toIsoDay(date));
                setEditing(true);
            }}
            className="cursor-pointer hover:text-slate-900 hover:underline"
        >
            {format(date, 'MMM d, yyyy')}
        </span>
    );
}

const renderAuthors = (t: GanttTask) => {
    if (!isDocumentRow(t)) {
        return <span className="text-slate-300">—</span>;
    }
    const all = authorsOf(t);
    if (all.length === 0) {
        return <span className="text-slate-400">Unassigned</span>;
    }
    const VISIBLE = 2;
    const shown = all.slice(0, VISIBLE).join(', ');
    const extra = all.length - VISIBLE;
    return (
        <span title={all.join(', ')}>
            {shown}
            {extra > 0 && (
                <span className="ml-1 text-slate-400">+{extra} more</span>
            )}
        </span>
    );
};

// What each filterable column's filter checks against, per task. Returning
// `undefined` means "this task contributes no filterable value" — so a status
// filter doesn't accidentally hide phases that have no status.
type ColumnFilterFn = (task: GanttTask) => string | readonly string[] | undefined;

const COLUMN_FILTER_FNS: Record<string, ColumnFilterFn> = {
    status: (t) =>
        isDocumentRow(t) ? DOCUMENT_STATUS_BY_ID.get(String(t.id)) : undefined,
    authors: (t) => (isDocumentRow(t) ? authorsOf(t) : undefined),
};

type ColumnFilters = Record<string, Set<string>>;

/**
 * Apply per-column filters to the flat task list. A document task passes
 * each active column filter independently (AND across columns). When a
 * document matches, every ancestor in its chain (Documents container →
 * Phase → Category) is also retained so the tree stays intact.
 *
 * Tasks for which a column's filter fn returns `undefined` are treated as
 * "not applicable" and DO NOT auto-pass; with that semantic, selecting any
 * status reduces the visible set to documents-with-that-status + ancestors.
 */
function applyColumnFilters(
    tasks: GanttTask[],
    filters: ColumnFilters,
): GanttTask[] {
    const activeColumns = Object.entries(filters).filter(
        ([, sel]) => sel.size > 0,
    );
    if (activeColumns.length === 0) return tasks;

    const byId = new Map<GanttTask['id'], GanttTask>(tasks.map((t) => [t.id, t]));

    const matches = (t: GanttTask) => {
        for (const [colId, selected] of activeColumns) {
            const fn = COLUMN_FILTER_FNS[colId];
            if (!fn) continue;
            const value = fn(t);
            if (value === undefined) return false; // task not applicable → hide
            if (Array.isArray(value)) {
                if (!value.some((v) => selected.has(v))) return false;
            } else {
                if (!selected.has(value as string)) return false;
            }
        }
        return true;
    };

    const keep = new Set<GanttTask['id']>();
    for (const t of tasks) {
        if (!matches(t)) continue;
        keep.add(t.id);
        let p = t.parent;
        while (p != null && !keep.has(p)) {
            keep.add(p);
            p = byId.get(p)?.parent;
        }
    }
    return tasks.filter((t) => keep.has(t.id));
}

export default function CustomGanttDemoPage() {
    const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

    // Double-click on a document row opens the drawer; a single click still
    // just selects the row (handled internally by the Gantt).
    const handleTaskDoubleClick = (task: GanttTask) => {
        if (isDocumentRow(task)) {
            setOpenDoc({ id: String(task.id), name: task.text });
        }
    };

    // Distinct author names across all documents — feeds the Authors column
    // filter popover.
    const availableAuthors = useMemo(() => {
        const set = new Set<string>();
        for (const t of LIVE_TASKS) {
            for (const a of authorsOf(t)) set.add(a);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, []);

    const setFilterFor = (columnId: string) => (next: Set<string>) => {
        setColumnFilters((prev) => {
            const updated = { ...prev };
            if (next.size === 0) delete updated[columnId];
            else updated[columnId] = next;
            return updated;
        });
    };

    const COLUMNS: GanttColumn[] = useMemo(
        () => [
            {
                id: 'status',
                header: 'Status',
                width: 130,
                render: renderStatus,
                filterable: AVAILABLE_DOCUMENT_STATUSES.length > 0,
                filterValues: AVAILABLE_DOCUMENT_STATUSES,
                filterSelection: columnFilters.status,
                onFilterChange: setFilterFor('status'),
            },
            {
                id: 'authors',
                header: 'Authors',
                width: 200,
                render: renderAuthors,
                filterable: availableAuthors.length > 0,
                filterValues: availableAuthors,
                filterSelection: columnFilters.authors,
                onFilterChange: setFilterFor('authors'),
            },
            {
                id: 'start',
                header: 'Start',
                width: 160,
                render: (t) => <DateCell task={t} field="start" />,
            },
            {
                id: 'end',
                header: 'End',
                width: 160,
                render: (t) => <DateCell task={t} field="end" />,
            },
            {
                id: 'duration',
                header: 'Duration',
                width: 90,
                className: 'text-right',
                render: (t) => {
                    if (t.type === 'milestone') {
                        return <span className="text-slate-300">—</span>;
                    }
                    const MS_PER_DAY = 86_400_000;
                    const days = Math.max(
                        1,
                        Math.round((t.end.getTime() - t.start.getTime()) / MS_PER_DAY),
                    );
                    return `${days} day${days === 1 ? '' : 's'}`;
                },
            },
        ],
        [columnFilters, availableAuthors],
    );

    // Filter LIVE_TASKS with per-column filters, preserving ancestor chains
    // so a matched document keeps its phase/category visible.
    const visibleTasks = useMemo(
        () => applyColumnFilters(LIVE_TASKS, columnFilters),
        [columnFilters],
    );

    return (
        <div className="flex flex-col h-screen w-screen bg-slate-50">
            <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Custom Gantt — Demo</h1>
                    <p className="text-xs text-slate-500">
                        Live product phase data ({LIVE_TASKS.length} phases · {LIVE_LINKS.length} dependencies).
                    </p>
                </div>
                <a
                    href="/"
                    className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
                >
                    ← Back to home
                </a>
            </header>
            <div className="flex-1 min-h-0">
                <GanttContainer
                    tasks={visibleTasks}
                    links={LIVE_LINKS}
                    domain={LIVE_DOMAIN}
                    defaultCollapsed={true}
                    cascadeMode="bidirectional"
                    onTaskDoubleClick={handleTaskDoubleClick}
                    columns={COLUMNS}
                />
            </div>

            {openDoc && (
                <DocumentDraftDrawer
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) setOpenDoc(null);
                    }}
                    documentId={openDoc.id}
                    documentName={openDoc.name}
                    documentType="Document"
                    productId={PRODUCT_ID}
                    companyId={COMPANY_ID}
                />
            )}
        </div>
    );
}

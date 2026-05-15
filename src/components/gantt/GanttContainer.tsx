import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useGanttStore } from '@/stores/ganttStore';
import { useTimeScale } from '@/hooks/gantt/useTimeScale';
import { ZOOM_LEVELS } from '@/lib/gantt/zoomLevels';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid, TodayMarker } from './TimelineGrid';
import { TaskBar, type DragMode, type LinkEdge } from './TaskBar';
import { DependencyLayer, computeLinkPaths } from './DependencyLayer';
import { TaskListPane, type GanttColumn } from './TaskListPane';
export type { GanttColumn } from './TaskListPane';
import { ZoomControls } from './ZoomControls';
import { InteractionLayer, type LinkDraft } from './InteractionLayer';
import {
    Search,
    X,
    ChevronLeft,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { GanttTask, GanttLink } from '@/types/ganttChart';

interface GanttContainerProps {
    tasks: GanttTask[];
    links: GanttLink[];
    domain: readonly [Date, Date];
    rowHeight?: number;
    /**
     * Initial collapse state for every parent row.
     *  - false (default): all sub-trees expanded — user sees the full hierarchy.
     *  - true: every parent (anything with children) starts collapsed — only
     *    top-level rows are visible until the user clicks chevrons to expand.
     * After mount this is purely an initial value; the user's manual toggles
     * take over from there.
     */
    defaultCollapsed?: boolean;
    /**
     * Fine-grained alternative to `defaultCollapsed` — explicitly seed which
     * task IDs start collapsed. Useful when you want, say, every Documents
     * container collapsed but every phase expanded.
     */
    initialCollapsedIds?: ReadonlyArray<GanttTask['id']>;
    /**
     * Show the "time elapsed" / explicit-progress dark fill inside each bar.
     * Off by default so bars render as flat solid blocks (matches the look
     * of the production milestones page); turn on if you want the in-bar
     * progress indicator back.
     */
    showProgress?: boolean;
    /**
     * Which weekdays render as tinted weekend bands (Day/Week/Hour zoom).
     * 0 = Sunday … 6 = Saturday. Defaults to `[]` — no tinting. Pass
     * `[0, 6]` for the Western Sat+Sun convention, `[5, 6]` for Fri+Sat.
     */
    weekendDays?: readonly number[];
    /**
     * Direction the dependency cascade walks when a task is dragged.
     *  - `'forward'` (default, matches the production Gantt): a drag only
     *    pushes tasks downstream via outgoing links. Predecessors stay put.
     *  - `'bidirectional'`: the cascade walks BOTH outgoing AND incoming
     *    links, so dragging a target also slides its predecessors along —
     *    the whole linked chain moves as a rigid block.
     */
    cascadeMode?: 'forward' | 'bidirectional';
    /**
     * Fired when a task row is clicked (either the bar in the timeline or
     * the row in the task list pane). The full `GanttTask` is passed so the
     * caller can decide what to do — e.g. open a document drawer for doc
     * rows, navigate to a phase detail, ignore category clicks, etc.
     */
    onTaskClick?: (task: GanttTask) => void;
    /**
     * Fired when a task row is double-clicked. Same payload as `onTaskClick`.
     * Typical use: open a detail drawer / editor for the clicked task.
     */
    onTaskDoubleClick?: (task: GanttTask) => void;
    /**
     * Pixel width of the always-present task-name column. Default 200.
     */
    nameColumnWidth?: number;
    /**
     * Columns to render in the task list pane to the right of the task name.
     * Defaults to `Start` + `End` date columns. Pass any combination to add
     * Assigned, Duration, Status, etc. Pass `[]` to show only the task name.
     */
    columns?: GanttColumn[];
    /**
     * Custom UI rendered in the toolbar where the built-in "Search tasks…"
     * input used to live (between the task-count chip and the zoom controls).
     * When provided, the built-in search input is replaced with this slot —
     * pass a `GanttFilterBar` (or your own filter component) here.
     */
    filterSlot?: React.ReactNode;
}

interface BarDrag {
    kind: 'bar';
    taskId: GanttTask['id'];
    mode: DragMode;
    startX: number;
    deltaPx: number;
}

interface LinkDrag {
    kind: 'link';
    sourceId: GanttTask['id'];
    sourceEdge: LinkEdge;
    pointerX: number;
    pointerY: number;
    overTaskId?: GanttTask['id'];
}

type DragInfo = BarDrag | LinkDrag | null;

const HEADER_HEIGHT = 64;

// ─── Update context — exposes a per-instance "update a task field" function
//     so cell renderers in custom columns can commit edits without prop
//     drilling. The provider is rendered inside GanttContainer below. ──────
export interface GanttUpdateContextValue {
    /** Set a task's `start` or `end` date and run the dependency cascade. */
    updateTaskField: (
        id: GanttTask['id'],
        field: 'start' | 'end',
        nextDate: Date,
    ) => void;
}

export const GanttUpdateContext = createContext<GanttUpdateContextValue | null>(null);

/** Hook for column renderers that need to write back to the Gantt's task
 *  state — e.g. an inline date editor. Returns `null` outside a provider. */
export function useGanttUpdate(): GanttUpdateContextValue | null {
    return useContext(GanttUpdateContext);
}

// ─── Dependency cascade (ported from src/components/gantt-chart/GanttChart.tsx) ─
// Given the freshly-dragged task's new dates, walk the dependency graph DFS
// from it and apply the four standard Gantt update rules to each downstream
// task — preserving each downstream task's original duration. After the
// initial cascade, parent/category bars are rolled up (start = min child
// start, end = max child end); if a parent's dates change, its own outgoing
// dependency links cascade too. The whole thing loops until no parent moves.
// A `visited` Set per cascade pass short-circuits cycles and diamonds.
function applyDragWithCascade(
    tasks: GanttTask[],
    links: GanttLink[],
    draggedId: GanttTask['id'],
    mode: DragMode,
    deltaMs: number,
    snapMs: number,
    cascadeMode: 'forward' | 'bidirectional' = 'forward',
): GanttTask[] {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const dragged = byId.get(draggedId);
    if (!dragged) return tasks;

    // 1. Apply the drag delta to the dragged task itself.
    let nextDragged: GanttTask;
    if (mode === 'move') {
        nextDragged = {
            ...dragged,
            start: new Date(dragged.start.getTime() + deltaMs),
            end: new Date(dragged.end.getTime() + deltaMs),
        };
    } else if (mode === 'resize-start') {
        const ns = new Date(dragged.start.getTime() + deltaMs);
        if (ns.getTime() >= dragged.end.getTime() - snapMs) return tasks;
        nextDragged = { ...dragged, start: ns };
    } else if (mode === 'resize-end') {
        const ne = new Date(dragged.end.getTime() + deltaMs);
        if (ne.getTime() <= dragged.start.getTime() + snapMs) return tasks;
        nextDragged = { ...dragged, end: ne };
    } else {
        return tasks;
    }
    byId.set(nextDragged.id, nextDragged);

    // 2. Pre-index children by parent so roll-up later is O(parents) per pass.
    const childrenByParent = new Map<GanttTask['id'], GanttTask['id'][]>();
    for (const t of tasks) {
        if (t.parent === undefined || t.parent === null) continue;
        const arr = childrenByParent.get(t.parent) ?? [];
        arr.push(t.id);
        childrenByParent.set(t.parent, arr);
    }

    // Structural move: when a parent shifts (by drag or cascade), every
    // descendant shifts by the same delta. Without this, dragging anything
    // upstream of e.g. Firmware Implementation moves t4 forward via the
    // dependency graph but leaves its sub-tasks (t4-1…) behind — and the
    // roll-up step then snaps t4 back to fit them.
    const shiftDescendants = (taskId: GanttTask['id'], deltaMs: number) => {
        if (deltaMs === 0) return;
        const queue = [...(childrenByParent.get(taskId) ?? [])];
        while (queue.length > 0) {
            const cid = queue.shift()!;
            const child = byId.get(cid);
            if (child) {
                byId.set(cid, {
                    ...child,
                    start: new Date(child.start.getTime() + deltaMs),
                    end: new Date(child.end.getTime() + deltaMs),
                });
            }
            const grand = childrenByParent.get(cid);
            if (grand) queue.push(...grand);
        }
    };

    // If the user dragged a parent (or any node with descendants) in move
    // mode, the same delta applies to all descendants too.
    if (mode === 'move') {
        shiftDescendants(nextDragged.id, deltaMs);
    }

    // 3. Bidirectional cascade — BFS that walks BOTH outgoing AND incoming
    //    links from every visited task. Outgoing direction is the classic
    //    "drag a source, target follows"; incoming direction is "drag a
    //    target, source follows" (the rigid-chain behaviour). Each call
    //    takes its own `visited` Set so a parent's chain can re-flow even
    //    when those neighbours were already touched by an earlier pass.
    const cascadeFrom = (seedId: GanttTask['id']) => {
        const visited = new Set<GanttTask['id']>([seedId]);
        const queue: GanttTask['id'][] = [seedId];
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const current = byId.get(currentId);
            if (!current) continue;

            for (const link of links) {
                // Determine the neighbour we'd flow to and our role in the link.
                let neighbourId: GanttTask['id'];
                let neighbourIsLinkTarget: boolean;
                if (link.source === currentId) {
                    neighbourId = link.target;
                    neighbourIsLinkTarget = true; // forward direction
                } else if (link.target === currentId && cascadeMode === 'bidirectional') {
                    neighbourId = link.source;
                    neighbourIsLinkTarget = false; // backward direction
                } else {
                    continue;
                }
                if (visited.has(neighbourId)) continue;

                const neighbour = byId.get(neighbourId);
                if (!neighbour) continue;

                const durationMs = neighbour.end.getTime() - neighbour.start.getTime();
                let nextStart: Date;
                let nextEnd: Date;

                if (neighbourIsLinkTarget) {
                    // Forward: link.source = current, link.target = neighbour.
                    // Compute neighbour's edge from the link rule.
                    switch (link.type) {
                        case 'e2s':
                            nextStart = new Date(current.end);
                            nextEnd = new Date(nextStart.getTime() + durationMs);
                            break;
                        case 's2s':
                            nextStart = new Date(current.start);
                            nextEnd = new Date(nextStart.getTime() + durationMs);
                            break;
                        case 'e2e':
                            nextEnd = new Date(current.end);
                            nextStart = new Date(nextEnd.getTime() - durationMs);
                            break;
                        case 's2e':
                            nextEnd = new Date(current.start);
                            nextStart = new Date(nextEnd.getTime() - durationMs);
                            break;
                        default:
                            continue;
                    }
                } else {
                    // Backward: link.target = current, link.source = neighbour.
                    // Apply the inverse — anchor neighbour's edge to current's.
                    switch (link.type) {
                        case 'e2s':
                            nextEnd = new Date(current.start);
                            nextStart = new Date(nextEnd.getTime() - durationMs);
                            break;
                        case 's2s':
                            nextStart = new Date(current.start);
                            nextEnd = new Date(nextStart.getTime() + durationMs);
                            break;
                        case 'e2e':
                            nextEnd = new Date(current.end);
                            nextStart = new Date(nextEnd.getTime() - durationMs);
                            break;
                        case 's2e':
                            nextStart = new Date(current.end);
                            nextEnd = new Date(nextStart.getTime() + durationMs);
                            break;
                        default:
                            continue;
                    }
                }

                // Mark visited even when unchanged, so a diamond doesn't re-enter.
                visited.add(neighbourId);
                if (
                    nextStart.getTime() === neighbour.start.getTime() &&
                    nextEnd.getTime() === neighbour.end.getTime()
                ) {
                    continue;
                }
                // All four link rules preserve the neighbour's duration, so
                // delta_start === delta_end — a pure shift. Carry the
                // neighbour's descendants along by that delta.
                const delta = nextStart.getTime() - neighbour.start.getTime();
                byId.set(neighbourId, { ...neighbour, start: nextStart, end: nextEnd });
                shiftDescendants(neighbourId, delta);
                queue.push(neighbourId);
            }
        }
    };

    // 4. Initial cascade from the dragged task.
    cascadeFrom(nextDragged.id);

    // 5. Roll-up loop: parent.start = min(child.start), parent.end =
    //    max(child.end). Any parent whose dates change cascades from its
    //    own outgoing links too. Repeat until nothing changes. The
    //    iteration cap is purely defensive against pathological graphs.
    const MAX_ROLLUP_ITERATIONS = 16;
    for (let iter = 0; iter < MAX_ROLLUP_ITERATIONS; iter++) {
        const updatedParents: GanttTask['id'][] = [];
        for (const [parentId, childIds] of childrenByParent) {
            // The dragged task's position is user-intended. Skipping it from
            // roll-up means dragging a parent bar doesn't immediately reset
            // to fit its (unmoved) children.
            if (parentId === draggedId) continue;
            const parent = byId.get(parentId);
            if (!parent) continue;

            let minStart = Number.POSITIVE_INFINITY;
            let maxEnd = Number.NEGATIVE_INFINITY;
            for (const cid of childIds) {
                const child = byId.get(cid);
                if (!child) continue;
                const cs = child.start.getTime();
                const ce = child.end.getTime();
                if (cs < minStart) minStart = cs;
                if (ce > maxEnd) maxEnd = ce;
            }
            if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) continue;

            if (
                parent.start.getTime() !== minStart ||
                parent.end.getTime() !== maxEnd
            ) {
                byId.set(parentId, {
                    ...parent,
                    start: new Date(minStart),
                    end: new Date(maxEnd),
                });
                updatedParents.push(parentId);
            }
        }
        if (updatedParents.length === 0) break;
        for (const pid of updatedParents) cascadeFrom(pid);
    }

    // 6. Rebuild the array preserving the original task order.
    return tasks.map((t) => byId.get(t.id) ?? t);
}

export function GanttContainer({
    tasks: initialTasks,
    links: initialLinks,
    domain,
    rowHeight = 40,
    defaultCollapsed = false,
    initialCollapsedIds,
    showProgress = false,
    weekendDays,
    cascadeMode = 'forward',
    onTaskClick,
    onTaskDoubleClick,
    nameColumnWidth,
    columns,
    filterSlot,
}: GanttContainerProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const taskListInnerRef = useRef<HTMLDivElement>(null);
    const taskListWrapperRef = useRef<HTMLDivElement>(null);
    const level = useGanttStore((s) => s.zoom.level);
    const filters = useGanttStore((s) => s.filters);
    const setFilters = useGanttStore((s) => s.setFilters);

    const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
    const [links, setLinks] = useState<GanttLink[]>(initialLinks);

    // Sync internal state when the parent passes new tasks/links (e.g. when
    // it filters the data, swaps datasets, or recomputes). Without this the
    // GanttContainer would forever render the array it was first mounted with.
    // Drag-in-progress edits do mutate internal state too — they'll get
    // overwritten by the next prop change, which is the right trade-off for
    // filtering: the user expects filter results to be the source of truth.
    useEffect(() => {
        setTasks(initialTasks);
    }, [initialTasks]);
    useEffect(() => {
        setLinks(initialLinks);
    }, [initialLinks]);

    const [selectedId, setSelectedId] = useState<GanttTask['id'] | undefined>();
    const [selectedLinkId, setSelectedLinkId] = useState<GanttLink['id'] | undefined>();
    // Seed once from props. `initialCollapsedIds` wins if both are passed.
    const [collapsedIds, setCollapsedIds] = useState<Set<GanttTask['id']>>(() => {
        if (initialCollapsedIds && initialCollapsedIds.length > 0) {
            return new Set(initialCollapsedIds);
        }
        if (defaultCollapsed) {
            // Collapse every parent EXCEPT root-level ones (parents that have
            // no parent themselves). This keeps top-level grouping bars like
            // "Product Realisation Lifecycle" expanded so the user always sees
            // their immediate children — phases, in our case. Going deeper
            // (Documents, Design Review) stays hidden until manually expanded.
            const taskById = new Map(initialTasks.map((t) => [t.id, t]));
            const collapsed = new Set<GanttTask['id']>();
            for (const t of initialTasks) {
                if (t.parent === undefined || t.parent === null) continue;
                const parent = taskById.get(t.parent);
                if (!parent) continue;
                // Only collapse the parent if it ITSELF has a parent (i.e. it's
                // not a root row).
                if (parent.parent !== undefined && parent.parent !== null) {
                    collapsed.add(parent.id);
                }
            }
            return collapsed;
        }
        return new Set();
    });
    const [drag, setDrag] = useState<DragInfo>(null);

    // Pane layout: 'split' shows both task-list and timeline side-by-side with
    // a draggable splitter between them. 'left-only' hides the timeline, and
    // 'right-only' hides the task list. The taskListPaneWidth override only
    // matters in 'split' mode — when null, the task-list pane uses its
    // natural width (sum of column widths).
    const [paneMode, setPaneMode] = useState<'split' | 'left-only' | 'right-only'>('split');
    const [taskListPaneWidth, setTaskListPaneWidth] = useState<number | null>(null);

    const startSplitterDrag = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            // Read the task-list wrapper's actual rendered width so the drag
            // starts exactly where the splitter currently is, even when
            // `taskListPaneWidth` is still null (first drag — no override yet).
            const startWidth =
                taskListPaneWidth ??
                taskListWrapperRef.current?.getBoundingClientRect().width ??
                300;
            const onMove = (ev: PointerEvent) => {
                const next = Math.max(120, startWidth + (ev.clientX - startX));
                setTaskListPaneWidth(next);
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
        },
        [taskListPaneWidth],
    );

    // Selecting a task bar dismisses the dependency-delete affordance so the
    // two selection states don't visually compete. We also surface the click
    // to the parent component via `onTaskClick` so consumers can react (e.g.
    // open a document drawer for doc rows).
    const handleSelectTask = useCallback(
        (id: GanttTask['id'] | undefined) => {
            setSelectedId(id);
            setSelectedLinkId(undefined);
            if (id !== undefined && onTaskClick) {
                const clicked = initialTasks.find((t) => t.id === id) ?? tasks.find((t) => t.id === id);
                if (clicked) onTaskClick(clicked);
            }
        },
        [onTaskClick, initialTasks, tasks],
    );

    // Resolves a clicked task id to its GanttTask and fires `onTaskDoubleClick`.
    // The handler is shared by TaskListPane (sidebar rows) and TaskBar
    // (timeline bars) so both surfaces open the drawer on double-click.
    const handleDoubleClickTask = useCallback(
        (id: GanttTask['id']) => {
            if (!onTaskDoubleClick) return;
            const task = tasks.find((t) => t.id === id);
            if (task) onTaskDoubleClick(task);
        },
        [onTaskDoubleClick, tasks],
    );

    const handleSelectLink = useCallback((id: GanttLink['id']) => {
        setSelectedLinkId(id);
        setSelectedId(undefined);
    }, []);

    const handleDeleteLink = useCallback((id: GanttLink['id']) => {
        setLinks((prev) => prev.filter((l) => l.id !== id));
        setSelectedLinkId(undefined);
    }, []);

    // Escape clears any active link selection.
    useEffect(() => {
        if (selectedLinkId === undefined) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedLinkId(undefined);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedLinkId]);
    const [viewportWidth, setViewportWidth] = useState(
        typeof window !== 'undefined' ? Math.max(800, window.innerWidth - 420) : 1000,
    );
    const dragRef = useRef<DragInfo>(null);
    dragRef.current = drag;

    // Track the scrollable area's width so the time scale can clamp its
    // pxPerDay to never render narrower than the viewport.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => setViewportWidth(el.clientWidth);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const scale = useTimeScale(domain, viewportWidth);
    const snapMs = ZOOM_LEVELS[level].snapMs;

    // Apply current drag to produce visible (in-flight) tasks. Bars and dependency
    // lines render off this so the drag updates everything in lockstep. The
    // cascade fires here too, so dependents shift live with the dragged bar.
    const visibleTasks = useMemo<GanttTask[]>(() => {
        if (!drag || drag.kind !== 'bar') return tasks;
        const rawDeltaMs = scale.pxToMs(drag.deltaPx);
        const deltaMs = Math.round(rawDeltaMs / snapMs) * snapMs;
        if (deltaMs === 0) return tasks;
        return applyDragWithCascade(
            tasks,
            links,
            drag.taskId,
            drag.mode,
            deltaMs,
            snapMs,
            cascadeMode,
        );
    }, [tasks, links, drag, scale, snapMs, cascadeMode]);

    // hasChildren is derived from the full task set (not the filtered list)
    // so a parent keeps its chevron even when its children are filtered out.
    const hasChildrenSet = useMemo(() => {
        const set = new Set<GanttTask['id']>();
        for (const t of visibleTasks) {
            if (t.parent !== undefined && t.parent !== null) set.add(t.parent);
        }
        return set;
    }, [visibleTasks]);

    // Depth of each task in the hierarchy (0 = root). Used by the task list
    // to compute per-level indentation for arbitrarily-deep sub-task trees.
    const depthById = useMemo(() => {
        const byId = new Map<GanttTask['id'], GanttTask>();
        for (const t of visibleTasks) byId.set(t.id, t);
        const depths = new Map<GanttTask['id'], number>();
        const depthOf = (id: GanttTask['id']): number => {
            const cached = depths.get(id);
            if (cached !== undefined) return cached;
            const task = byId.get(id);
            if (!task || task.parent === undefined || task.parent === null) {
                depths.set(id, 0);
                return 0;
            }
            const d = depthOf(task.parent) + 1;
            depths.set(id, d);
            return d;
        };
        for (const t of visibleTasks) depthOf(t.id);
        return depths;
    }, [visibleTasks]);

    const filteredTasks = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        let result = visibleTasks;
        if (q) {
            result = result.filter(
                (t) =>
                    t.text.toLowerCase().includes(q) ||
                    (t.assigned ?? '').toString().toLowerCase().includes(q),
            );
        }
        if (collapsedIds.size > 0) {
            // Walk up each task's parent chain; hide if any ancestor is collapsed.
            const byId = new Map(result.map((t) => [t.id, t] as const));
            const isHiddenById = new Map<GanttTask['id'], boolean>();
            const isHidden = (id: GanttTask['id']): boolean => {
                const cached = isHiddenById.get(id);
                if (cached !== undefined) return cached;
                const task = byId.get(id);
                if (!task || task.parent === undefined || task.parent === null) {
                    isHiddenById.set(id, false);
                    return false;
                }
                const hidden = collapsedIds.has(task.parent) || isHidden(task.parent);
                isHiddenById.set(id, hidden);
                return hidden;
            };
            result = result.filter((t) => !isHidden(t.id));
        }
        return result;
    }, [visibleTasks, filters.search, collapsedIds]);

    const handleToggleCollapse = useCallback((id: GanttTask['id']) => {
        setCollapsedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleExpandAll = useCallback(() => {
        setCollapsedIds(new Set());
    }, []);

    // Commit an inline edit on a task's `start` or `end` date and run the
    // dependency cascade so downstream tasks reflow. Surfaced via the
    // `GanttUpdateContext` so custom column renderers can call it.
    const updateTaskField = useCallback(
        (id: GanttTask['id'], field: 'start' | 'end', nextDate: Date) => {
            setTasks((ts) => {
                const task = ts.find((t) => t.id === id);
                if (!task) return ts;
                const oldValue = field === 'start' ? task.start : task.end;
                const deltaMs = nextDate.getTime() - oldValue.getTime();
                if (deltaMs === 0) return ts;
                const mode: DragMode =
                    field === 'start' ? 'resize-start' : 'resize-end';
                return applyDragWithCascade(
                    ts,
                    links,
                    id,
                    mode,
                    deltaMs,
                    snapMs,
                    cascadeMode,
                );
            });
        },
        [links, snapMs, cascadeMode],
    );

    const updateContextValue = useMemo<GanttUpdateContextValue>(
        () => ({ updateTaskField }),
        [updateTaskField],
    );

    const handleCollapseAll = useCallback(() => {
        // Match the `defaultCollapsed` semantics — collapse every parent that
        // itself has a parent. Root-level parents stay expanded so the user
        // always sees the top-level grouping.
        const taskById = new Map(visibleTasks.map((t) => [t.id, t]));
        const next = new Set<GanttTask['id']>();
        for (const t of visibleTasks) {
            if (t.parent === undefined || t.parent === null) continue;
            const parent = taskById.get(t.parent);
            if (!parent) continue;
            if (parent.parent !== undefined && parent.parent !== null) {
                next.add(parent.id);
            }
        }
        setCollapsedIds(next);
    }, [visibleTasks]);

    const rowIndexById = useMemo(() => {
        const m = new Map<GanttTask['id'], number>();
        filteredTasks.forEach((t, i) => m.set(t.id, i));
        return m;
    }, [filteredTasks]);

    const totalHeight = filteredTasks.length * rowHeight;

    // Compute path geometry once per render — shared by DependencyLayer (for
    // drawing) and the delete button overlay (for midpoint positioning).
    const linkPaths = useMemo(
        () => computeLinkPaths(filteredTasks, links, scale, rowHeight, rowIndexById),
        [filteredTasks, links, scale, rowHeight, rowIndexById],
    );

    const selectedLinkPath = useMemo(
        () =>
            selectedLinkId !== undefined
                ? linkPaths.find((p) => p.id === selectedLinkId)
                : undefined,
        [linkPaths, selectedLinkId],
    );

    // Mirror right-pane vertical scroll onto the task list via transform.
    // Direct DOM mutation avoids a React re-render on every scroll frame.
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const inner = taskListInnerRef.current;
        if (inner) inner.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
    }, []);

    // When the row count shrinks (e.g., a parent is collapsed), the browser
    // may silently clamp the right pane's scrollTop without firing a scroll
    // event. Re-mirror manually so the task list stays aligned.
    useEffect(() => {
        const el = scrollRef.current;
        const inner = taskListInnerRef.current;
        if (el && inner) {
            inner.style.transform = `translateY(${-el.scrollTop}px)`;
        }
    }, [filteredTasks.length]);

    // Forward wheel events over the task list back to the timeline scroller,
    // so the mouse wheel feels native even though the left pane doesn't scroll.
    const handleTaskListWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop += e.deltaY;
        el.scrollLeft += e.deltaX;
    }, []);

    // Scroll the timeline horizontally so the given task's START edge lands
    // at the centre of the visible area. Anchoring on the start (rather than
    // the bar's midpoint) keeps long bars aligned predictably — the user
    // sees the bar begin in the middle and extend off to the right.
    const scrollTaskIntoView = useCallback(
        (id: GanttTask['id']) => {
            const el = scrollRef.current;
            if (!el) return;
            const task = tasks.find((t) => t.id === id);
            if (!task) return;
            const startX = scale.dateToX(task.start);
            const target = Math.max(0, startX - el.clientWidth / 2);
            el.scrollTo({ left: target, behavior: 'smooth' });
        },
        [tasks, scale],
    );

    // Sidebar row click: select + centre the bar. Same selection logic as
    // `handleSelectTask`, plus the horizontal scroll.
    const handleSelectTaskFromList = useCallback(
        (id: GanttTask['id'] | undefined) => {
            handleSelectTask(id);
            if (id !== undefined) scrollTaskIntoView(id);
        },
        [handleSelectTask, scrollTaskIntoView],
    );

    const jumpToToday = useCallback(() => {
        const today = new Date();
        if (today < domain[0] || today > domain[1]) return;
        const x = scale.dateToX(today);
        const el = scrollRef.current;
        if (el) {
            el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
        }
    }, [domain, scale]);

    useEffect(() => {
        jumpToToday();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Drag handlers (TaskBar callbacks) ───────────────────────────────
    const handleBarDragStart = useCallback(
        (taskId: GanttTask['id'], mode: DragMode, startX: number) => {
            setDrag({ kind: 'bar', taskId, mode, startX, deltaPx: 0 });
        },
        [],
    );

    const handleLinkDragStart = useCallback(
        (taskId: GanttTask['id'], edge: LinkEdge, clientX: number, clientY: number) => {
            const el = scrollRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const px = clientX - rect.left + el.scrollLeft;
            const py = clientY - rect.top + el.scrollTop - HEADER_HEIGHT;
            setDrag({ kind: 'link', sourceId: taskId, sourceEdge: edge, pointerX: px, pointerY: py });
        },
        [],
    );

    // ─── Global pointer handlers (active during drag) ────────────────────
    useEffect(() => {
        if (!drag) return;

        const onMove = (e: PointerEvent) => {
            const current = dragRef.current;
            if (!current) return;
            if (current.kind === 'bar') {
                setDrag({ ...current, deltaPx: e.clientX - current.startX });
            } else if (current.kind === 'link') {
                const el = scrollRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const px = e.clientX - rect.left + el.scrollLeft;
                const py = e.clientY - rect.top + el.scrollTop - HEADER_HEIGHT;

                // Hit-test: which task is the pointer over?
                const hit = document.elementFromPoint(e.clientX, e.clientY);
                const taskEl = hit?.closest('[data-task-id]') as HTMLElement | null;
                const taskId = taskEl?.dataset.taskId;
                const overTaskId =
                    taskId && taskId !== current.sourceId ? taskId : undefined;

                setDrag({ ...current, pointerX: px, pointerY: py, overTaskId });
            }
        };

        const onUp = (e: PointerEvent) => {
            const current = dragRef.current;
            if (!current) {
                setDrag(null);
                return;
            }
            if (current.kind === 'bar') {
                const deltaPx = e.clientX - current.startX;
                if (Math.abs(deltaPx) >= 3) {
                    const rawDeltaMs = scale.pxToMs(deltaPx);
                    const deltaMs = Math.round(rawDeltaMs / snapMs) * snapMs;
                    if (deltaMs !== 0) {
                        setTasks((ts) =>
                            applyDragWithCascade(
                                ts,
                                links,
                                current.taskId,
                                current.mode,
                                deltaMs,
                                snapMs,
                                cascadeMode,
                            ),
                        );
                    }
                }
            } else if (current.kind === 'link') {
                const hit = document.elementFromPoint(e.clientX, e.clientY);
                const taskEl = hit?.closest('[data-task-id]') as HTMLElement | null;
                const targetId = taskEl?.dataset.taskId;
                // Prefer the explicit edge marker (set on the connector dots).
                // If released on the bar body instead of a dot, snap to whichever
                // half of the bar the pointer is over — right half ⇒ 'e' (end),
                // left half ⇒ 's' (start).
                let targetEdge = taskEl?.dataset.taskEdge as LinkEdge | undefined;
                if (!targetEdge && taskEl) {
                    const rect = taskEl.getBoundingClientRect();
                    const midX = rect.left + rect.width / 2;
                    targetEdge = e.clientX >= midX ? 'e' : 's';
                }

                if (targetId && targetId !== current.sourceId) {
                    const linkType =
                        `${current.sourceEdge}2${targetEdge ?? 's'}` as GanttLink['type'];
                    const exists = links.some(
                        (l) =>
                            l.source === current.sourceId &&
                            l.target === targetId &&
                            l.type === linkType,
                    );
                    if (!exists) {
                        // 1) Add the new dependency link.
                        setLinks((ls) => [
                            ...ls,
                            {
                                id: `new-${Date.now()}`,
                                source: current.sourceId,
                                target: targetId,
                                type: linkType,
                            },
                        ]);

                        // 2) Snap the target task to satisfy the link rule
                        //    immediately. We compute the target's required
                        //    delta and route it through `applyDragWithCascade`
                        //    so any tasks already linked to the target also
                        //    follow (forward, plus backward in bidirectional
                        //    mode). Source stays put — the rule already holds
                        //    for it after this shift.
                        setTasks((ts) => {
                            const source = ts.find((t) => t.id === current.sourceId);
                            const target = ts.find((t) => t.id === targetId);
                            if (!source || !target) return ts;
                            const durationMs =
                                target.end.getTime() - target.start.getTime();
                            let nextStartMs: number;
                            switch (linkType) {
                                case 'e2s':
                                    nextStartMs = source.end.getTime();
                                    break;
                                case 's2s':
                                    nextStartMs = source.start.getTime();
                                    break;
                                case 'e2e':
                                    nextStartMs = source.end.getTime() - durationMs;
                                    break;
                                case 's2e':
                                    nextStartMs = source.start.getTime() - durationMs;
                                    break;
                                default:
                                    return ts;
                            }
                            const deltaMs = nextStartMs - target.start.getTime();
                            if (deltaMs === 0) return ts;
                            return applyDragWithCascade(
                                ts,
                                links,
                                targetId,
                                'move',
                                deltaMs,
                                snapMs,
                                cascadeMode,
                            );
                        });
                    }
                }
            }
            setDrag(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [drag, scale, snapMs, links, cascadeMode]);

    const linkDraft: LinkDraft | null =
        drag && drag.kind === 'link'
            ? {
                  sourceId: drag.sourceId,
                  sourceEdge: drag.sourceEdge,
                  pointerX: drag.pointerX,
                  pointerY: drag.pointerY,
                  overTaskId: drag.overTaskId,
              }
            : null;

    const isDragging = drag !== null;

    return (
        <GanttUpdateContext.Provider value={updateContextValue}>
        <div className="flex flex-col h-full w-full bg-slate-50">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 px-4 h-12 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900 truncate">
                        Project Timeline
                    </h2>
                    <span className="text-[11px] text-slate-500 px-2 py-0.5 rounded-full bg-slate-100 font-medium">
                        {filteredTasks.length} tasks · {links.length} dependencies
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {(() => {
                        // Show "Expand all" whenever ANY parent is currently
                        // collapsed; otherwise show "Collapse all".
                        const anyCollapsed = collapsedIds.size > 0;
                        return (
                            <button
                                type="button"
                                onClick={anyCollapsed ? handleExpandAll : handleCollapseAll}
                                className="inline-flex items-center justify-center h-8 px-3 rounded border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-colors whitespace-nowrap"
                            >
                                {anyCollapsed ? 'Expand all' : 'Collapse all'}
                            </button>
                        );
                    })()}
                    {filterSlot ? (
                        filterSlot
                    ) : (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Search tasks…"
                                value={filters.search}
                                onChange={(e) => setFilters({ search: e.target.value })}
                                className="h-8 pl-8 w-56 text-sm"
                            />
                        </div>
                    )}
                    <ZoomControls onJumpToToday={jumpToToday} />
                </div>
            </div>

            {/* Body */}
            <div
                className={`flex flex-1 min-h-0 overflow-hidden relative ${
                    isDragging ? 'select-none cursor-grabbing' : ''
                }`}
            >
                {paneMode !== 'right-only' && (
                    <div
                        ref={taskListWrapperRef}
                        className="shrink-0 overflow-x-auto relative"
                        style={{
                            width:
                                paneMode === 'left-only'
                                    ? '100%'
                                    : taskListPaneWidth ?? 'auto',
                        }}
                    >
                        <TaskListPane
                            tasks={filteredTasks}
                            rowHeight={rowHeight}
                            headerHeight={HEADER_HEIGHT}
                            selectedId={selectedId}
                            onSelect={handleSelectTaskFromList}
                            onDoubleSelect={handleDoubleClickTask}
                            innerRef={taskListInnerRef}
                            onWheel={handleTaskListWheel}
                            collapsedIds={collapsedIds}
                            hasChildrenSet={hasChildrenSet}
                            depthById={depthById}
                            onToggleCollapse={handleToggleCollapse}
                            nameColumnWidth={nameColumnWidth}
                            columns={columns}
                        />
                    </div>
                )}

                {/* Splitter — 0-width flex slot so the timeline butts right
                    up against the task-list pane (no visible gap), with an
                    absolutely-positioned 6px hit area straddling the
                    boundary. The hit area is invisible until hovered.
                    `zIndex: 50` on the outer container makes the splitter
                    form a stacking context above the scroll viewport sibling
                    so task bars don't paint over the hover highlight. */}
                {paneMode === 'split' && (
                    <div
                        className="relative shrink-0"
                        style={{ width: 0, zIndex: 50 }}
                    >
                        <div
                            onPointerDown={startSplitterDrag}
                            className="absolute top-0 bottom-0 group/splitter cursor-col-resize"
                            style={{ left: -3, width: 6, touchAction: 'none' }}
                        >
                            {/* Highlight bar that grows visible on hover. */}
                            <div className="absolute inset-y-0 inset-x-0 bg-transparent group-hover/splitter:bg-blue-200/70 transition-colors" />
                            {/* Floating collapse pill — both chevrons joined
                                side by side in a single rounded container. */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center bg-white border border-slate-300 rounded shadow-sm overflow-hidden opacity-0 pointer-events-none group-hover/splitter:opacity-100 group-hover/splitter:pointer-events-auto transition-opacity">
                                <button
                                    type="button"
                                    onClick={() => setPaneMode('right-only')}
                                    title="Hide task list (timeline full screen)"
                                    className="inline-flex items-center justify-center h-5 w-5 hover:bg-blue-50 text-slate-600 hover:text-blue-600"
                                >
                                    <ChevronLeft className="h-3 w-3" />
                                </button>
                                <div className="w-px h-3 bg-slate-300" />
                                <button
                                    type="button"
                                    onClick={() => setPaneMode('left-only')}
                                    title="Hide timeline (task list full screen)"
                                    className="inline-flex items-center justify-center h-5 w-5 hover:bg-blue-50 text-slate-600 hover:text-blue-600"
                                >
                                    <ChevronRight className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Floating "restore" button when one pane is fully hidden.
                    The button sits on the SIDE where the hidden pane used
                    to be, with an arrow pointing TOWARDS where it lives so
                    the user reads it as "open the missing pane". */}
                {paneMode === 'right-only' && (
                    // Task list is hidden → it was on the left. Put the
                    // restore tab on the LEFT edge with a `>` chevron.
                    <button
                        type="button"
                        onClick={() => setPaneMode('split')}
                        title="Show task list"
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 inline-flex items-center justify-center h-8 w-5 rounded-r bg-white border border-l-0 border-slate-300 shadow-md hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
                {paneMode === 'left-only' && (
                    // Timeline is hidden → it was on the right. Put the
                    // restore tab on the RIGHT edge with a `<` chevron.
                    <button
                        type="button"
                        onClick={() => setPaneMode('split')}
                        title="Show timeline"
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-20 inline-flex items-center justify-center h-8 w-5 rounded-l bg-white border border-r-0 border-slate-300 shadow-md hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                )}

                {paneMode !== 'left-only' && (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-auto bg-white relative"
                >
                    <div
                        className="relative"
                        style={{ width: scale.rangeWidth, minHeight: totalHeight + HEADER_HEIGHT }}
                    >
                        <TimelineHeader scale={scale} level={level} />
                        <div
                            className="relative"
                            style={{ width: scale.rangeWidth, height: totalHeight }}
                        >
                            <TimelineGrid
                                scale={scale}
                                level={level}
                                height={totalHeight}
                                weekendDays={weekendDays}
                            />
                            {/* Row separators with subtle alternation */}
                            {filteredTasks.map((t, i) => (
                                <div
                                    key={`row-${t.id}`}
                                    className={`absolute left-0 right-0 ${
                                        t.type === 'category' ? 'bg-slate-50/60' : ''
                                    }`}
                                    style={{
                                        top: i * rowHeight,
                                        height: rowHeight,
                                        borderBottom:
                                            i < filteredTasks.length - 1
                                                ? '1px solid rgb(241 245 249)'
                                                : 'none',
                                    }}
                                />
                            ))}
                            {/* Dependency lines — under bars */}
                            <DependencyLayer
                                paths={linkPaths}
                                rangeWidth={scale.rangeWidth}
                                height={totalHeight}
                                selectedLinkId={selectedLinkId}
                                onSelectLink={handleSelectLink}
                            />
                            {/* Task bars — wrapper is pointer-events-none so
                                clicks in the gutter pass through to the
                                DependencyLayer below; the bar button and dots
                                inside TaskBar re-enable events explicitly. */}
                            {filteredTasks.map((t, i) => (
                                <div
                                    key={`bar-${t.id}`}
                                    className="absolute left-0 right-0 pointer-events-none"
                                    style={{ top: i * rowHeight, height: rowHeight }}
                                >
                                    <TaskBar
                                        task={t}
                                        scale={scale}
                                        rowHeight={rowHeight}
                                        selected={selectedId === t.id}
                                        onSelect={handleSelectTask}
                                        onDoubleSelect={handleDoubleClickTask}
                                        onBarDragStart={handleBarDragStart}
                                        onLinkDragStart={handleLinkDragStart}
                                        showProgress={showProgress}
                                    />
                                </div>
                            ))}
                            {/* Drag preview overlay (rubber-band link line) */}
                            <InteractionLayer
                                draft={linkDraft}
                                tasks={filteredTasks}
                                scale={scale}
                                rowHeight={rowHeight}
                                rowIndexById={rowIndexById}
                                height={totalHeight}
                            />
                            {/* Delete-link affordance — shown at the midpoint
                                of the selected dependency's gutter segment. */}
                            {selectedLinkPath && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLink(selectedLinkPath.id);
                                    }}
                                    className="absolute inline-flex items-center justify-center rounded-full bg-red-500 text-white shadow-md ring-2 ring-white hover:bg-red-600 transition-colors"
                                    style={{
                                        left: selectedLinkPath.midX - 11,
                                        top: selectedLinkPath.midY - 11,
                                        width: 22,
                                        height: 22,
                                        zIndex: 35,
                                    }}
                                    aria-label="Delete dependency"
                                    title="Delete dependency (Esc to cancel)"
                                >
                                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                                </button>
                            )}
                            {/* Today marker — rendered last so it floats above bars and arrows */}
                            <TodayMarker scale={scale} height={totalHeight} />
                        </div>
                    </div>
                </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-4 h-8 bg-white border-t border-slate-200 text-[11px] text-slate-600 shrink-0">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
                    Legend
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-5 rounded-sm bg-violet-600" /> Phase
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-5 rounded-sm bg-emerald-500" /> Completed
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-5 rounded-sm bg-blue-500" /> In progress
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-5 rounded-sm bg-slate-400" /> Not started
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span
                        className="h-3 w-3 bg-amber-500 border border-amber-700"
                        style={{ transform: 'rotate(45deg)' }}
                    />{' '}
                    Milestone
                </span>
                <span className="inline-flex items-center gap-1.5 ml-auto">
                    <span className="h-3 w-0.5 bg-red-500" /> Today
                </span>
                <span className="text-slate-400">
                    Drag bars to move · drag edges to resize · drag dots to link
                </span>
            </div>
        </div>
        </GanttUpdateContext.Provider>
    );
}

import { supabase } from '@/integrations/supabase/client';
import { decorateLinkedDoc, type LinkedCCRDoc } from './ccrLinkedDocsService';
import { AppNotificationService, type CreateAppNotificationParams } from './appNotificationService';

export interface CreateExemptionFollowupTasksInput {
  ccrPrimaryKey: string;
  ccrId: string;
  ccrTitle: string;
  companyId: string;
  /** All un-approved linked docs at review time (for metadata + validation). */
  unapprovedLinkedDocs: LinkedCCRDoc[];
  /**
   * Per-doc assignee chosen by the admin in the Review Exemption dialog.
   * Map of PADT doc id → user id. Entries with null/undefined value are
   * skipped (admin chose "no follow-up task" for that doc).
   */
  assigneesPerDoc: Record<string, string | null | undefined>;
  /** The admin clicking Approve. Becomes mc_tasks.created_by (RLS requires this). */
  adminUserId: string;
  adminName: string;
  reviewReason: string;
  decisionDate: Date;
}

export interface CreateExemptionFollowupTasksResult {
  /** Tasks actually inserted. */
  created: number;
  /** (doc, assignee) pairs skipped because an open task already exists. */
  skipped: number;
  /** In-app notifications successfully sent (admin self-skipped). */
  notified: number;
  /** Distinct user ids that received an in-app notification. */
  notifiedUserIds: string[];
  /** Tasks created, with the doc and assignee for each — for the admin toast. */
  taskAssignments: Array<{ docId: string; docRef: string; assigneeId: string }>;
  /** Exempted docs the admin opted out of (assignee = null/none). */
  docsSkippedNoAssignee: Array<{ docId: string; docRef: string }>;
}

/**
 * Insert one `mc_tasks` row per (doc, assignee) pair that the admin selected
 * in the Review Exemption dialog. Skips pairs that already have an open task
 * tied to this CCR. Fires an in-app notification for each new task, with the
 * admin themselves self-skipped.
 */
export async function createExemptionFollowupTasks(
  input: CreateExemptionFollowupTasksInput,
): Promise<CreateExemptionFollowupTasksResult> {
  const empty: CreateExemptionFollowupTasksResult = {
    created: 0,
    skipped: 0,
    notified: 0,
    notifiedUserIds: [],
    taskAssignments: [],
    docsSkippedNoAssignee: [],
  };

  // Only consider docs that the admin selected an assignee for AND that are
  // still in the un-approved set (skip docs that were approved between the
  // request and the review).
  const unapprovedById = new Map(
    input.unapprovedLinkedDocs.map((d) => [d.id, d] as const),
  );

  type Pair = { doc: LinkedCCRDoc; assigneeId: string };
  const wanted: Pair[] = [];
  const docsSkippedNoAssignee: Array<{ docId: string; docRef: string }> = [];

  for (const [docId, assigneeIdRaw] of Object.entries(input.assigneesPerDoc)) {
    const doc = unapprovedById.get(docId);
    if (!doc) continue; // doc got approved in the meantime — no task needed
    const assigneeId = assigneeIdRaw && assigneeIdRaw.trim() ? assigneeIdRaw : null;
    if (!assigneeId) {
      docsSkippedNoAssignee.push({
        docId: doc.id,
        docRef: doc.document_reference || doc.document_number || doc.id,
      });
      continue;
    }
    wanted.push({ doc, assigneeId });
  }

  if (wanted.length === 0) {
    return { ...empty, docsSkippedNoAssignee };
  }

  // Dedupe against existing open tasks for the same (doc, assignee) tied to
  // this CCR (matched via the CCR id embedded in the description text).
  const targetIds = wanted.map((w) => w.doc.id);
  const { data: existing } = await supabase
    .from('mc_tasks')
    .select('id, linked_document_id, assigned_to, description')
    .in('linked_document_id', targetIds)
    .eq('is_completed', false);

  const alreadyTaskedPairs = new Set(
    (existing || [])
      .filter((row) => (row.description || '').includes(input.ccrId))
      .map((row) => `${row.linked_document_id}::${row.assigned_to}`),
  );

  const toCreate = wanted.filter(
    ({ doc, assigneeId }) =>
      !alreadyTaskedPairs.has(`${doc.id}::${assigneeId}`),
  );
  const skippedByDedupe = wanted.length - toCreate.length;
  if (toCreate.length === 0) {
    return { ...empty, skipped: wanted.length, docsSkippedNoAssignee };
  }

  const decisionDateStr = input.decisionDate.toLocaleDateString();
  const rows = toCreate.map(({ doc, assigneeId }) => {
    const { displayRef, displayTitle } = decorateLinkedDoc(doc);
    const refText = displayRef || doc.document_reference || 'Document';
    return {
      company_id: input.companyId,
      assigned_to: assigneeId,
      created_by: input.adminUserId,
      title: `Approve ${refText}: ${displayTitle}`,
      description:
        `An Implementation Exemption was approved for CCR ${input.ccrId} "${input.ccrTitle}" — ` +
        `this document is still un-approved and the CCR may now be Mark-Implemented without it.\n` +
        `Approved by ${input.adminName} on ${decisionDateStr}. ` +
        `Reason: "${input.reviewReason}".\n` +
        `Please complete review/approval of this document.`,
      linked_document_id: doc.id,
    };
  });

  const { error } = await supabase.from('mc_tasks').insert(rows);
  if (error) {
    console.error('Failed to insert exemption follow-up tasks', error);
    throw error;
  }

  const taskAssignments = toCreate.map(({ doc, assigneeId }) => ({
    docId: doc.id,
    docRef: doc.document_reference || doc.document_number || doc.id,
    assigneeId,
  }));

  // In-app notifications for each new task, skipping the admin themselves.
  const ccrUrl = `/app/change-control/${input.ccrPrimaryKey}`;
  const notificationTargets = toCreate.filter(
    ({ assigneeId }) => assigneeId !== input.adminUserId,
  );
  const notifications: CreateAppNotificationParams[] = notificationTargets.map(
    ({ doc, assigneeId }) => {
      const { displayRef, displayTitle } = decorateLinkedDoc(doc);
      const refText = displayRef || doc.document_reference || 'Document';
      return {
        user_id: assigneeId,
        actor_id: input.adminUserId,
        actor_name: input.adminName,
        company_id: input.companyId,
        category: 'change_control',
        action: 'ccr_exemption_followup_task',
        title: `Follow-up: approve ${refText}`,
        message:
          `An Implementation Exemption was approved for CCR ${input.ccrId} "${input.ccrTitle}". ` +
          `Please complete review/approval of ${displayTitle}.`,
        priority: 'high',
        entity_type: 'change_control_request',
        entity_id: input.ccrPrimaryKey,
        entity_name: input.ccrId,
        action_url: ccrUrl,
        metadata: {
          docId: doc.id,
          docRef: refText,
          ccrId: input.ccrId,
          reason: input.reviewReason,
        },
      };
    },
  );

  let notified = 0;
  let notifiedUserIds: string[] = [];
  if (notifications.length > 0) {
    const { error: notifError } =
      await new AppNotificationService().createBulkNotifications(notifications);
    if (notifError) {
      console.error('Failed to send exemption follow-up notifications', notifError);
    } else {
      notified = notifications.length;
      notifiedUserIds = Array.from(new Set(notifications.map((n) => n.user_id)));
    }
  }

  return {
    created: rows.length,
    skipped: skippedByDedupe,
    notified,
    notifiedUserIds,
    taskAssignments,
    docsSkippedNoAssignee,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuditTrailService } from '@/services/auditTrailService';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  status: 'Status',
  due_date: 'Due Date',
  document_type: 'Document Type',
  sub_section: 'Section',
  section_ids: 'Section',
  authors_ids: 'Author',
  reference_document_ids: 'Reference Documents',
  phase_id: 'Phase',
  version: 'Version',
  tags: 'Tags',
  is_record: 'Is Record',
  date: 'Date',
  is_current_effective_version: 'Current Effective Version',
  need_template_update: 'Needs Template Update',
  reviewer_group_ids: 'Reviewer Groups',
  record_id: 'Record ID',
  next_review_date: 'Next Review Date',
  document_number: 'Document Number',
};

function stringifyForLog(val: any): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.join(', ');
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export interface CIDocumentMetadata {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  document_type: string | null;
  sub_section: string | null;
  section_ids: string[] | null;
  authors_ids: string[] | null;
  assigned_to: string | null;
  reference_document_ids: string[] | null;
  phase_id: string | null;
  product_id: string | null;
  // New fields from Edit Document dialog
  version: string | null;
  tags: string[] | null;
  is_record: boolean | null;
  date: string | null;
  is_current_effective_version: boolean | null;
  need_template_update: boolean | null;
  reviewer_group_ids: string[] | null;
  record_id: string | null;
  next_review_date: string | null;
  document_number: string | null;
  change_control_ref: string | null;
}

/**
 * Hook to fetch and update CI metadata for a document from phase_assigned_document_template.
 * Used by the CIPropertyPanel for inline editing.
 */
export function useCIDocumentMetadata(documentId: string | null, companyId: string | undefined) {
  const [metadata, setMetadata] = useState<CIDocumentMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMetadata = useCallback(async () => {
    if (!documentId || !companyId) {
      setMetadata(null);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('phase_assigned_document_template')
        .select('id, name, status, due_date, document_type, sub_section, section_ids, authors_ids, reference_document_ids, phase_id, product_id, version, tags, is_record, date, is_current_effective_version, need_template_update, reviewer_group_ids, record_id, next_review_date, document_number, change_control_ref')
        .eq('id', documentId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching CI metadata:', error);
        setMetadata(null);
      } else {
        setMetadata({
          id: data.id,
          name: data.name || '',
          status: data.status || 'Not Started',
          due_date: data.due_date,
          document_type: data.document_type,
          sub_section: data.sub_section,
          section_ids: data.section_ids as string[] | null,
          authors_ids: data.authors_ids as string[] | null,
          assigned_to: null,
          reference_document_ids: data.reference_document_ids as string[] | null,
          phase_id: data.phase_id,
          product_id: data.product_id,
          version: data.version,
          tags: data.tags as string[] | null,
          is_record: data.is_record,
          date: data.date,
          is_current_effective_version: data.is_current_effective_version,
          need_template_update: data.need_template_update,
          reviewer_group_ids: data.reviewer_group_ids as string[] | null,
          record_id: data.record_id,
          next_review_date: data.next_review_date,
          document_number: data.document_number,
          change_control_ref: (data as any).change_control_ref ?? null,
        });
      }
    } catch (err) {
      console.error('Error fetching CI metadata:', err);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, companyId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const updateField = useCallback(async (field: string, value: any) => {
    if (!documentId) return;

    // Capture the prior value (for audit logging) before mutating.
    const oldValue = metadata ? (metadata as any)[field] : undefined;

    const { error } = await supabase
      .from('phase_assigned_document_template')
      .update({ [field]: value, updated_at: new Date().toISOString() } as any)
      .eq('id', documentId);

    if (error) {
      console.error(`Error updating ${field}:`, error);
      throw error;
    }

    // Update local state
    setMetadata(prev => prev ? { ...prev, [field]: value } : null);

    // Audit-log the change so it appears in the device-level audit trail.
    // Failures here must never block the save itself.
    try {
      const oldStr = stringifyForLog(oldValue);
      const newStr = stringifyForLog(value);
      if (oldStr === newStr) return; // no-op change

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !companyId) return;

      const documentName = field === 'name'
        ? stringifyForLog(value)
        : (metadata?.name || 'Document');
      const productId = metadata?.product_id || undefined;
      const action = field === 'status' ? 'document_status_changed' : 'document_updated';

      await AuditTrailService.logDocumentRecordEvent({
        userId: user.id,
        companyId,
        action,
        entityType: 'document',
        entityId: documentId,
        entityName: documentName,
        changes: [{
          field: FIELD_LABELS[field] || field,
          oldValue: oldStr,
          newValue: newStr,
        }],
        actionDetails: productId ? { product_id: productId } : undefined,
      });
    } catch (auditErr) {
      // Audit logging is non-blocking — log the failure but don't throw.
      console.warn('[useCIDocumentMetadata] Audit log skipped:', auditErr);
    }
  }, [documentId, companyId, metadata]);

  return { metadata, isLoading, updateField, refetch: fetchMetadata };
}

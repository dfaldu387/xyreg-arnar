import { supabase } from '@/integrations/supabase/client';
import { NoPhaseService } from './noPhaseService';

/**
 * Map a reference prefix (the letters before the dash in e.g. "TEMP-005") to
 * the canonical document_type value used by the rest of the platform. Mirrors
 * the prefix vocabulary used elsewhere (Settings → Prefixes & Document
 * Numbering) so the auto-detected references stay in lockstep with the
 * existing document registry.
 */
export const REFERENCE_PREFIX_TO_TYPE: Record<string, string> = {
  SOP: 'SOP',
  TEMP: 'Template',
  TMPL: 'Template',
  FRM: 'Form',
  FORM: 'Form',
  POL: 'Policy',
  WI: 'Work Instruction',
  REF: 'Reference',
  CHK: 'Checklist',
};

export const REFERENCE_PREFIXES = Object.keys(REFERENCE_PREFIX_TO_TYPE);

export interface CreateReferenceDocumentInput {
  /** "SOP-008", "TEMP-005", … */
  refCode: string;
  /** Human title — e.g. "Design Plan Template". Falls back to refCode. */
  title?: string;
  /** Override the auto-inferred document type. */
  documentType?: string;
}

export interface CreateReferenceDocumentResult {
  id: string;
  name: string;
  document_reference: string;
  document_type: string;
}

/**
 * Insert a stub company-scoped document so that an auto-detected reference
 * (e.g. "SOP-008 Document Control") becomes resolvable. The row uses the
 * "No Phase" company phase as its parent — same convention used everywhere
 * else for company-level documents.
 *
 * Returns the inserted row's identity fields. Throws on insert failure.
 */
export async function createReferenceDocument(
  companyId: string,
  input: CreateReferenceDocumentInput,
): Promise<CreateReferenceDocumentResult> {
  if (!companyId) throw new Error('companyId is required');
  const refCode = input.refCode.trim();
  if (!refCode) throw new Error('refCode is required');

  const prefix = (refCode.split('-')[0] || '').toUpperCase();
  const documentType =
    input.documentType?.trim() || REFERENCE_PREFIX_TO_TYPE[prefix] || 'Document';

  // Compose the row name as "<refCode> <title>" so it lines up with how the
  // rest of the registry displays SOPs (e.g. "SOP-008 Document Control").
  const cleanTitle = (input.title || '').trim();
  const name = cleanTitle ? `${refCode} ${cleanTitle}` : refCode;

  // Resolve the company's "No Phase" id — required because phase_id is NOT NULL.
  const phaseId = await NoPhaseService.getNoPhaseId(companyId);
  if (!phaseId) {
    throw new Error('Could not resolve "No Phase" for this company');
  }

  const { data, error } = await supabase
    .from('phase_assigned_document_template')
    .insert({
      company_id: companyId,
      phase_id: phaseId,
      name,
      document_reference: refCode,
      document_number: refCode,
      document_type: documentType,
      document_scope: 'company_document' as const,
      status: 'Draft',
      is_excluded: false,
      product_id: null,
    })
    .select('id, name, document_reference, document_type')
    .single();

  if (error || !data) {
    throw error || new Error('Failed to create reference document');
  }

  // Notify any open editors so they can flip matching reference chips from
  // "missing" to "linked" without a full reload.
  try {
    window.dispatchEvent(
      new CustomEvent('xyreg:reference-doc-created', {
        detail: {
          companyId,
          refCode,
          name: data.name,
          docId: data.id,
        },
      }),
    );
  } catch {
    /* noop — non-browser env */
  }

  return {
    id: data.id,
    name: data.name || name,
    document_reference: data.document_reference || refCode,
    document_type: data.document_type || documentType,
  };
}
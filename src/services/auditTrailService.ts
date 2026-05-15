import { supabase } from '@/integrations/supabase/client';
import type { AuditCategory, UnifiedAuditTrailEntry, AuditTrailFilters, FieldChange } from '@/types/auditTrail';

/**
 * Normalize entity type so DOCUMENT, document, Document all render the same.
 */
export function normalizeEntityType(entityType: string | undefined | null): string {
  if (!entityType) return '';
  const raw = entityType.trim();
  if (!raw) return '';
  // Title case (split on underscores/spaces)
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Normalize action label for display: 'document_created' → 'Created',
 * 'CREATE' → 'Created', 'status_changed' → 'Status Changed'.
 */
export function normalizeActionLabel(action: string | undefined | null): string {
  if (!action) return '';
  const lower = action.toLowerCase().trim();
  const map: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    view: 'Viewed',
    download: 'Downloaded',
    share: 'Shared',
    export: 'Exported',
    document_created: 'Created',
    document_updated: 'Updated',
    document_draft_updated: 'Draft Updated',
    document_deleted: 'Deleted',
    document_status_changed: 'Status Changed',
    document_sent_for_review: 'Sent for Review',
    document_approved: 'Approved',
    document_rejected: 'Rejected',
    signature_failed: 'Signature Failed',
    signature_applied: 'Signature Applied',
    signature_rejected: 'Signature Rejected',
    user_created: 'User Created',
    user_invited: 'User Invited',
  };
  if (map[lower]) return map[lower];
  // Strip common entity prefixes (document_, product_, ccr_, etc.)
  const stripped = lower.replace(/^(document|product|ccr|capa|user|review)_/, '');
  return stripped
    .split(/[_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Default reason fallback for empty "Why" values.
 */
export function defaultReasonFor(action: string | undefined | null): string {
  if (!action) return 'System event';
  const lower = action.toLowerCase().trim();
  const reasons: Record<string, string> = {
    login: 'User sign-in',
    logout: 'User sign-out',
    failed_login: 'Authentication failed',
    role_change: 'Role assignment updated',
    permission_change: 'Permissions updated',
    account_lockout: 'Account locked after failed attempts',
    create: 'Record created',
    update: 'Record updated',
    delete: 'Record deleted',
    view: 'Record viewed',
    download: 'Record downloaded',
    share: 'Record shared',
    export: 'Record exported',
    document_created: 'Document created',
    document_updated: 'Document updated',
    document_draft_updated: 'Document draft content edited',
    document_deleted: 'Document deleted',
    document_status_changed: 'Document status changed',
    document_sent_for_review: 'Document sent for review',
    document_approved: 'Document approved via review workflow',
    document_rejected: 'Document rejected via review workflow',
    ccr_created: 'Change control request created',
    ccr_updated: 'Change control request updated',
    ccr_deleted: 'Change control request deleted',
    signature_applied: 'E-signature applied',
    signature_verified: 'E-signature verified',
    signature_failed: 'E-signature verification failed',
    user_created: 'New user account created',
    user_invited: 'User invited to company',
    signature_rejected: 'E-signature rejected by signer',
    request_created: 'E-signature request created',
    request_completed: 'E-signature request fully signed',
    request_voided: 'E-signature request voided',
    signer_authenticated: 'Signer authenticated',
    document_viewed: 'Document viewed by signer',
    hash_mismatch_detected: 'Document hash mismatch detected',
  };
  return reasons[lower] || 'System event';
}

/**
 * Action equivalence — used to dedupe entries that represent the same
 * user action logged into two different audit tables (e.g. product_audit_logs
 * writes "CREATE" while audit_trail_logs writes "document_created" for the
 * same document creation).
 */
function actionEquivalenceKey(action: string): string {
  const lower = (action || '').toLowerCase();
  if (lower === 'create' || lower === 'document_created') return 'create';
  if (lower === 'update' || lower === 'document_updated') return 'update';
  if (lower === 'delete' || lower === 'document_deleted') return 'delete';
  if (lower === 'status_changed' || lower === 'document_status_changed') return 'status_changed';
  return lower;
}

interface CreateAuditTrailData {
  companyId?: string | null;
  userId: string;
  category: AuditCategory;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  reason?: string;
  changes?: FieldChange[];
  actionDetails?: Record<string, any>;
}

export class AuditTrailService {
  // ───── Write Methods ─────

  static async logUserAccessEvent(data: {
    userId: string;
    companyId?: string | null;
    action:
      | 'login'
      | 'logout'
      | 'failed_login'
      | 'role_change'
      | 'permission_change'
      | 'account_lockout'
      | 'user_created'
      | 'user_invited';
    entityName?: string;
    reason?: string;
    changes?: FieldChange[];
    actionDetails?: Record<string, any>;
  }): Promise<void> {
    await this.createEntry({
      companyId: data.companyId,
      userId: data.userId,
      category: 'user_access_security',
      action: data.action,
      entityType: 'user',
      entityName: data.entityName,
      reason: data.reason || this.defaultReason(data.action),
      changes: data.changes,
      actionDetails: data.actionDetails,
    });
  }

  static async logDocumentRecordEvent(data: {
    userId: string;
    companyId: string;
    action:
      | 'document_created'
      | 'document_updated'
      | 'document_draft_updated'
      | 'document_deleted'
      | 'document_status_changed'
      | 'document_sent_for_review'
      | 'document_approved'
      | 'document_rejected';
    entityType?: string;
    entityId?: string;
    entityName?: string;
    reason?: string;
    changes?: FieldChange[];
    actionDetails?: Record<string, any>;
  }): Promise<void> {
    await this.createEntry({
      companyId: data.companyId,
      userId: data.userId,
      category: 'document_record',
      action: data.action,
      entityType: data.entityType || 'document',
      entityId: data.entityId,
      entityName: data.entityName,
      reason: data.reason || this.defaultReason(data.action),
      changes: data.changes,
      actionDetails: data.actionDetails,
    });
  }

  static async logQualityProcessEvent(data: {
    userId: string;
    companyId: string;
    action: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    reason?: string;
    changes?: FieldChange[];
  }): Promise<void> {
    await this.createEntry({
      companyId: data.companyId,
      userId: data.userId,
      category: 'quality_process',
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      reason: data.reason,
      changes: data.changes,
    });
  }

  static async logESignatureEvent(data: {
    userId: string;
    companyId: string | null;
    action:
      | 'signature_applied'
      | 'signature_verified'
      | 'signature_failed'
      | 'signature_rejected'
      | 'request_created'
      | 'request_completed'
      | 'request_voided'
      | 'signer_authenticated'
      | 'document_viewed'
      | 'hash_mismatch_detected';
    entityType: string;
    entityId?: string;
    entityName?: string;
    reason?: string;
    actionDetails?: Record<string, any>;
  }): Promise<void> {
    await this.createEntry({
      companyId: data.companyId,
      userId: data.userId,
      category: 'e_signature',
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      reason: data.reason,
      actionDetails: data.actionDetails,
    });
  }

  // ───── Read Methods ─────

  static async getUnifiedAuditTrail(
    companyId: string,
    filters: AuditTrailFilters,
    limit: number = 200,
    currentUserId?: string,
    userRole?: string
  ): Promise<UnifiedAuditTrailEntry[]> {
    // Viewer gets nothing
    if (userRole === 'viewer') return [];

    const effectiveFilters: AuditTrailFilters = userRole === 'editor' && currentUserId
      ? { ...filters, userId: filters.userId || currentUserId }
      : filters;

    const perTableLimit = Math.min(Math.max(limit, 200), 2000);

    const wantsTrail = !effectiveFilters.category || ['document_record', 'e_signature', 'user_access_security', 'quality_process'].includes(effectiveFilters.category);
    const wantsDocLog = !effectiveFilters.category || effectiveFilters.category === 'document_record';
    const wantsProdLog = !effectiveFilters.category || effectiveFilters.category === 'document_record';

    const [docLogs, prodLogs, trailLogs] = await Promise.all([
      wantsDocLog ? this.fetchDocumentLogs(companyId, effectiveFilters, perTableLimit) : Promise.resolve([]),
      wantsProdLog ? this.fetchProductLogs(companyId, effectiveFilters, perTableLimit) : Promise.resolve([]),
      wantsTrail ? this.fetchTrailLogs(companyId, effectiveFilters, perTableLimit) : Promise.resolve([]),
    ]);

    let all = [...docLogs, ...prodLogs, ...trailLogs];

    if (effectiveFilters.category) {
      all = all.filter(e => e.category === effectiveFilters.category);
    }
    if (effectiveFilters.actionType) {
      all = all.filter(e => e.action === effectiveFilters.actionType);
    }
    if (effectiveFilters.entityType) {
      all = all.filter(e => e.entityType.toLowerCase() === effectiveFilters.entityType!.toLowerCase());
    }
    if (effectiveFilters.searchTerm) {
      const term = effectiveFilters.searchTerm.toLowerCase();
      all = all.filter(e =>
        e.entityName.toLowerCase().includes(term) ||
        e.action.toLowerCase().includes(term) ||
        e.userName.toLowerCase().includes(term) ||
        (e.reason && e.reason.toLowerCase().includes(term))
      );
    }

    // Sort by timestamp desc
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return this.dedupeEntries(all).slice(0, limit);
  }

  // ───── CSV Export ─────

  static exportCSV(entries: UnifiedAuditTrailEntry[]): string {
    const header = 'Category,Action,Entity,Who,When,Why,IP Address';
    const rows = entries.map(e => {
      const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      const when = new Date(e.timestamp).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const who = e.userEmail ? `${e.userName} (${e.userEmail})` : e.userName;
      const entity = e.entityName
        ? `${normalizeEntityType(e.entityType)} - ${e.entityName}`
        : normalizeEntityType(e.entityType);
      return [
        escape(this.categoryLabel(e.category)),
        escape(normalizeActionLabel(e.action)),
        escape(entity),
        escape(who),
        escape(when),
        escape(e.reason || defaultReasonFor(e.action)),
        escape(e.ipAddress || ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  private static categoryLabel(category: AuditCategory): string {
    const labels: Record<AuditCategory, string> = {
      document_record: 'Documents & Records',
      e_signature: 'E-Signatures',
      user_access_security: 'User Access & Security',
      quality_process: 'Quality Processes',
    };
    return labels[category] || category;
  }

  // ───── Category Mapping ─────

  static categorizeAction(action: string, sourceTable: string): AuditCategory {
    if (sourceTable === 'audit_trail_logs') {
      // Category is stored directly in the table — handled during normalization
      return 'document_record';
    }

    const signatureActions = ['signature_applied', 'signature_verified', 'signature_failed', 'review_decision_made'];
    if (signatureActions.includes(action)) return 'e_signature';

    const accessActions = ['login', 'logout', 'failed_login', 'role_change', 'permission_change', 'account_lockout'];
    if (accessActions.includes(action)) return 'user_access_security';

    const qualityActions = ['capa_created', 'capa_updated', 'capa_closed', 'non_conformance', 'training_completed', 'phase_transition'];
    if (qualityActions.includes(action)) return 'quality_process';

    return 'document_record';
  }

  // ───── Product-Scoped Document Audit Trail ─────

  /**
   * Get document audit trail entries scoped to a specific product/device.
   * Queries all 3 audit tables but filters to only documents belonging to this product.
   */
  static async getProductDocumentAuditTrail(
    productId: string,
    companyId: string,
    filters: AuditTrailFilters,
    limit: number = 200
  ): Promise<UnifiedAuditTrailEntry[]> {
    // Step 1: Get document IDs belonging to this product
    const [padtResult, dstResult] = await Promise.all([
      supabase
        .from('phase_assigned_document_template')
        .select('id')
        .eq('product_id', productId)
        .eq('company_id', companyId),
      supabase
        .from('document_studio_templates')
        .select('id')
        .eq('product_id', productId)
        .eq('company_id', companyId),
    ]);

    const documentIds = [
      ...(padtResult.data || []).map((d: any) => d.id),
      ...(dstResult.data || []).map((d: any) => d.id),
    ];

    // Step 2: Fetch from all sources in parallel.
    // We always fetch trail logs by product_id (action_details.product_id)
    // so entries for *deleted* documents — whose IDs no longer appear in
    // phase_assigned_document_template — still surface here.
    const promises: Promise<UnifiedAuditTrailEntry[]>[] = [
      this.fetchProductLogsByProductId(productId, companyId, filters),
      this.fetchTrailLogsByProductId(productId, companyId, filters),
    ];
    if (documentIds.length > 0) {
      promises.push(this.fetchDocumentLogsByDocIds(companyId, documentIds, filters));
      promises.push(this.fetchTrailLogsByEntityIds(companyId, documentIds, filters));
    }

    const results = await Promise.all(promises);
    let all = results.flat();

    // De-duplicate by source row id (the same trail row may match both the
    // entity-id query and the product-id query).
    const byId = new Map<string, UnifiedAuditTrailEntry>();
    for (const e of all) {
      const k = `${e.sourceTable}|${e.id}`;
      if (!byId.has(k)) byId.set(k, e);
    }
    all = Array.from(byId.values());

    // Client-side search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      all = all.filter(e =>
        e.entityName.toLowerCase().includes(term) ||
        e.action.toLowerCase().includes(term) ||
        e.userName.toLowerCase().includes(term) ||
        (e.reason && e.reason.toLowerCase().includes(term))
      );
    }

    // Sort by timestamp desc
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return this.dedupeEntries(all).slice(0, limit);
  }

  private static dedupeEntries(entries: UnifiedAuditTrailEntry[]): UnifiedAuditTrailEntry[] {
    const result: UnifiedAuditTrailEntry[] = [];
    const seen = new Map<string, number>(); // key → index in result

    for (const entry of entries) {
      const entityKey = (entry.entityName || entry.entityId || '').trim().toLowerCase();
      const actionKey = actionEquivalenceKey(entry.action);
      // Bucket timestamp into 30-second windows: the two writes happen via
      // Promise.all but the round-trip latency to two tables can drift
      // a few seconds, especially under load.
      const tsBucket = Math.floor(new Date(entry.timestamp).getTime() / 30000);
      const key = `${entry.userId}|${entityKey}|${actionKey}|${tsBucket}`;

      const existingIdx = seen.get(key);
      if (existingIdx === undefined) {
        seen.set(key, result.length);
        result.push(entry);
        continue;
      }

      // Prefer audit_trail_logs over product_audit_logs / document_audit_logs.
      const existing = result[existingIdx];
      const incomingPriority = entry.sourceTable === 'audit_trail_logs' ? 1 : 0;
      const existingPriority = existing.sourceTable === 'audit_trail_logs' ? 1 : 0;
      if (incomingPriority > existingPriority) {
        result[existingIdx] = entry;
      }
    }

    return result;
  }

  // ───── Private Helpers ─────

  private static async createEntry(data: CreateAuditTrailData): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('audit_trail_logs')
        .insert({
          company_id: data.companyId || null,
          user_id: data.userId,
          category: data.category,
          action: data.action,
          entity_type: data.entityType || null,
          entity_id: data.entityId || null,
          entity_name: data.entityName || null,
          reason: data.reason || null,
          changes: data.changes || [],
          action_details: data.actionDetails || {},
          ip_address: await this.getClientIP(),
          user_agent: navigator.userAgent,
        });

      if (error) {
        console.error('[AuditTrailService] Error inserting audit trail entry:', error);
      }
    } catch (err) {
      console.error('[AuditTrailService] Error creating audit trail entry:', err);
    }
  }

  private static async fetchDocumentLogs(companyId: string, filters: AuditTrailFilters, limit = 200): Promise<UnifiedAuditTrailEntry[]> {
    try {
      // Only the columns we actually use downstream — keeps the wire payload
      // small and the table scan tighter.
      let query = (supabase as any)
        .from('document_audit_logs')
        .select('id, company_id, user_id, action, action_details, document_id, created_at, reason, ip_address, user_profiles(first_name, last_name, email)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.actionType) query = query.eq('action', filters.actionType);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      return (data as any[]).map(row => ({
        id: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        userName: row.user_profiles ? `${row.user_profiles.first_name || ''} ${row.user_profiles.last_name || ''}`.trim() : 'Unknown',
        userEmail: row.user_profiles?.email || '',
        category: this.categorizeAction(row.action, 'document_audit_logs') as AuditCategory,
        action: row.action,
        entityType: row.action_details?.entityType || 'Document',
        entityId: row.document_id,
        entityName: row.action_details?.entityName || row.action_details?.document_name || 'Document',
        timestamp: row.created_at,
        reason: row.reason || row.action_details?.reason || this.defaultReason(row.action),
        changes: row.action_details?.changes,
        actionDetails: row.action_details,
        ipAddress: row.ip_address,
        sourceTable: 'document_audit_logs' as const,
      }));
    } catch {
      return [];
    }
  }

  private static async fetchProductLogs(companyId: string, filters: AuditTrailFilters, limit = 200): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('product_audit_logs')
        .select('id, company_id, user_id, action, entity_type, entity_name, product_id, created_at, reason, changes, metadata, ip_address, user_profiles(first_name, last_name, email)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.actionType) query = query.eq('action', filters.actionType);
      if (filters.entityType) query = query.ilike('entity_type', filters.entityType);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      return (data as any[]).map(row => ({
        id: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        userName: row.user_profiles ? `${row.user_profiles.first_name || ''} ${row.user_profiles.last_name || ''}`.trim() : 'Unknown',
        userEmail: row.user_profiles?.email || '',
        category: this.categorizeAction(row.action, 'product_audit_logs') as AuditCategory,
        action: row.action,
        entityType: row.entity_type || 'Product',
        entityId: row.product_id,
        entityName: row.entity_name || 'Product',
        timestamp: row.created_at,
        reason: row.reason || row.metadata?.reason || this.defaultReason(row.action),
        changes: row.changes,
        actionDetails: row.metadata,
        ipAddress: row.ip_address,
        sourceTable: 'product_audit_logs' as const,
      }));
    } catch {
      return [];
    }
  }

  private static async fetchTrailLogs(companyId: string, filters: AuditTrailFilters, limit = 200): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('audit_trail_logs')
        .select('id, company_id, user_id, category, action, entity_type, entity_id, entity_name, created_at, reason, changes, action_details, ip_address, ip_address_inferred, ip_address_source')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.actionType) query = query.eq('action', filters.actionType);
      if (filters.entityType) query = query.ilike('entity_type', filters.entityType);
      // Push the search term to the DB across the columns that index well.
      // PostgREST .or() escapes the term so it's safe for user input.
      if (filters.searchTerm) {
        const term = filters.searchTerm.replace(/[()*,]/g, '');
        if (term) {
          query = query.or(`entity_name.ilike.%${term}%,action.ilike.%${term}%,reason.ilike.%${term}%`);
        }
      }

      const { data, error } = await query;
      if (error || !data) return [];

      // For trail logs, we need to fetch user profiles separately
      const userIds = [...new Set((data as any[]).map((r: any) => r.user_id))];
      let userMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        if (profiles) {
          for (const p of profiles) {
            userMap[p.id] = { first_name: p.first_name || '', last_name: p.last_name || '', email: p.email || '' };
          }
        }
      }

      return (data as any[]).map(row => {
        const profile = userMap[row.user_id];
        return {
          id: row.id,
          companyId: row.company_id,
          userId: row.user_id,
          userName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown',
          userEmail: profile?.email || '',
          category: row.category as AuditCategory,
          action: row.action,
          entityType: row.entity_type || '',
          entityId: row.entity_id,
          entityName: row.entity_name || '',
          timestamp: row.created_at,
          reason: row.reason || this.defaultReason(row.action),
          changes: row.changes,
          actionDetails: row.action_details,
          ipAddress: row.ip_address ?? row.ip_address_inferred,
          ipAddressSource: row.ip_address_source ?? null,
          sourceTable: 'audit_trail_logs' as const,
        };
      });
    } catch {
      return [];
    }
  }

  private static async fetchDocumentLogsByDocIds(
    companyId: string,
    documentIds: string[],
    filters: AuditTrailFilters
  ): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('document_audit_logs')
        .select(`*, user_profiles(first_name, last_name, email)`)
        .eq('company_id', companyId)
        .in('document_id', documentIds)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      return (data as any[]).map(row => ({
        id: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        userName: row.user_profiles ? `${row.user_profiles.first_name || ''} ${row.user_profiles.last_name || ''}`.trim() : 'Unknown',
        userEmail: row.user_profiles?.email || '',
        category: this.categorizeAction(row.action, 'document_audit_logs') as AuditCategory,
        action: row.action,
        entityType: row.action_details?.entityType || 'Document',
        entityId: row.document_id,
        entityName: row.action_details?.entityName || row.action_details?.document_name || 'Document',
        timestamp: row.created_at,
        reason: row.reason || row.action_details?.reason || this.defaultReason(row.action),
        changes: row.action_details?.changes,
        actionDetails: row.action_details,
        ipAddress: row.ip_address,
        sourceTable: 'document_audit_logs' as const,
      }));
    } catch {
      return [];
    }
  }

  private static async fetchTrailLogsByEntityIds(
    companyId: string,
    entityIds: string[],
    filters: AuditTrailFilters
  ): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('audit_trail_logs')
        .select(`*`)
        .eq('company_id', companyId)
        .eq('category', 'document_record')
        .in('entity_id', entityIds)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      // Fetch user profiles
      const userIds = [...new Set((data as any[]).map((r: any) => r.user_id))];
      let userMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        if (profiles) {
          for (const p of profiles) {
            userMap[p.id] = { first_name: p.first_name || '', last_name: p.last_name || '', email: p.email || '' };
          }
        }
      }

      return (data as any[]).map(row => {
        const profile = userMap[row.user_id];
        return {
          id: row.id,
          companyId: row.company_id,
          userId: row.user_id,
          userName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown',
          userEmail: profile?.email || '',
          category: row.category as AuditCategory,
          action: row.action,
          entityType: row.entity_type || 'Document',
          entityId: row.entity_id,
          entityName: row.entity_name || '',
          timestamp: row.created_at,
          reason: row.reason || this.defaultReason(row.action),
          changes: row.changes,
          actionDetails: row.action_details,
          ipAddress: row.ip_address ?? row.ip_address_inferred,
          ipAddressSource: row.ip_address_source ?? null,
          sourceTable: 'audit_trail_logs' as const,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetch `audit_trail_logs` entries that reference this product via
   * `action_details.product_id`. Used so that deletion logs — whose
   * `entity_id` is gone from `phase_assigned_document_template` — still
   * surface on the device-scoped audit trail.
   */
  private static async fetchTrailLogsByProductId(
    productId: string,
    companyId: string,
    filters: AuditTrailFilters
  ): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('audit_trail_logs')
        .select(`*`)
        .eq('company_id', companyId)
        .eq('category', 'document_record')
        .filter('action_details->>product_id', 'eq', productId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      // Fetch user profiles
      const userIds = [...new Set((data as any[]).map((r: any) => r.user_id))];
      const userMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        if (profiles) {
          for (const p of profiles) {
            userMap[p.id] = { first_name: p.first_name || '', last_name: p.last_name || '', email: p.email || '' };
          }
        }
      }

      return (data as any[]).map(row => {
        const profile = userMap[row.user_id];
        return {
          id: row.id,
          companyId: row.company_id,
          userId: row.user_id,
          userName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown',
          userEmail: profile?.email || '',
          category: row.category as AuditCategory,
          action: row.action,
          entityType: row.entity_type || 'Document',
          entityId: row.entity_id,
          entityName: row.entity_name || '',
          timestamp: row.created_at,
          reason: row.reason || this.defaultReason(row.action),
          changes: row.changes,
          actionDetails: row.action_details,
          ipAddress: row.ip_address ?? row.ip_address_inferred,
          ipAddressSource: row.ip_address_source ?? null,
          sourceTable: 'audit_trail_logs' as const,
        };
      });
    } catch {
      return [];
    }
  }

  private static async fetchProductLogsByProductId(
    productId: string,
    companyId: string,
    filters: AuditTrailFilters
  ): Promise<UnifiedAuditTrailEntry[]> {
    try {
      let query = (supabase as any)
        .from('product_audit_logs')
        .select(`*, user_profiles(first_name, last_name, email)`)
        .eq('product_id', productId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data, error } = await query;
      if (error || !data) return [];

      return (data as any[]).map(row => ({
        id: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        userName: row.user_profiles ? `${row.user_profiles.first_name || ''} ${row.user_profiles.last_name || ''}`.trim() : 'Unknown',
        userEmail: row.user_profiles?.email || '',
        category: this.categorizeAction(row.action, 'product_audit_logs') as AuditCategory,
        action: row.action,
        entityType: row.entity_type || 'Product',
        entityId: row.product_id,
        entityName: row.entity_name || 'Product',
        timestamp: row.created_at,
        reason: row.reason || row.metadata?.reason || this.defaultReason(row.action),
        changes: row.changes,
        actionDetails: row.metadata,
        ipAddress: row.ip_address,
        sourceTable: 'product_audit_logs' as const,
      }));
    } catch {
      return [];
    }
  }

  private static defaultReason(action: string): string {
    return defaultReasonFor(action);
  }

  private static async getClientIP(): Promise<string> {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip || '';
    } catch {
      return '';
    }
  }
}

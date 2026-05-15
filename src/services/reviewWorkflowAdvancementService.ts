import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AuditTrailService } from '@/services/auditTrailService';

export class ReviewWorkflowAdvancementService {
  /**
   * Check if a workflow stage should advance after a decision is made
   * This considers required_approvals and approval_threshold settings
   */
  static async checkAndAdvanceWorkflow(workflowId: string): Promise<boolean> {
    try {
      console.log('[ReviewWorkflowAdvancement] Checking workflow:', workflowId);

      // Get workflow details
      const { data: workflow, error: workflowError } = await supabase
        .from('review_workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (workflowError || !workflow) {
        console.error('[ReviewWorkflowAdvancement] Error fetching workflow:', workflowError);
        return false;
      }

      // Get current stage details
      const { data: currentStage, error: stageError } = await supabase
        .from('review_workflow_stages')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('stage_number', workflow.current_stage)
        .single();

      if (stageError || !currentStage) {
        console.error('[ReviewWorkflowAdvancement] Error fetching current stage:', stageError);
        return false;
      }

      // Get all assignments for current stage
      const { data: assignments, error: assignmentsError } = await supabase
        .from('review_assignments')
        .select(`
          *,
          review_decisions(*)
        `)
        .eq('workflow_id', workflowId)
        .eq('stage_number', workflow.current_stage);

      if (assignmentsError) {
        console.error('[ReviewWorkflowAdvancement] Error fetching assignments:', assignmentsError);
        return false;
      }

      // Count approvals and rejections per assignment (reviewer group)
      let approvedAssignments = 0;
      let rejectedAssignments = 0;
      let pendingAssignments = 0;
      const totalAssignments = assignments?.length || 0;

      assignments?.forEach(assignment => {
        const decisions = assignment.review_decisions as any[] || [];
        
        // Check if this assignment has any approvals or rejections
        const hasApproval = decisions.some(d => d.decision === 'approved');
        const hasRejection = decisions.some(d => d.decision === 'rejected' || d.decision === 'changes_requested');
        
        if (hasRejection) {
          rejectedAssignments++;
        } else if (hasApproval) {
          approvedAssignments++;
        } else {
          pendingAssignments++;
        }
      });

      console.log('[ReviewWorkflowAdvancement] Stage stats:', {
        stage: workflow.current_stage,
        totalAssignments,
        approvedAssignments,
        rejectedAssignments,
        pendingAssignments,
        requiredApprovals: currentStage.required_approvals,
        approvalThreshold: currentStage.approval_threshold
      });

      // Check if we have enough decisions from reviewer groups
      const requiredApprovals = currentStage.required_approvals || 1;
      const approvalThreshold = currentStage.approval_threshold || 1.0;
      
      // Calculate if threshold is met
      // Threshold is a percentage (0.0 to 1.0) of total assignments (reviewer groups) that need to approve
      const requiredApprovalsByThreshold = Math.ceil(totalAssignments * approvalThreshold);
      const actualRequiredApprovals = Math.max(requiredApprovals, requiredApprovalsByThreshold);

      console.log('[ReviewWorkflowAdvancement] Approval requirements:', {
        requiredApprovals,
        requiredApprovalsByThreshold,
        actualRequiredApprovals,
        currentApprovedAssignments: approvedAssignments
      });

      // Check if any reviewer group rejected
      if (rejectedAssignments > 0) {
        console.log('[ReviewWorkflowAdvancement] Rejection found from reviewer group, marking workflow as rejected');
        await this.updateWorkflowStatus(workflowId, 'rejected');
        await this.updateRecordStatus(workflow, 'rejected');
        return true;
      }

      // Check if we have enough approvals from reviewer groups
      if (approvedAssignments >= actualRequiredApprovals) {
        console.log('[ReviewWorkflowAdvancement] Stage approval threshold met');
        
        // Check if this is the last stage
        if (workflow.current_stage >= workflow.total_stages) {
          console.log('[ReviewWorkflowAdvancement] Last stage completed, marking workflow as approved');
          await this.updateWorkflowStatus(workflowId, 'approved', true);
          await this.updateRecordStatus(workflow, 'approved');
          toast.success('Review workflow completed and approved');
        } else {
          // Advance to next stage
          console.log('[ReviewWorkflowAdvancement] Advancing to next stage');
          await this.advanceToNextStage(workflowId, workflow.current_stage + 1);
          toast.success(`Review advanced to stage ${workflow.current_stage + 1}`);
        }
        return true;
      }

      // Not enough approvals yet
      console.log('[ReviewWorkflowAdvancement] Not enough approvals yet, workflow remains in_review');
      await this.updateWorkflowStatus(workflowId, 'in_review');
      return false;

    } catch (error) {
      console.error('[ReviewWorkflowAdvancement] Error checking workflow advancement:', error);
      return false;
    }
  }

  /**
   * Update the workflow status
   */
  private static async updateWorkflowStatus(
    workflowId: string,
    status: string,
    isCompleted: boolean = false
  ): Promise<void> {
    const updates: any = {
      overall_status: status
    };

    if (isCompleted) {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('review_workflows')
      .update(updates)
      .eq('id', workflowId);

    if (error) {
      console.error('[ReviewWorkflowAdvancement] Error updating workflow status:', error);
    }
  }

  /**
   * Advance workflow to next stage
   */
  private static async advanceToNextStage(workflowId: string, nextStage: number): Promise<void> {
    const { error } = await supabase
      .from('review_workflows')
      .update({
        current_stage: nextStage,
        overall_status: 'in_review'
      })
      .eq('id', workflowId);

    if (error) {
      console.error('[ReviewWorkflowAdvancement] Error advancing to next stage:', error);
    }
  }

  /**
   * Update the status of the underlying record (document, CI instance, etc.)
   */
  private static async updateRecordStatus(workflow: any, status: string): Promise<void> {
    try {
      const recordType = workflow.record_type;
      const recordId = workflow.record_id;

      let tableName: string;
      let statusField: string = 'status';
      let statusValue: string;

      switch (recordType) {
        case 'document':
          tableName = 'documents';
          statusValue = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'In Review';
          break;
        case 'ci_instance':
          tableName = 'ci_instances';
          statusValue = status === 'approved' ? 'completed' : status === 'rejected' ? 'cancelled' : 'in_progress';
          break;
        case 'audit':
          tableName = 'audits';
          statusValue = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'in_review';
          break;
        case 'gap_analysis_item':
          tableName = 'gap_analysis_items';
          statusValue = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'in_review';
          break;
        default:
          console.warn('[ReviewWorkflowAdvancement] Unknown record type:', recordType);
          return;
      }

      // Capture previous status for audit (best-effort).
      let previousStatus: string | null = null;
      try {
        const { data: prevRow } = await supabase
          .from(tableName as any)
          .select(statusField)
          .eq('id', recordId)
          .maybeSingle();
        previousStatus = (prevRow as any)?.[statusField] ?? null;
      } catch {}

      const { error } = await supabase
        .from(tableName as any)
        .update({
          [statusField]: statusValue,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', recordId);

      if (error) {
        console.error('[ReviewWorkflowAdvancement] Error updating record status:', error);
      } else {
        console.log('[ReviewWorkflowAdvancement] Updated record status:', {
          recordType,
          recordId,
          status: statusValue
        });

        // AL-04 / AL-05: log status change for document workflow transitions.
        if (recordType === 'document') {
          try {
            const { data: { user: auditUser } } = await supabase.auth.getUser();
            const { data: docRow } = await supabase
              .from('phase_assigned_document_template')
              .select('company_id, name')
              .eq('id', recordId)
              .maybeSingle();
            const companyId = (docRow as any)?.company_id;
            const entityName = (docRow as any)?.name || 'Document';
            if (auditUser && companyId) {
              const action = status === 'approved'
                ? 'document_approved' as const
                : status === 'rejected'
                  ? 'document_rejected' as const
                  : 'document_status_changed' as const;
              const reason = status === 'approved'
                ? 'Document approved via review workflow'
                : status === 'rejected'
                  ? 'Document rejected via review workflow'
                  : 'Document status changed via review workflow';
              await AuditTrailService.logDocumentRecordEvent({
                userId: auditUser.id,
                companyId,
                action,
                entityType: 'document',
                entityId: recordId,
                entityName,
                reason,
                changes: [{
                  field: 'Status',
                  oldValue: previousStatus || 'In Review',
                  newValue: statusValue,
                }],
              });
            }
          } catch (auditErr) {
            console.error('[ReviewWorkflowAdvancement] Failed to write audit log:', auditErr);
          }
        }
      }

      // When a document is approved, stamp the Effective Date onto the
      // linked Document Studio draft so the controlled-document header
      // reflects the real go-live date instead of the draft-creation date.
      if (recordType === 'document' && status === 'approved') {
        try {
          const today = new Date().toISOString();
          const { data: drafts } = await supabase
            .from('document_studio_templates')
            .select('id, document_control')
            .eq('template_id', recordId);
          for (const d of drafts || []) {
            const dc = (d.document_control as any) || {};
            if (dc.effectiveDate) continue; // respect already-set date
            const next = { ...dc, effectiveDate: today };
            await supabase
              .from('document_studio_templates')
              .update({ document_control: next as any })
              .eq('id', d.id);
          }
        } catch (e) {
          console.error('[ReviewWorkflowAdvancement] Failed to stamp effective date:', e);
        }
      }
    } catch (error) {
      console.error('[ReviewWorkflowAdvancement] Error in updateRecordStatus:', error);
    }
  }
}

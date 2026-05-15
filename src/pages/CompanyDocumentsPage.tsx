
import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyRole } from "@/context/CompanyRoleContext";
import { DocumentScopeManager } from "@/components/documents/DocumentScopeManager";
import { ConsistentPageHeader } from "@/components/layout/ConsistentPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ComplianceSection } from "@/components/compliance/ComplianceSection";
import { CompanyDocumentSyncPage } from "@/components/documents/CompanyDocumentSyncPage";
import { ReferenceDocumentsTab } from "@/components/document-composer/ReferenceDocumentsTab";
import { TemplatesSettings } from "@/components/settings/TemplatesSettings";
import { usePlanMenuAccess } from '@/hooks/usePlanMenuAccess';
import { PORTFOLIO_MENU_ACCESS } from '@/constants/menuAccessKeys';
import { RestrictedFeatureProvider } from '@/contexts/RestrictedFeatureContext';
import { RestrictedPreviewBanner } from '@/components/subscription/RestrictedPreviewBanner';
import { ensureCompanySeedingComplete } from '@/services/ensureCompanySeedingService';
import { resyncStaleSopSections } from '@/services/resyncSeededSopContentService';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function CompanyDocumentsPage() {
  const { companyName } = useParams<{ companyName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const activeTab = searchParams.get('tab') || 'documents';
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { companyRoles, isLoading: rolesLoading } = useCompanyRole();
  const queryClient = useQueryClient();
  const [reseeding, setReseeding] = useState(false);
  const [forceReseedOpen, setForceReseedOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<
    Array<{ draftId: string; draftName: string; sectionId: string }>
  >([]);

  // Restriction check - double security pattern (hooks must be called before any conditional returns)
  const { isMenuAccessKeyEnabled, planName } = usePlanMenuAccess();
  const isFeatureEnabled = isMenuAccessKeyEnabled(PORTFOLIO_MENU_ACCESS.COMPLIANCE_DOCUMENTS);
  const isRestricted = !isFeatureEnabled;

  // Navigation handler for company breadcrumb
  const navigateToCompanyDashboard = () => {
    if (companyName) {
      navigate(`/app/company/${encodeURIComponent(companyName)}`);
    }
  };

  // Navigation handler for compliance instances
  const navigateToComplianceInstances = () => {
    if (companyName) {
      navigate(`/app/company/${encodeURIComponent(companyName)}/compliance-instances`);
    }
  };

  const handleSafeReseed = async () => {
    if (!companyId || !companyName) return;
    setReseeding(true);
    try {
      const r = await resyncStaleSopSections(
        companyId,
        decodeURIComponent(companyName),
        { mode: 'safe' },
      );
      if (r.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ['company-documents'] });
        queryClient.invalidateQueries({ queryKey: ['document-studio-templates'] });
        toast.success(`Re-seeded ${r.updated} section(s) from updated templates`);
      } else {
        toast.info('All seeded SOP drafts already match the latest templates');
      }
      if (r.conflicts.length > 0) {
        setPendingConflicts(r.conflicts);
      } else {
        setPendingConflicts([]);
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} re-seed(s) failed — see console for details`);
        console.warn('[Re-seed] failures', r.errors);
      }
    } catch (err) {
      toast.error(`Re-seed failed: ${(err as Error).message}`);
    } finally {
      setReseeding(false);
    }
  };

  const handleForceReseed = async () => {
    if (!companyId || !companyName) return;
    setReseeding(true);
    setForceReseedOpen(false);
    try {
      const r = await resyncStaleSopSections(
        companyId,
        decodeURIComponent(companyName),
        { mode: 'force' },
      );
      queryClient.invalidateQueries({ queryKey: ['company-documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-studio-templates'] });
      if (r.updated > 0) {
        toast.success(
          `Force re-seeded ${r.updated} section(s). Previous content archived to draft history.`,
        );
      } else {
        toast.info('Nothing to re-seed.');
      }
      setPendingConflicts([]);
    } catch (err) {
      toast.error(`Force re-seed failed: ${(err as Error).message}`);
    } finally {
      setReseeding(false);
    }
  };

  // Resolve company ID from roles first, then fallback to user-scoped DB query
  useEffect(() => {
    const resolveCompanyId = async () => {
      if (!companyName || rolesLoading) return;

      try {
        setIsLoading(true);
        const decodedName = decodeURIComponent(companyName);

        // Check user's roles first (same pattern as useCompanyId)
        const matchingRole = companyRoles.find(
          (role) => role.companyName.toLowerCase() === decodedName.toLowerCase()
        );

        if (matchingRole) {
          setCompanyId(matchingRole.companyId);
          return;
        }

        // Fallback: user-scoped DB query
        const { data: { user } } = await supabase.auth.getUser();
        const { data: companies, error } = await supabase
          .from("companies")
          .select("id, user_company_access!inner(user_id)")
          .eq("name", decodedName)
          .eq("user_company_access.user_id", user?.id || "")
          .limit(1);

        if (!error && companies && companies.length > 0) {
          setCompanyId(companies[0].id);
        } else {
          setCompanyId(null);
        }
      } catch {
        setCompanyId(null);
      } finally {
        setIsLoading(false);
      }
    };

    resolveCompanyId();
  }, [companyName, companyRoles, rolesLoading]);

  // Self-heal: silently top-up any missing Foundation/Pathway SOPs and
  // their derived WIs the moment the user opens Documents. No spinner —
  // when nothing is missing this is a few cheap COUNT queries. When
  // anything was inserted, invalidate the templates list so the new rows
  // appear without a manual refresh.
  useEffect(() => {
    if (!companyId || !companyName) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await ensureCompanySeedingComplete(
          companyId,
          decodeURIComponent(companyName),
        );
        if (cancelled) return;
        if (r.tierAInserted + r.tierBInserted + r.wiCreated > 0) {
          queryClient.invalidateQueries({ queryKey: ['phase-assigned-document-template'] });
          queryClient.invalidateQueries({ queryKey: ['company-documents'] });
        }
      } catch (err) {
        console.warn('[CompanyDocumentsPage] self-heal seeding failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, companyName, queryClient]);

  if (isLoading) {
    return (
      <div className="w-full max-w-full">
        <ConsistentPageHeader
          breadcrumbs={[
            { label: decodeURIComponent(companyName || ""), onClick: navigateToCompanyDashboard },
            { label: 'Compliance Instances', onClick: navigateToComplianceInstances },
            { label: 'Documents' }
          ]}
          title={`${decodeURIComponent(companyName || "")} Documents`}
          subtitle="Manage company-level documentation"
        />
        <div className="px-6 py-6">
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="w-full max-w-full">
        <ConsistentPageHeader
          breadcrumbs={[
            { label: decodeURIComponent(companyName || ""), onClick: navigateToCompanyDashboard },
            { label: 'Compliance Instances', onClick: navigateToComplianceInstances },
            { label: 'Documents' }
          ]}
          title={`${decodeURIComponent(companyName || "")} Documents`}
          subtitle="Manage company-level documentation"
        />
        <div className="px-6 py-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-destructive">Company Not Found</h1>
            <p className="text-muted-foreground mt-2">
              The company "{decodeURIComponent(companyName || "")}" could not be found.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    {
      label: decodeURIComponent(companyName || ""),
      onClick: navigateToCompanyDashboard
    },
    {
      label: 'Compliance Instances',
      onClick: navigateToComplianceInstances
    },
    {
      label: 'Documents'
    }
  ];

  // If mode=sync, show the sync page
  if (mode === 'dev') {
    return (
      <RestrictedFeatureProvider
        isRestricted={isRestricted}
        planName={planName}
        featureName="Documents"
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Sticky Header */}
          <ConsistentPageHeader
            breadcrumbs={[
              ...breadcrumbs.slice(0, -1),
              { label: 'Documents', onClick: () => navigate(`/app/company/${encodeURIComponent(companyName || '')}/documents`) },
              { label: 'Sync Info' }
            ]}
            title="Document Sync Info"
            subtitle={`Sync statistics for ${decodeURIComponent(companyName || "")}`}
          />

          {isRestricted && <RestrictedPreviewBanner className="mt-6 !mb-0" />}

          {/* Sync Page Content */}
          <div className="flex-1 overflow-y-auto">
            <CompanyDocumentSyncPage
              companyId={companyId}
              companyName={decodeURIComponent(companyName || "")}
            />
          </div>
        </div>
      </RestrictedFeatureProvider>
    );
  }

  return (
    <RestrictedFeatureProvider
      isRestricted={isRestricted}
      planName={planName}
      featureName="Documents"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Sticky Header */}
        <ConsistentPageHeader
          breadcrumbs={breadcrumbs}
          title={`${decodeURIComponent(companyName || "")} Documents`}
          subtitle="Manage company-level documentation"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSafeReseed}
                disabled={reseeding || !companyId}
                title="Push template fixes into existing seeded SOP drafts. Safe mode skips drafts you have edited."
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${reseeding ? 'animate-spin' : ''}`} />
                Re-seed updated templates
              </Button>
              {pendingConflicts.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setForceReseedOpen(true)}
                  disabled={reseeding}
                  title="Overwrite user-edited sections too. Previous content is archived for undo."
                >
                  Force re-seed {pendingConflicts.length} edited
                </Button>
              )}
            </div>
          }
        />

        {isRestricted && <RestrictedPreviewBanner className="mt-6 !mb-0" />}

        <AlertDialog open={forceReseedOpen} onOpenChange={setForceReseedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Force re-seed edited sections?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingConflicts.length} draft section(s) have local edits that differ from
                the previous template baseline. Force re-seed will replace them with the
                latest template content. The previous content is preserved on each draft's
                <code className="mx-1">metadata.reseedHistory</code>
                so it can be restored later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleForceReseed}>
                Overwrite and archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full flex flex-col gap-6 pt-6" data-tour="documents">
            <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="w-full">
              <div className="px-6">
                <TabsList>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="reference">Reference Documents</TabsTrigger>
                  <TabsTrigger value="templates">Enterprise Templates</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="documents">
                <ComplianceSection companyId={companyId} companyName={companyName} disabled={isRestricted} />
              </TabsContent>
              <TabsContent value="reference" className="px-6">
                <ReferenceDocumentsTab companyId={companyId} disabled={isRestricted} />
              </TabsContent>
              <TabsContent value="templates" className="px-6">
                <TemplatesSettings companyId={companyId} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </RestrictedFeatureProvider>
  );
}

export default CompanyDocumentsPage;

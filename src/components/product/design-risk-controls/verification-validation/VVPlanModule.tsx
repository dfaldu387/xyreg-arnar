import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, CheckCircle, Clock, AlertCircle, Sparkles, Users } from "lucide-react";
import { vvService, type VVPlan } from "@/services/vvService";
import { useTranslation } from "@/hooks/useTranslation";
import { CreateVVPlanDialog, type VVPlanInitialData } from "./CreateVVPlanDialog";
import { VVPlanDetailDialog } from "./VVPlanDetailDialog";
import { AIVVPlanSuggestionsDialog } from "./AIVVPlanSuggestionsDialog";
import { supabase } from "@/integrations/supabase/client";
import CompactScopeToggle from "@/components/product/shared/CompactScopeToggle";

interface VVPlanModuleProps {
  productId: string;
  companyId: string;
  disabled?: boolean;
}

export function VVPlanModule({ productId, companyId, disabled = false }: VVPlanModuleProps) {
  const { lang } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<VVPlan | null>(null);
  const [createInitialData, setCreateInitialData] = useState<VVPlanInitialData | null>(null);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [scopeViewOverride, setScopeViewOverride] = useState<'individual' | 'product_family' | null>(null);

  // Fetch product to get basic_udi_di
  const { data: product } = useQuery({
    queryKey: ['product-basic-udi', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, basic_udi_di')
        .eq('id', productId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const familyIdentifier = product?.basic_udi_di || null;
  const canShowFamily = !!familyIdentifier;
  // Default to product_family when basic_udi_di exists
  const scopeView = scopeViewOverride ?? (canShowFamily ? 'product_family' : 'individual');

  const { data: vvPlans, isLoading } = useQuery({
    queryKey: ['vv-plans', companyId, productId, scopeView, familyIdentifier],
    queryFn: () => {
      if (scopeView === 'product_family' && familyIdentifier) {
        return vvService.getVVPlansByFamily(companyId, familyIdentifier);
      }
      return vvService.getVVPlans(companyId, productId);
    },
  });

  const handleCreatePlan = () => {
    if (disabled) return;
    setCreateInitialData(null);
    setEditPlanId(null);
    setShowCreateDialog(true);
  };

  const handleEditPlan = (plan: VVPlan) => {
    if (disabled) return;
    setEditPlanId(plan.id);
    setCreateInitialData({
      name: plan.name,
      version: plan.version,
      description: plan.description || "",
      scope: plan.scope || "",
      methodology: plan.methodology ? plan.methodology.split(", ") : [],
      acceptance_criteria: plan.acceptance_criteria || "",
      roles: (plan as any).roles_responsibilities || [],
      scope_type: (plan.scope_type as 'individual' | 'product_family') || 'individual',
    });
    setShowCreateDialog(true);
  };

  const handleAIAccept = (data: VVPlanInitialData) => {
    setCreateInitialData(data);
    setEditPlanId(null);
    setShowCreateDialog(true);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'default';
      case 'draft': return 'secondary';
      case 'under_review': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'draft': return <FileText className="h-4 w-4" />;
      case 'under_review': return <Clock className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">{lang('verificationValidation.vvPlan.title')}</h3>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            {lang('verificationValidation.vvPlan.createPlan')}
          </Button>
        </div>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{lang('verificationValidation.vvPlan.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {lang('verificationValidation.vvPlan.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAISuggestions(true)} disabled={disabled}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Suggestions
          </Button>
          <Button onClick={handleCreatePlan} disabled={disabled}>
            <Plus className="h-4 w-4 mr-2" />
            {lang('verificationValidation.vvPlan.createPlan')}
          </Button>
        </div>
      </div>

      {/* Scope Mode Selector */}
      {canShowFamily && (
        <CompactScopeToggle
            scopeView={scopeView}
            onScopeChange={(scope) => setScopeViewOverride(scope)}
            familyIdentifier={familyIdentifier}
            showInfoBanner
            infoBannerText={`Plans in this view are shared across all variants with Basic UDI-DI: ${familyIdentifier}`}
          />
      )}

      {!vvPlans || vvPlans.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="text-lg font-medium text-foreground mb-2">{lang('verificationValidation.vvPlan.noPlansCreated')}</h4>
            <p className="text-muted-foreground">
              {lang('verificationValidation.vvPlan.emptyStateDescription')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {vvPlans.map((plan) => (
            <Card key={plan.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.scope_type === 'product_family' && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        Family
                      </Badge>
                    )}
                    <Badge variant={getStatusColor(plan.status)} className="gap-1">
                      {getStatusIcon(plan.status)}
                      {plan.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{lang('verificationValidation.vvPlan.labels.version')}:</span>
                    <span className="text-muted-foreground ml-2">{plan.version}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{lang('verificationValidation.vvPlan.labels.created')}:</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(plan.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {plan.scope && (
                    <div className="col-span-2">
                      <span className="font-medium text-foreground">{lang('verificationValidation.vvPlan.labels.scope')}:</span>
                      <p className="text-muted-foreground mt-1">{plan.scope}</p>
                    </div>
                  )}
                  {plan.methodology && (
                    <div className="col-span-2">
                      <span className="font-medium text-foreground">{lang('verificationValidation.vvPlan.labels.methodology')}:</span>
                      <p className="text-muted-foreground mt-1">{plan.methodology}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={disabled} onClick={() => setSelectedPlan(plan)}>
                    <FileText className="h-4 w-4 mr-2" />
                    {lang('verificationValidation.vvPlan.viewDetails')}
                  </Button>
                  {plan.status === 'draft' && (
                    <Button variant="outline" size="sm" disabled={disabled} onClick={() => handleEditPlan(plan)}>
                      {lang('verificationValidation.vvPlan.editPlan')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">{lang('verificationValidation.vvPlan.guidelines.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium text-foreground mb-2">{lang('verificationValidation.vvPlan.guidelines.verificationFocus')}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {lang('verificationValidation.vvPlan.guidelines.componentUnitTesting')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.integrationTesting')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.systemLevelVerification')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.requirementsTraceability')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-2">{lang('verificationValidation.vvPlan.guidelines.validationFocus')}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {lang('verificationValidation.vvPlan.guidelines.userNeedsFulfillment')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.clinicalEvaluation')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.usabilityTesting')}</li>
                <li>• {lang('verificationValidation.vvPlan.guidelines.realWorldPerformance')}</li>
              </ul>
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground">
              <strong>{lang('verificationValidation.vvPlan.guidelines.noteLabel')}:</strong> {lang('verificationValidation.vvPlan.guidelines.noteText')}
            </p>
          </div>
        </CardContent>
      </Card>

      <CreateVVPlanDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        productId={productId}
        companyId={companyId}
        initialData={createInitialData}
        editPlanId={editPlanId}
        familyIdentifier={familyIdentifier}
        defaultScopeType={scopeView}
      />

      {selectedPlan && (
        <VVPlanDetailDialog
          open={!!selectedPlan}
          onOpenChange={(open) => { if (!open) setSelectedPlan(null); }}
          plan={selectedPlan}
        />
      )}

      <AIVVPlanSuggestionsDialog
        open={showAISuggestions}
        onOpenChange={setShowAISuggestions}
        productId={productId}
        companyId={companyId}
        onAccept={handleAIAccept}
        scopeType={scopeView}
        familyIdentifier={familyIdentifier}
      />
    </div>
  );
}

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Shield, FileText, Beaker, CheckCircle2 } from 'lucide-react';
import { ValidationRationaleCard, type ValidationVerdict } from './ValidationRationaleCard';
import type { XyregModuleGroup } from '@/data/xyregModuleGroups';
import { useTranslation } from '@/hooks/useTranslation';

interface ModuleGroupChecklistProps {
  moduleGroup: XyregModuleGroup;
  iqRationale?: {
    verdict: ValidationVerdict | '';
    reasoning: string;
    evidence_notes: string;
  };
  oqRationale?: {
    verdict: ValidationVerdict | '';
    reasoning: string;
    deviations_noted: string;
    risk_accepted?: boolean;
    risk_rationale: string;
  };
  pqRationale?: {
    verdict: ValidationVerdict | '';
    reasoning: string;
    evidence_notes: string;
  };
  overallVerdict?: string;
  overallRationale?: string;
  conditions?: string;
  invalidatedByCore?: boolean;
  invalidatedService?: string;
  onSave: (data: {
    iq_rationale: any;
    oq_rationale: any;
    pq_rationale: any;
    overall_verdict: string;
    overall_rationale: string;
    conditions: string;
  }) => void;
  isSaving?: boolean;
}

export function ModuleGroupChecklist({
  moduleGroup,
  iqRationale: initialIq,
  oqRationale: initialOq,
  pqRationale: initialPq,
  overallVerdict: initialOverallVerdict = '',
  overallRationale: initialOverallRationale = '',
  conditions: initialConditions = '',
  invalidatedByCore = false,
  invalidatedService,
  onSave,
  isSaving = false,
}: ModuleGroupChecklistProps) {
  const { lang } = useTranslation();

  // IQ state
  const [iqVerdict, setIqVerdict] = useState<ValidationVerdict | ''>(initialIq?.verdict || '');
  const [iqReasoning, setIqReasoning] = useState(initialIq?.reasoning || '');
  const [iqEvidence, setIqEvidence] = useState(initialIq?.evidence_notes || '');

  // OQ state
  const [oqVerdict, setOqVerdict] = useState<ValidationVerdict | ''>(initialOq?.verdict || '');
  const [oqReasoning, setOqReasoning] = useState(initialOq?.reasoning || '');
  const [oqDeviations, setOqDeviations] = useState(initialOq?.deviations_noted || '');
  const [oqRiskAccepted, setOqRiskAccepted] = useState<boolean | undefined>(initialOq?.risk_accepted);
  const [oqRiskRationale, setOqRiskRationale] = useState(initialOq?.risk_rationale || '');

  // PQ state
  const [pqVerdict, setPqVerdict] = useState<ValidationVerdict | ''>(initialPq?.verdict || '');
  const [pqReasoning, setPqReasoning] = useState(initialPq?.reasoning || '');
  const [pqEvidence, setPqEvidence] = useState(initialPq?.evidence_notes || '');

  // Overall state
  const [overallVerdict, setOverallVerdict] = useState(initialOverallVerdict);
  const [overallRationale, setOverallRationale] = useState(initialOverallRationale);
  const [conditions, setConditions] = useState(initialConditions);

  const handleSave = () => {
    onSave({
      iq_rationale: { verdict: iqVerdict, reasoning: iqReasoning, evidence_notes: iqEvidence },
      oq_rationale: { verdict: oqVerdict, reasoning: oqReasoning, deviations_noted: oqDeviations, risk_accepted: oqRiskAccepted, risk_rationale: oqRiskRationale },
      pq_rationale: { verdict: pqVerdict, reasoning: pqReasoning, evidence_notes: pqEvidence },
      overall_verdict: overallVerdict,
      overall_rationale: overallRationale,
      conditions,
    });
  };

  const allSectionsComplete =
    iqVerdict !== '' && iqReasoning.trim() !== '' &&
    oqVerdict !== '' && oqReasoning.trim() !== '' &&
    pqVerdict !== '' && pqReasoning.trim() !== '' &&
    overallVerdict !== '' && overallRationale.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Module Group Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{moduleGroup.name}</h3>
          <p className="text-sm text-muted-foreground">{moduleGroup.intendedUse}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={
            moduleGroup.processRisk === 'high' ? 'border-destructive/50 text-destructive' :
            moduleGroup.processRisk === 'medium' ? 'border-amber-500/50 text-amber-700' :
            'border-emerald-500/50 text-emerald-700'
          }>
            {lang('infrastructure.checklist.risk', { level: moduleGroup.processRisk })}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {lang('infrastructure.checklist.sops', { count: moduleGroup.sopNumbers.length })}
          </Badge>
        </div>
      </div>

      {/* Features & Dependencies */}
      <div className="flex flex-wrap gap-1.5">
        {moduleGroup.features.map(f => (
          <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
        ))}
      </div>

      <Separator />

      {/* IQ Section */}
      <ValidationRationaleCard
        title={lang('infrastructure.checklist.iqTitle')}
        description={lang('infrastructure.checklist.iqDescription')}
        criticalThinkingPrompt={lang('infrastructure.checklist.iqThinkingPrompt')}
        verdict={iqVerdict}
        reasoning={iqReasoning}
        evidenceNotes={iqEvidence}
        onVerdictChange={setIqVerdict}
        onReasoningChange={setIqReasoning}
        onEvidenceNotesChange={setIqEvidence}
        invalidatedByCore={invalidatedByCore}
        invalidatedService={invalidatedService}
      />

      {/* OQ Section */}
      <ValidationRationaleCard
        title={lang('infrastructure.checklist.oqTitle')}
        description={lang('infrastructure.checklist.oqDescription')}
        criticalThinkingPrompt={lang('infrastructure.checklist.oqThinkingPrompt')}
        verdict={oqVerdict}
        reasoning={oqReasoning}
        evidenceNotes=""
        deviationsNoted={oqDeviations}
        riskAccepted={oqRiskAccepted}
        riskRationale={oqRiskRationale}
        onVerdictChange={setOqVerdict}
        onReasoningChange={setOqReasoning}
        onDeviationsChange={setOqDeviations}
        onRiskAcceptedChange={setOqRiskAccepted}
        onRiskRationaleChange={setOqRiskRationale}
        showDeviations
        showRiskAcceptance
        invalidatedByCore={invalidatedByCore}
        invalidatedService={invalidatedService}
      />

      {/* PQ Section */}
      <ValidationRationaleCard
        title={lang('infrastructure.checklist.pqTitle')}
        description={lang('infrastructure.checklist.pqDescription')}
        criticalThinkingPrompt={lang('infrastructure.checklist.pqThinkingPrompt')}
        verdict={pqVerdict}
        reasoning={pqReasoning}
        evidenceNotes={pqEvidence}
        onVerdictChange={setPqVerdict}
        onReasoningChange={setPqReasoning}
        onEvidenceNotesChange={setPqEvidence}
        invalidatedByCore={invalidatedByCore}
        invalidatedService={invalidatedService}
      />

      <Separator />

      {/* Overall Determination */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {lang('infrastructure.checklist.overallDetermination')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <FileText className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              {lang('infrastructure.checklist.overallThinkingPrompt')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{lang('infrastructure.checklist.overallVerdict')} <span className="text-destructive">*</span></Label>
            <Select value={overallVerdict} onValueChange={setOverallVerdict}>
              <SelectTrigger>
                <SelectValue placeholder={lang('infrastructure.checklist.selectOverallDetermination')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="validated">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {lang('infrastructure.checklist.validated')}
                  </span>
                </SelectItem>
                <SelectItem value="validated_with_conditions">
                  <span className="flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-amber-600" />
                    {lang('infrastructure.checklist.validatedWithConditions')}
                  </span>
                </SelectItem>
                <SelectItem value="not_validated">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-destructive" />
                    {lang('infrastructure.checklist.notValidated')}
                  </span>
                </SelectItem>
                <SelectItem value="not_applicable">{lang('infrastructure.checklist.notApplicable')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{lang('infrastructure.checklist.overallRationale')} <span className="text-destructive">*</span></Label>
            <Textarea
              value={overallRationale}
              onChange={(e) => setOverallRationale(e.target.value)}
              placeholder={lang('infrastructure.checklist.overallRationalePlaceholder')}
              rows={3}
              className="resize-none"
            />
          </div>

          {overallVerdict === 'validated_with_conditions' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{lang('infrastructure.checklist.conditions')}</Label>
              <Textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder={lang('infrastructure.checklist.conditionsPlaceholder')}
                rows={2}
                className="resize-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || !allSectionsComplete}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? lang('infrastructure.checklist.saving') : lang('infrastructure.checklist.saveValidationRecord')}
        </Button>
      </div>
    </div>
  );
}

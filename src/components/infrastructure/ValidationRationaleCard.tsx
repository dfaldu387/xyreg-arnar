import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Lightbulb, CheckCircle2, AlertTriangle, XCircle, Clock, MinusCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export type ValidationVerdict =
  | 'acceptable'
  | 'acceptable_with_observations'
  | 'not_acceptable'
  | 'not_applicable'
  | 'deferred';

interface ValidationRationaleCardProps {
  title: string;
  description: string;
  criticalThinkingPrompt: string;
  verdict: ValidationVerdict | '';
  reasoning: string;
  evidenceNotes?: string;
  deviationsNoted?: string;
  riskAccepted?: boolean;
  riskRationale?: string;
  onVerdictChange: (verdict: ValidationVerdict) => void;
  onReasoningChange: (reasoning: string) => void;
  onEvidenceNotesChange?: (notes: string) => void;
  onDeviationsChange?: (deviations: string) => void;
  onRiskAcceptedChange?: (accepted: boolean) => void;
  onRiskRationaleChange?: (rationale: string) => void;
  showDeviations?: boolean;
  showRiskAcceptance?: boolean;
  disabled?: boolean;
  invalidatedByCore?: boolean;
  invalidatedService?: string;
}

const VERDICT_ICONS: Record<ValidationVerdict, { icon: React.ReactNode; color: string }> = {
  acceptable: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600' },
  acceptable_with_observations: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-600' },
  not_acceptable: { icon: <XCircle className="h-4 w-4" />, color: 'text-destructive' },
  not_applicable: { icon: <MinusCircle className="h-4 w-4" />, color: 'text-muted-foreground' },
  deferred: { icon: <Clock className="h-4 w-4" />, color: 'text-blue-600' },
};

const VERDICT_KEYS: ValidationVerdict[] = ['acceptable', 'acceptable_with_observations', 'not_acceptable', 'not_applicable', 'deferred'];

const VERDICT_LABEL_KEYS: Record<ValidationVerdict, string> = {
  acceptable: 'infrastructure.rationaleCard.acceptable',
  acceptable_with_observations: 'infrastructure.rationaleCard.acceptableWithObservations',
  not_acceptable: 'infrastructure.rationaleCard.notAcceptable',
  not_applicable: 'infrastructure.rationaleCard.notApplicable',
  deferred: 'infrastructure.rationaleCard.deferred',
};

export function ValidationRationaleCard({
  title,
  description,
  criticalThinkingPrompt,
  verdict,
  reasoning,
  evidenceNotes = '',
  deviationsNoted = '',
  riskAccepted,
  riskRationale = '',
  onVerdictChange,
  onReasoningChange,
  onEvidenceNotesChange,
  onDeviationsChange,
  onRiskAcceptedChange,
  onRiskRationaleChange,
  showDeviations = false,
  showRiskAcceptance = false,
  disabled = false,
  invalidatedByCore = false,
  invalidatedService,
}: ValidationRationaleCardProps) {
  const { lang } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const verdictMeta = verdict ? VERDICT_ICONS[verdict] : undefined;
  const verdictLabel = verdict ? lang(VERDICT_LABEL_KEYS[verdict]) : undefined;
  const isComplete = verdict !== '' && reasoning.trim().length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`border ${invalidatedByCore ? 'border-destructive/50 bg-destructive/5' : isComplete ? 'border-emerald-200 bg-emerald-50/30' : 'border-border'}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                {invalidatedByCore && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {lang('infrastructure.rationaleCard.invalidatedBy', { service: invalidatedService || '' })}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {verdictMeta && (
                  <Badge variant="outline" className={`text-xs ${verdictMeta.color}`}>
                    {verdictMeta.icon}
                    <span className="ml-1">{verdictLabel}</span>
                  </Badge>
                )}
                {isComplete && !invalidatedByCore && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4 space-y-4">
            {/* Description */}
            <p className="text-sm text-muted-foreground">{description}</p>

            {/* Critical Thinking Prompt */}
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">{criticalThinkingPrompt}</p>
            </div>

            {/* Verdict Selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{lang('infrastructure.rationaleCard.verdict')} <span className="text-destructive">*</span></Label>
              <Select value={verdict} onValueChange={(v) => onVerdictChange(v as ValidationVerdict)} disabled={disabled}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={lang('infrastructure.rationaleCard.selectDetermination')} />
                </SelectTrigger>
                <SelectContent>
                  {VERDICT_KEYS.map(key => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className={VERDICT_ICONS[key].color}>{VERDICT_ICONS[key].icon}</span>
                        {lang(VERDICT_LABEL_KEYS[key])}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reasoning */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{lang('infrastructure.rationaleCard.rationale')} <span className="text-destructive">*</span></Label>
              <Textarea
                value={reasoning}
                onChange={(e) => onReasoningChange(e.target.value)}
                placeholder={lang('infrastructure.rationaleCard.rationalePlaceholder')}
                rows={3}
                disabled={disabled}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {lang('infrastructure.rationaleCard.rationaleHelp')}
              </p>
            </div>

            {/* Deviations (OQ specific) */}
            {showDeviations && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{lang('infrastructure.rationaleCard.deviationsNoted')}</Label>
                <Textarea
                  value={deviationsNoted}
                  onChange={(e) => onDeviationsChange?.(e.target.value)}
                  placeholder={lang('infrastructure.rationaleCard.deviationsPlaceholder')}
                  rows={2}
                  disabled={disabled}
                  className="resize-none"
                />
              </div>
            )}

            {/* Risk Acceptance (OQ specific) */}
            {showRiskAcceptance && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">{lang('infrastructure.rationaleCard.residualRiskAccepted')}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={riskAccepted === true ? 'default' : 'outline'}
                      onClick={() => onRiskAcceptedChange?.(true)}
                      disabled={disabled}
                      className="h-7 text-xs"
                    >
                      {lang('infrastructure.rationaleCard.yes')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={riskAccepted === false ? 'destructive' : 'outline'}
                      onClick={() => onRiskAcceptedChange?.(false)}
                      disabled={disabled}
                      className="h-7 text-xs"
                    >
                      {lang('infrastructure.rationaleCard.no')}
                    </Button>
                  </div>
                </div>
                {riskAccepted !== undefined && (
                  <Textarea
                    value={riskRationale}
                    onChange={(e) => onRiskRationaleChange?.(e.target.value)}
                    placeholder={lang('infrastructure.rationaleCard.riskRationalePlaceholder')}
                    rows={2}
                    disabled={disabled}
                    className="resize-none"
                  />
                )}
              </div>
            )}

            {/* Evidence Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{lang('infrastructure.rationaleCard.evidenceNotes')}</Label>
              <Textarea
                value={evidenceNotes}
                onChange={(e) => onEvidenceNotesChange?.(e.target.value)}
                placeholder={lang('infrastructure.rationaleCard.evidencePlaceholder')}
                rows={2}
                disabled={disabled}
                className="resize-none"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Clock, AlertTriangle, Download, ArrowRight, Shield, Layers, ChevronRight } from 'lucide-react';
import { XYREG_MODULE_GROUPS, type XyregModuleGroup } from '@/data/xyregModuleGroups';
import { CORE_SERVICES } from '@/data/coreModuleDependencies';
import { ModuleGroupChecklist } from './ModuleGroupChecklist';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

interface XyregValidationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ValidationStatus = 'validated' | 'pending' | 'invalidated' | 'not_started';

function getModuleStatus(_groupId: string): ValidationStatus {
  // Mock: in real implementation, query customer_validation_records
  const statuses: ValidationStatus[] = ['validated', 'pending', 'not_started', 'invalidated'];
  // Deterministic mock based on group id hash
  const hash = _groupId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return statuses[hash % statuses.length];
}

function StatusBadge({ status, lang }: { status: ValidationStatus; lang: (key: string, variables?: Record<string, string | number>) => string }) {
  switch (status) {
    case 'validated':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />{lang('infrastructure.validationPanel.statusValidated')}</Badge>;
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Clock className="h-3 w-3 mr-1" />{lang('infrastructure.validationPanel.statusInProgress')}</Badge>;
    case 'invalidated':
      return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="h-3 w-3 mr-1" />{lang('infrastructure.validationPanel.statusRevalidationRequired')}</Badge>;
    case 'not_started':
      return <Badge variant="outline" className="text-muted-foreground">{lang('infrastructure.validationPanel.statusNotStarted')}</Badge>;
  }
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    high: 'bg-red-100 text-red-800 border-red-200',
  };
  return <Badge className={`text-xs ${colors[risk]}`}>{risk}</Badge>;
}

export function XyregValidationPanel({ open, onOpenChange }: XyregValidationPanelProps) {
  const { lang } = useTranslation();
  const [selectedGroup, setSelectedGroup] = useState<XyregModuleGroup | null>(null);

  const currentVersion = 'v2.4.1';
  const validatedCount = XYREG_MODULE_GROUPS.filter(g => getModuleStatus(g.id) === 'validated').length;

  const handleSaveValidation = (data: any) => {
    console.log('Saving validation for', selectedGroup?.id, data);
    toast.success(lang('infrastructure.validationPanel.validationSaved', { name: selectedGroup?.name || '' }));
    setSelectedGroup(null);
  };

  if (selectedGroup) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
          <SheetHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(null)} className="h-7 px-2 text-xs">
                {`\u2190 ${lang('infrastructure.validationPanel.back')}`}
              </Button>
              <SheetTitle className="text-base">{lang('infrastructure.validationPanel.validate', { name: selectedGroup.name })}</SheetTitle>
            </div>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-80px)] px-6 pb-6">
            <ModuleGroupChecklist
              moduleGroup={selectedGroup}
              onSave={handleSaveValidation}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {lang('infrastructure.validationPanel.title')}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)] px-6 pb-6">
          <div className="space-y-6">
            {/* Version & Status Summary */}
            <Card className="border-primary/20">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{lang('infrastructure.validationPanel.currentVersion')}</p>
                    <p className="text-2xl font-bold text-primary">{currentVersion}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{lang('infrastructure.validationPanel.moduleGroupsValidated')}</p>
                    <p className="text-2xl font-bold">
                      {validatedCount}<span className="text-muted-foreground text-lg">/{XYREG_MODULE_GROUPS.length}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Download Kit */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={async () => {
                try {
                  toast.info(lang('infrastructure.validationPanel.generatingKit'));
                  const { generateValidationKit } = await import('@/utils/generateValidationKit');
                  await generateValidationKit();
                  toast.success(lang('infrastructure.validationPanel.kitDownloaded'));
                } catch (err) {
                  console.error('DOCX generation error:', err);
                  toast.error(lang('infrastructure.validationPanel.kitFailed'));
                }
              }}
            >
              <Download className="h-4 w-4" />
              {lang('infrastructure.validationPanel.downloadKit')}
              <Badge variant="secondary" className="ml-auto text-xs">CSV-VP-001</Badge>
            </Button>

            <Separator />

            {/* Core Engine Services */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-muted-foreground" />
                {lang('infrastructure.validationPanel.coreEngineServices')}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {CORE_SERVICES.map(svc => (
                  <div key={svc.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
                    <div className={`h-2 w-2 rounded-full ${svc.criticality === 'high' ? 'bg-red-500' : svc.criticality === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="text-xs font-medium truncate">{svc.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Module Groups Grid */}
            <div>
              <h4 className="text-sm font-semibold mb-3">{lang('infrastructure.validationPanel.moduleGroups')}</h4>
              <div className="space-y-2">
                {XYREG_MODULE_GROUPS.map(group => {
                  const status = getModuleStatus(group.id);
                  return (
                    <Card
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setSelectedGroup(group)}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">{group.name}</span>
                              <RiskBadge risk={group.processRisk} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {group.features.slice(0, 3).map(f => (
                                <Badge key={f} variant="secondary" className="text-[10px] py-0">{f}</Badge>
                              ))}
                              {group.features.length > 3 && (
                                <Badge variant="secondary" className="text-[10px] py-0">+{group.features.length - 3}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <StatusBadge status={status} lang={lang} />
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

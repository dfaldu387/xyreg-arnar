import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DocumentStudioPersistenceService, DocumentStudioData } from '@/services/documentStudioPersistenceService';
import { toast } from 'sonner';
import { Building2, Box, Layers, FileEdit, Loader2, Check, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

type DocScope = 'enterprise' | 'device' | 'phase';

export interface SaveContentAsDocCIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  htmlContent: string;
  templateIdKey: string;
  companyId: string;
  companyName: string;
  productId?: string;
  defaultScope?: DocScope;
}

export function SaveContentAsDocCIDialog({
  open,
  onOpenChange,
  title,
  htmlContent,
  templateIdKey,
  companyId,
  companyName,
  productId,
  defaultScope = 'enterprise',
}: SaveContentAsDocCIDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<DocScope>(defaultScope);
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedStudioId, setSavedStudioId] = useState<string | null>(null);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (scope === 'phase' && companyId) {
      supabase
        .from('company_chosen_phases')
        .select('position, company_phases!inner(id, name)')
        .eq('company_id', companyId)
        .order('position')
        .then(({ data }) => {
          const mapped = (data || []).map((cp: any) => ({
            id: cp.company_phases.id,
            name: cp.company_phases.name,
          }));
          setPhases(mapped);
          if (mapped.length > 0 && !selectedPhaseId) setSelectedPhaseId(mapped[0].id);
        });
    }
  }, [scope, companyId]);

  const handleSave = async () => {
    if (!htmlContent.trim()) {
      toast.error('No content to export');
      return;
    }
    setIsSaving(true);
    try {
      const docScope = scope === 'enterprise' ? 'company' : 'product';
      const scopeProductId = scope !== 'enterprise' ? productId : undefined;

      const sections = [
        {
          id: 'exported-content',
          title,
          content: [{ id: 'content-1', type: 'paragraph', content: htmlContent }],
          order: 0,
        },
      ];

      const existing = await DocumentStudioPersistenceService.loadTemplate(
        companyId, templateIdKey, scopeProductId
      );

      const studioData: DocumentStudioData = {
        ...(existing.data?.id ? { id: existing.data.id } : {}),
        company_id: companyId,
        product_id: scopeProductId,
        template_id: templateIdKey,
        name: title,
        type: 'Technical',
        sections,
        metadata: { source: 'content-export', templateIdKey },
      };

      const saveResult = await DocumentStudioPersistenceService.saveTemplate(studioData);
      if (!saveResult.success || !saveResult.id) {
        throw new Error(saveResult.error || 'Failed to save studio template');
      }

      const syncResult = await DocumentStudioPersistenceService.syncToDocumentCI({
        companyId,
        productId: scopeProductId,
        phaseId: scope === 'phase' ? selectedPhaseId : undefined,
        name: title,
        documentReference: templateIdKey,
        documentScope: docScope === 'company' ? 'company_document' : 'product_document',
      });
      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Failed to create Document CI record');
      }

      setSavedStudioId(saveResult.id);
      setSavedTemplateId(templateIdKey);
      queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
      toast.success('Document CI created successfully');
    } catch (err: any) {
      console.error('Save as Doc CI failed:', err);
      toast.error(`Failed to save: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}
h1{color:#1E3A8A;border-bottom:2px solid #1E3A8A;padding-bottom:8px}h2{color:#374151;margin-top:24px}
ul{margin:4px 0 12px 20px}p{margin:4px 0}
img{max-width:100%;height:auto}
.meta{color:#666;font-size:0.9em;margin-bottom:24px}</style></head>
<body><h1>${title}</h1>
<div class="meta">Generated: ${new Date().toLocaleDateString()}</div>
${htmlContent}</body></html>`;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File downloaded');
  };

  const handleOpenInStudio = () => {
    if (savedTemplateId) {
      const params = new URLSearchParams();
      params.set('templateId', savedTemplateId);
      if (scope !== 'enterprise' && productId) params.set('productId', productId);
      navigate(`/app/company/${encodeURIComponent(companyName)}/document-studio?${params.toString()}`);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setSavedStudioId(null);
    setSavedTemplateId(null);
    setScope(defaultScope);
    setSelectedPhaseId('');
    onOpenChange(false);
  };

  const isSaveDisabled = isSaving || (scope === 'phase' && !selectedPhaseId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Document CI</DialogTitle>
          <DialogDescription>
            Export "{title}" as a Document CI in Document Studio.
          </DialogDescription>
        </DialogHeader>

        {!savedStudioId ? (
          <>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Location of Document CI</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as DocScope)} className="space-y-2">
                <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="enterprise" />
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Enterprise Level</p>
                    <p className="text-xs text-muted-foreground">Company-wide document</p>
                  </div>
                </label>
                {productId && (
                  <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="device" />
                    <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Device Specific (No Phase)</p>
                      <p className="text-xs text-muted-foreground">Linked to this device</p>
                    </div>
                  </label>
                )}
                {productId && (
                  <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="phase" />
                    <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Phase Specific</p>
                      <p className="text-xs text-muted-foreground">Linked to a lifecycle phase</p>
                    </div>
                  </label>
                )}
              </RadioGroup>
            </div>

            {scope === 'phase' && (
              <div className="space-y-2">
                <Label className="text-sm">Select Phase</Label>
                <Select value={selectedPhaseId} onValueChange={setSelectedPhaseId}>
                  <SelectTrigger><SelectValue placeholder="Choose a lifecycle phase..." /></SelectTrigger>
                  <SelectContent>
                    {phases.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaveDisabled}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Document CI
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              Document CI saved successfully
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleDownload} className="h-auto py-4 flex flex-col items-center gap-2">
                <Download className="h-5 w-5" />
                <div className="text-center">
                  <p className="text-sm font-medium">Download</p>
                  <p className="text-xs text-muted-foreground">Save as HTML file</p>
                </div>
              </Button>
              <Button variant="outline" onClick={handleOpenInStudio} className="h-auto py-4 flex flex-col items-center gap-2">
                <FileEdit className="h-5 w-5" />
                <div className="text-center">
                  <p className="text-sm font-medium">Edit in Studio</p>
                  <p className="text-xs text-muted-foreground">Open in Document Studio</p>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

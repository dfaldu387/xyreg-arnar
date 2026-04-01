import React, { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, FlaskConical, CheckCircle2, Info, Upload, X, FileImage, FileVideo, ExternalLink, Sparkles, Loader2, Plus, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UsabilityEngineeringFile, updateUsabilityEngineeringFile } from "@/services/usabilityEngineeringService";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useDropzone } from "react-dropzone";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'fi', label: 'Suomi' },
];
import { StudyCard, UsabilityStudy, createEmptyStudy, parseStudies } from "./StudyCard";

interface EvaluationPlanTabProps {
  uef: UsabilityEngineeringFile;
  productId: string;
  companyId: string;
  disabled?: boolean;
}

interface EvidenceFile {
  name: string;
  path: string;
  type: 'image' | 'video';
  url: string;
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
};

export function EvaluationPlanTab({ uef, productId, companyId, disabled }: EvaluationPlanTabProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formativeStudies, setFormativeStudies] = useState<UsabilityStudy[]>(
    () => parseStudies(uef.formative_plan, 'formative')
  );
  const [summativeStudies, setSummativeStudies] = useState<UsabilityStudy[]>(
    () => parseStudies(uef.summative_plan, 'summative')
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState<'formative' | 'summative' | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const { language: appLanguage } = useLanguage();
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<string>(appLanguage);
  const [evalSourceChecks, setEvalSourceChecks] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  // Fetch evidence files from storage
  const { data: formativeFiles = [], refetch: refetchFormative } = useQuery({
    queryKey: ['usability-evidence', productId, 'formative'],
    queryFn: async () => {
      const folder = `${productId}/formative`;
      const { data, error } = await supabase.storage.from('usability-evidence').list(folder);
      if (error) return [];
      return (data || []).map(f => ({
        name: f.name,
        path: `${folder}/${f.name}`,
        type: f.name.match(/\.(mp4|mov)$/i) ? 'video' as const : 'image' as const,
        url: supabase.storage.from('usability-evidence').getPublicUrl(`${folder}/${f.name}`).data.publicUrl,
      }));
    },
  });

  const { data: summativeFiles = [], refetch: refetchSummative } = useQuery({
    queryKey: ['usability-evidence', productId, 'summative'],
    queryFn: async () => {
      const folder = `${productId}/summative`;
      const { data, error } = await supabase.storage.from('usability-evidence').list(folder);
      if (error) return [];
      return (data || []).map(f => ({
        name: f.name,
        path: `${folder}/${f.name}`,
        type: f.name.match(/\.(mp4|mov)$/i) ? 'video' as const : 'image' as const,
        url: supabase.storage.from('usability-evidence').getPublicUrl(`${folder}/${f.name}`).data.publicUrl,
      }));
    },
  });

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    try {
      const { data: hazards } = await supabase
        .from('hazards')
        .select('hazard_id, description, hazardous_situation, potential_harm, initial_severity, risk_control_measure')
        .eq('product_id', productId)
        .or('hazard_id.ilike.HAZ-USE%,category.eq.human_factors');

      const { data: product } = await supabase
        .from('products')
        .select('name, class, intended_use')
        .eq('id', productId)
        .single();

      const { data: result, error } = await supabase.functions.invoke('ai-evaluation-plan-generator', {
        body: {
          companyId,
          productData: {
            product_name: product?.name,
            device_class: product?.class,
            intended_purpose: product?.intended_use,
          },
          hazards: hazards || [],
          uiCharacteristics: uef.ui_characteristics,
          intendedUsers: uef.intended_users,
          useEnvironments: uef.use_environments,
        },
      });

      if (error) throw error;

      if (result?.success && result?.plan) {
        // AI returns structured study arrays
        const mapStudy = (s: any, section: 'formative' | 'summative'): UsabilityStudy => ({
          id: `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: s.name || '',
          study_type: s.study_type || 'other',
          objective: s.objective || '',
          method: s.method || '',
          participants: s.participants || '',
          tasks: s.tasks || '',
          acceptance_criteria: s.acceptance_criteria || '',
          status: 'draft',
        });
        const fStudies = (result.plan.formative_studies || []).map((s: any) => mapStudy(s, 'formative'));
        const sStudies = (result.plan.summative_studies || []).map((s: any) => mapStudy(s, 'summative'));
        if (fStudies.length) setFormativeStudies(prev => [...prev, ...fStudies]);
        if (sStudies.length) setSummativeStudies(prev => [...prev, ...sStudies]);
        toast.success(`Added ${fStudies.length + sStudies.length} AI-suggested studies. Review and save when ready.`);
      } else {
        throw new Error(result?.error || 'Failed to generate plans');
      }
    } catch (error: any) {
      console.error('AI generation error:', error);
      if (error?.message?.includes('429') || error?.status === 429) {
        toast.error('Rate limit exceeded. Please try again in a moment.');
      } else if (error?.message?.includes('402') || error?.status === 402) {
        toast.error('AI credits exhausted. Please add credits to continue.');
      } else {
        toast.error(error?.message || 'Failed to generate evaluation plans');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUsabilityEngineeringFile(uef.id, {
        formative_plan: JSON.stringify(formativeStudies),
        summative_plan: JSON.stringify(summativeStudies),
      });
      queryClient.invalidateQueries({ queryKey: ['usability-engineering-file', productId] });
      toast.success('Evaluation Plan saved');
    } catch (error) {
      toast.error('Failed to save Evaluation Plan');
    } finally {
      setIsSaving(false);
    }
  };

  // Study CRUD helpers
  const updateFormativeStudy = (idx: number, updated: UsabilityStudy) => {
    setFormativeStudies(prev => prev.map((s, i) => i === idx ? updated : s));
  };
  const deleteFormativeStudy = (idx: number) => {
    setFormativeStudies(prev => prev.filter((_, i) => i !== idx));
  };
  const updateSummativeStudy = (idx: number, updated: UsabilityStudy) => {
    setSummativeStudies(prev => prev.map((s, i) => i === idx ? updated : s));
  };
  const deleteSummativeStudy = (idx: number) => {
    setSummativeStudies(prev => prev.filter((_, i) => i !== idx));
  };

  // File upload/delete
  const handleUpload = async (files: File[], section: 'formative' | 'summative') => {
    setIsUploading(section);
    try {
      for (const file of files) {
        const filePath = `${productId}/${section}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('usability-evidence').upload(filePath, file);
        if (error) throw error;
      }
      if (section === 'formative') refetchFormative();
      else refetchSummative();
      toast.success(`${files.length} file(s) uploaded`);
    } catch (error) {
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(null);
    }
  };

  const handleDeleteFile = async (path: string, section: 'formative' | 'summative') => {
    const { error } = await supabase.storage.from('usability-evidence').remove([path]);
    if (error) { toast.error('Failed to delete file'); return; }
    if (section === 'formative') refetchFormative();
    else refetchSummative();
    toast.success('File removed');
  };

  const EvidenceDropzone = ({ section }: { section: 'formative' | 'summative' }) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
      handleUpload(acceptedFiles, section);
    }, [section]);
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: ACCEPTED_TYPES,
      disabled: disabled || isUploading === section,
    });
    return (
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isUploading === section ? 'Uploading...' : 'Drop images or videos here, or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP, MP4, MOV</p>
      </div>
    );
  };

  const FileList = ({ files, section }: { files: EvidenceFile[]; section: 'formative' | 'summative' }) => {
    if (files.length === 0) return null;
    return (
      <div className="space-y-2 mt-4">
        <p className="text-sm font-medium">Attachments ({files.length})</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {files.map((file) => (
            <div key={file.path} className="relative group border rounded-lg overflow-hidden">
              {file.type === 'image' ? (
                <img src={file.url} alt={file.name} className="w-full h-24 object-cover" />
              ) : (
                <div className="w-full h-24 bg-muted flex items-center justify-center">
                  <FileVideo className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="p-1.5 text-xs truncate text-muted-foreground flex items-center gap-1">
                {file.type === 'image' ? <FileImage className="h-3 w-3 flex-shrink-0" /> : <FileVideo className="h-3 w-3 flex-shrink-0" />}
                <span className="truncate">{file.name}</span>
              </div>
              {!disabled && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteFile(file.path, section)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const navigateToVV = (testLevel: 'formative' | 'summative') => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'verification-validation');
    newParams.set('subTab', 'test-cases');
    newParams.set('createTest', 'true');
    newParams.set('testType', 'validation');
    newParams.set('testLevel', testLevel);
    newParams.set('fromUE', 'true');
    navigate(`?${newParams.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Usability Evaluation Plan</h3>
          <p className="text-sm text-muted-foreground">
            IEC 62366-1 Clause 5.5 — Define multiple formative & summative studies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAIDialog(true)} disabled={disabled || isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isGenerating ? 'Generating...' : 'AI Suggestions'}
          </Button>
          <Button onClick={handleSave} disabled={disabled || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Add individual studies for each evaluation round. Attach evidence photos/videos per section.
          Test cases are created and executed in the Verification &amp; Validation module.
        </AlertDescription>
      </Alert>

      {/* Formative Studies */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <FlaskConical className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Formative Studies
                  <Badge variant="outline" className="font-normal">Clause 5.7</Badge>
                  <Badge variant="secondary" className="font-normal">{formativeStudies.length}</Badge>
                </CardTitle>
                <CardDescription>Iterative evaluations during design to identify usability issues</CardDescription>
              </div>
            </div>
            {!disabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormativeStudies(prev => [...prev, createEmptyStudy('formative')])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Study
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {formativeStudies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No formative studies yet. Add one or generate with AI.
            </p>
          )}
          {formativeStudies.map((study, idx) => (
            <StudyCard
              key={study.id}
              study={study}
              section="formative"
              onChange={(updated) => updateFormativeStudy(idx, updated)}
              onDelete={() => deleteFormativeStudy(idx)}
              disabled={disabled}
              defaultOpen={!study.name}
            />
          ))}

          {/* Evidence */}
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium">Evidence & Attachments</p>
            <EvidenceDropzone section="formative" />
            <FileList files={formativeFiles} section="formative" />
          </div>

          <Button variant="outline" size="sm" className="w-full" disabled={disabled} onClick={() => navigateToVV('formative')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Generate Formative Test in V&V
          </Button>
        </CardContent>
      </Card>

      {/* Summative Studies */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Summative Studies
                  <Badge variant="outline" className="font-normal">Clause 5.9</Badge>
                  <Badge variant="secondary" className="font-normal">{summativeStudies.length}</Badge>
                </CardTitle>
                <CardDescription>Final validation confirming the design meets usability requirements</CardDescription>
              </div>
            </div>
            {!disabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSummativeStudies(prev => [...prev, createEmptyStudy('summative')])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Study
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {summativeStudies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No summative studies yet. Add one or generate with AI.
            </p>
          )}
          {summativeStudies.map((study, idx) => (
            <StudyCard
              key={study.id}
              study={study}
              section="summative"
              onChange={(updated) => updateSummativeStudy(idx, updated)}
              onDelete={() => deleteSummativeStudy(idx)}
              disabled={disabled}
              defaultOpen={!study.name}
            />
          ))}

          {/* Evidence */}
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium">Evidence & Attachments</p>
            <EvidenceDropzone section="summative" />
            <FileList files={summativeFiles} section="summative" />
          </div>

          <Button variant="outline" size="sm" className="w-full" disabled={disabled} onClick={() => navigateToVV('summative')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Generate Summative Test in V&V
          </Button>
        </CardContent>
      </Card>

      {/* AI Suggestions Confirmation Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Evaluation Plan Suggestions
            </DialogTitle>
            <DialogDescription>
              Generate formative and summative study drafts using AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Context sources</h4>
              <div className="divide-y divide-border rounded-md border bg-muted/20">
                {['Product definition (name, class, intended use)',
                  'Usability hazards (human-factors related)',
                  'UI Characteristics (features & safety relevance)',
                  'Intended users & use environments'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Checkbox
                      checked={evalSourceChecks.has(i)}
                      onCheckedChange={() => {
                        const next = new Set(evalSourceChecks);
                        next.has(i) ? next.delete(i) : next.add(i);
                        setEvalSourceChecks(next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Output language
              </Label>
              <Select value={outputLanguage} onValueChange={setOutputLanguage}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Additional instructions (optional)</Label>
              <Textarea
                placeholder="Add specific instructions for the AI generation..."
                className="min-h-[60px] text-sm resize-y"
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowAIDialog(false);
                handleGenerateWithAI();
              }}
              disabled={isGenerating}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Suggestions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

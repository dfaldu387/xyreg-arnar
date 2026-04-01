import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UsabilityStudy {
  id: string;
  name: string;
  study_type: string;
  objective: string;
  method: string;
  participants: string;
  tasks: string;
  acceptance_criteria: string;
  status: 'draft' | 'planned' | 'in_progress' | 'completed';
}

const FORMATIVE_STUDY_TYPES = [
  { value: 'heuristic_evaluation', label: 'Heuristic Evaluation' },
  { value: 'cognitive_walkthrough', label: 'Cognitive Walkthrough' },
  { value: 'expert_review', label: 'Expert Review' },
  { value: 'early_prototype_test', label: 'Early Prototype User Test' },
  { value: 'functional_prototype_test', label: 'Functional Prototype User Test' },
  { value: 'think_aloud', label: 'Think-Aloud Study' },
  { value: 'contextual_inquiry', label: 'Contextual Inquiry' },
  { value: 'other', label: 'Other' },
];

const SUMMATIVE_STUDY_TYPES = [
  { value: 'simulated_use', label: 'Simulated Use Study' },
  { value: 'clinical_use', label: 'Clinical Use Study' },
  { value: 'comparative_usability', label: 'Comparative Usability Study' },
  { value: 'knowledge_task_analysis', label: 'Knowledge & Task Analysis' },
  { value: 'use_error_validation', label: 'Use Error Validation' },
  { value: 'labeling_comprehension', label: 'Labeling Comprehension Study' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  planned: 'bg-blue-100 text-blue-800 border-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
};

interface StudyCardProps {
  study: UsabilityStudy;
  section: 'formative' | 'summative';
  onChange: (updated: UsabilityStudy) => void;
  onDelete: () => void;
  disabled?: boolean;
  defaultOpen?: boolean;
}

export function StudyCard({ study, section, onChange, onDelete, disabled, defaultOpen = false }: StudyCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const studyTypes = section === 'formative' ? FORMATIVE_STUDY_TYPES : SUMMATIVE_STUDY_TYPES;
  const typeLabel = studyTypes.find(t => t.value === study.study_type)?.label || study.study_type;

  const update = (field: keyof UsabilityStudy, value: string) => {
    onChange({ ...study, [field]: value });
  };

  return (
    <Card className="border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{study.name || 'Untitled Study'}</span>
                <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[study.status])}>
                  {study.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Study Name</label>
                <Input
                  value={study.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g., Round 1 Prototype User Test"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Study Type</label>
                <Select value={study.study_type} onValueChange={(v) => update('study_type', v)} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {studyTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={study.status} onValueChange={(v) => update('status', v as UsabilityStudy['status'])} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Objective</label>
              <Textarea
                value={study.objective}
                onChange={(e) => update('objective', e.target.value)}
                placeholder="What usability questions will this study answer?"
                className="min-h-[80px]"
                disabled={disabled}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Method</label>
              <Textarea
                value={study.method}
                onChange={(e) => update('method', e.target.value)}
                placeholder="Describe the evaluation method, protocol, and setup..."
                className="min-h-[80px]"
                disabled={disabled}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Participants</label>
                <Textarea
                  value={study.participants}
                  onChange={(e) => update('participants', e.target.value)}
                  placeholder="Number, profiles, recruitment criteria..."
                  className="min-h-[80px]"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tasks</label>
                <Textarea
                  value={study.tasks}
                  onChange={(e) => update('tasks', e.target.value)}
                  placeholder="Critical tasks and use scenarios to evaluate..."
                  className="min-h-[80px]"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Acceptance Criteria</label>
              <Textarea
                value={study.acceptance_criteria}
                onChange={(e) => update('acceptance_criteria', e.target.value)}
                placeholder="Pass/fail criteria, success metrics..."
                className="min-h-[80px]"
                disabled={disabled}
              />
            </div>

            {!disabled && (
              <div className="flex justify-end pt-2">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove Study
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function createEmptyStudy(section: 'formative' | 'summative'): UsabilityStudy {
  return {
    id: crypto.randomUUID(),
    name: '',
    study_type: section === 'formative' ? 'heuristic_evaluation' : 'simulated_use',
    objective: '',
    method: '',
    participants: '',
    tasks: '',
    acceptance_criteria: '',
    status: 'draft',
  };
}

/**
 * Parse existing text-based plan into a single legacy study, or parse JSON array.
 */
export function parseStudies(raw: string | null, section: 'formative' | 'summative'): UsabilityStudy[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Legacy text content - wrap in a single study
    if (raw.trim()) {
      return [{
        id: crypto.randomUUID(),
        name: section === 'formative' ? 'Formative Evaluation (Legacy)' : 'Summative Evaluation (Legacy)',
        study_type: section === 'formative' ? 'other' : 'simulated_use',
        objective: raw,
        method: '',
        participants: '',
        tasks: '',
        acceptance_criteria: '',
        status: 'draft',
      }];
    }
  }
  return [];
}

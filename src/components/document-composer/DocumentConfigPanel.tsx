import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, X, Tag as TagIcon, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';
import { useReviewerGroups } from '@/hooks/useReviewerGroups';
import { useExistingTags } from '@/hooks/useExistingTags';
import { MultiAuthorSelector } from '@/components/common/MultiAuthorSelector';
import { SectionSelector } from '@/components/common/SectionSelector';
import { ReferenceDocumentPicker } from '@/components/common/ReferenceDocumentPicker';
import { AddDocumentTypeSheet } from '@/components/common/AddDocumentTypeSheet';
import { cn } from '@/lib/utils';

interface DocumentConfigPanelProps {
  documentId?: string | null;
  companyId?: string;
  className?: string;
}

interface DocRow {
  id: string;
  document_type?: string | null;
  description?: string | null;
  brief_summary?: string | null;
  sub_section?: string | null;
  section_ids?: string[] | null;
  date?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  authors_ids?: string[] | null;
  tags?: string[] | null;
  reviewer_group_ids?: string[] | null;
  reference_document_ids?: string[] | null;
  status?: string | null;
  is_record?: boolean | null;
}

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'In Review', 'Approved', 'Rejected'];

export function DocumentConfigPanel({ documentId, companyId, className }: DocumentConfigPanelProps) {
  const [row, setRow] = useState<DocRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);

  const { documentTypes, refetch: refetchTypes } = useDocumentTypes(companyId);
  const { reviewerGroups } = useReviewerGroups(companyId);
  const { data: existingTags = [] } = useExistingTags(companyId);

  // Load the document row
  const loadRow = useCallback(async () => {
    if (!documentId || !companyId) {
      setRow(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('phase_assigned_document_template')
        .select('*')
        .eq('id', documentId)
        .maybeSingle();
      if (error) throw error;
      if (data) setRow(data as any);
      else setRow(null);
    } catch (err) {
      console.error('[DocumentConfigPanel] load failed', err);
    } finally {
      setLoading(false);
    }
  }, [documentId, companyId]);

  useEffect(() => {
    loadRow();
  }, [loadRow]);

  const updateField = async (field: keyof DocRow, value: any, label?: string) => {
    if (!documentId) return;
    setSavingField(field);
    try {
      const { error } = await supabase
        .from('phase_assigned_document_template')
        .update({ [field]: value, updated_at: new Date().toISOString() } as any)
        .eq('id', documentId);
      if (error) throw error;
      setRow((prev) => (prev ? { ...prev, [field]: value } : prev));
      toast.success(`${label ?? String(field)} updated`);
    } catch (err: any) {
      console.error('[DocumentConfigPanel] update failed', err);
      toast.error(`Failed to update ${label ?? String(field)}`);
    } finally {
      setSavingField(null);
    }
  };

  const handleAddTag = async (raw: string) => {
    const t = raw.trim();
    if (!t || !row) return;
    const next = Array.from(new Set([...(row.tags || []), t]));
    setTagInput('');
    await updateField('tags', next, 'Tags');
  };

  const handleRemoveTag = async (t: string) => {
    if (!row) return;
    const next = (row.tags || []).filter((x) => x !== t);
    await updateField('tags', next, 'Tags');
  };

  if (!documentId) {
    return (
      <div className={cn('bg-background flex flex-col w-[320px] border-r shrink-0', className)}>
        <div className="px-3 py-2 border-b text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span>Configure</span>
        </div>
        <div className="p-4 text-xs text-muted-foreground">
          Save the draft once to enable inline configuration.
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-background flex flex-col w-[320px] border-r shrink-0', className)}>
      <div className="px-3 py-2 border-b text-sm font-medium text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span>Configure</span>
        </div>
        {savingField && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {loading || !row ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading metadata…
            </div>
          ) : (
            <>
              {/* Type */}
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <div className="flex gap-1">
                  <Select
                    value={row.document_type || ''}
                    onValueChange={(v) => updateField('document_type', v, 'Type')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setAddTypeOpen(true)}
                    title="Add type"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={row.status || 'Not Started'}
                  onValueChange={(v) => updateField('status', v, 'Status')}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <TagIcon className="w-3 h-3" /> Tags
                </Label>
                <div className="flex flex-wrap gap-1">
                  {(row.tags || []).map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {t}
                      <button onClick={() => handleRemoveTag(t)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(tagInput);
                    }
                  }}
                  onBlur={() => tagInput && handleAddTag(tagInput)}
                  placeholder="Add tag + Enter"
                  className="h-7 text-xs"
                  list="config-existing-tags"
                />
                <datalist id="config-existing-tags">
                  {existingTags.filter((t) => !(row.tags || []).includes(t)).map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={row.date || ''}
                    onChange={(e) => setRow((p) => p ? { ...p, date: e.target.value } : p)}
                    onBlur={(e) => updateField('date', e.target.value || null, 'Date')}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Due</Label>
                  <Input
                    type="date"
                    value={row.due_date || ''}
                    onChange={(e) => setRow((p) => p ? { ...p, due_date: e.target.value } : p)}
                    onBlur={(e) => updateField('due_date', e.target.value || null, 'Due date')}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={row.start_date || ''}
                    onChange={(e) => setRow((p) => p ? { ...p, start_date: e.target.value } : p)}
                    onBlur={(e) => updateField('start_date', e.target.value || null, 'Start date')}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Authors */}
              {companyId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Authors</Label>
                  <MultiAuthorSelector
                    value={row.authors_ids || []}
                    onChange={(ids) => updateField('authors_ids', ids.length ? ids : null, 'Authors')}
                    companyId={companyId}
                    deferCreation={false}
                    label=""
                    placeholder="Add authors"
                  />
                </div>
              )}

              {/* Reviewer Groups */}
              <div className="space-y-1.5">
                <Label className="text-xs">Reviewer groups</Label>
                <div className="space-y-1 max-h-40 overflow-auto rounded-md border p-2">
                  {reviewerGroups.length === 0 && (
                    <div className="text-[11px] text-muted-foreground">No groups configured.</div>
                  )}
                  {reviewerGroups.map((g: any) => {
                    const checked = (row.reviewer_group_ids || []).includes(g.id);
                    return (
                      <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const cur = row.reviewer_group_ids || [];
                            const next = v ? [...cur, g.id] : cur.filter((x) => x !== g.id);
                            updateField('reviewer_group_ids', next.length ? next : null, 'Reviewer groups');
                          }}
                        />
                        <span className="truncate">{g.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Section / sub-section */}
              {companyId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sub-section</Label>
                  <SectionSelector
                    value={row.sub_section || ''}
                    onChange={(name, sectionId) => {
                      // Update both fields together
                      setSavingField('sub_section');
                      supabase
                        .from('phase_assigned_document_template')
                        .update({
                          sub_section: name || null,
                          section_ids: sectionId ? [sectionId] : null,
                          updated_at: new Date().toISOString(),
                        } as any)
                        .eq('id', documentId)
                        .then(({ error }) => {
                          if (error) {
                            toast.error('Failed to update sub-section');
                          } else {
                            setRow((p) => p ? { ...p, sub_section: name, section_ids: sectionId ? [sectionId] : null } : p);
                            toast.success('Sub-section updated');
                          }
                          setSavingField(null);
                        });
                    }}
                    companyId={companyId}
                    label=""
                    compact
                  />
                </div>
              )}

              {/* References */}
              <div className="space-y-1.5">
                <Label className="text-xs">Reference documents</Label>
                <div className="text-[11px] text-muted-foreground">
                  {(row.reference_document_ids || []).length} linked
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => setRefPickerOpen(true)}
                >
                  Manage references
                </Button>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={row.description || ''}
                  onChange={(e) => setRow((p) => p ? { ...p, description: e.target.value } : p)}
                  onBlur={(e) => updateField('description', e.target.value || null, 'Description')}
                  rows={3}
                  className="text-xs resize-none"
                  placeholder="Brief description"
                />
              </div>

              {/* Is record */}
              <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                <Checkbox
                  checked={!!row.is_record}
                  onCheckedChange={(v) => updateField('is_record', !!v, 'Record flag')}
                />
                <span>Is a Record (vs Document)</span>
              </label>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Reference picker */}
      {companyId && (
        <ReferenceDocumentPicker
          open={refPickerOpen}
          onOpenChange={setRefPickerOpen}
          companyId={companyId}
          selectedIds={row?.reference_document_ids || []}
          onConfirm={(ids) => {
            updateField('reference_document_ids', ids.length ? ids : null, 'References');
            setRefPickerOpen(false);
          }}
        />
      )}

      {/* Add type sheet */}
      {companyId && (
        <AddDocumentTypeSheet
          open={addTypeOpen}
          onOpenChange={setAddTypeOpen}
          companyId={companyId}
          onDocumentTypeAdded={(name) => {
            refetchTypes();
            updateField('document_type', name, 'Type');
            setAddTypeOpen(false);
          }}
          onDocumentTypeDeleted={() => refetchTypes()}
        />
      )}
    </div>
  );
}
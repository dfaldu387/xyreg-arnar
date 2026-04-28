import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createReferenceDocument,
  REFERENCE_PREFIX_TO_TYPE,
} from '@/services/createReferenceDocument';

interface CreateReferenceDocDialogProps {
  open: boolean;
  companyId?: string;
  initialRefCode: string;
  initialTitle?: string;
  onClose: () => void;
  onCreated?: (result: { id: string; name: string; refCode: string }) => void;
}

/**
 * Compact "create the missing reference doc on the spot" dialog. Triggered
 * from the pencil-plus icon on an unresolved reference chip inside the
 * document editor (e.g. an unresolved "SOP-008" mention in a References
 * section).
 */
export function CreateReferenceDocDialog({
  open,
  companyId,
  initialRefCode,
  initialTitle,
  onClose,
  onCreated,
}: CreateReferenceDocDialogProps) {
  const [refCode, setRefCode] = useState(initialRefCode);
  const [title, setTitle] = useState(initialTitle || '');
  const [docType, setDocType] = useState<string>('');
  const [openAfter, setOpenAfter] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset form when reopening for a different reference.
  useEffect(() => {
    if (!open) return;
    setRefCode(initialRefCode);
    setTitle(initialTitle || '');
    const prefix = (initialRefCode.split('-')[0] || '').toUpperCase();
    setDocType(REFERENCE_PREFIX_TO_TYPE[prefix] || 'Document');
    setOpenAfter(false);
    setBusy(false);
  }, [open, initialRefCode, initialTitle]);

  const handleCreate = async () => {
    if (!companyId) {
      toast.error('No active company — cannot create document.');
      return;
    }
    const trimmedRef = refCode.trim();
    if (!trimmedRef) {
      toast.error('Reference code is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await createReferenceDocument(companyId, {
        refCode: trimmedRef,
        title: title.trim(),
        documentType: docType.trim() || undefined,
      });
      toast.success(`Created ${created.name}`);
      onCreated?.({ id: created.id, name: created.name, refCode: trimmedRef });
      onClose();
      if (openAfter) {
        // Defer to next tick so the dialog can close cleanly first.
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('xyreg:open-document', {
              detail: { docId: created.id, name: created.name },
            }),
          );
        }, 50);
      }
    } catch (err) {
      console.error('[CreateReferenceDocDialog] create failed', err);
      toast.error('Failed to create document. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="w-4 h-4 text-amber-600" />
            Create reference document
          </DialogTitle>
          <DialogDescription>
            This reference is not yet in your document registry. Create a draft
            so it can be linked, edited, and reviewed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ref-code" className="text-xs">Reference code</Label>
              <Input
                id="ref-code"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                placeholder="SOP-008"
                className="font-mono text-sm"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-type" className="text-xs">Type</Label>
              <Input
                id="doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="SOP"
                className="text-sm"
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-title" className="text-xs">Title</Label>
            <Input
              id="ref-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document Control"
              className="text-sm"
              disabled={busy}
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={openAfter}
              onCheckedChange={(v) => setOpenAfter(Boolean(v))}
              disabled={busy}
            />
            Open the new draft after creating
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy || !refCode.trim()}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FilePlus2 className="w-4 h-4 mr-1.5" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
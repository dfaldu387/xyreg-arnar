import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReAuthContent } from './ReAuthContent';
import type { AuthMethod } from '../lib/esign.types';

interface ReAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onAuthenticated: (authMethod: AuthMethod) => void;
  // Optional doc/company context for audit logging of failed attempts (AL-08).
  documentId?: string;
  documentName?: string;
  companyId?: string | null;
}

export function ReAuthDialog({ open, onOpenChange, email, onAuthenticated, documentId, documentName, companyId }: ReAuthDialogProps) {
  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleAuthenticated = (method: AuthMethod) => {
    onOpenChange(false);
    onAuthenticated(method);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); else onOpenChange(true); }}>
      <DialogContent className="max-w-md z-[10000]">
        <ReAuthContent
          email={email}
          onAuthenticated={handleAuthenticated}
          active={open}
          documentId={documentId}
          documentName={documentName}
          companyId={companyId}
        />
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

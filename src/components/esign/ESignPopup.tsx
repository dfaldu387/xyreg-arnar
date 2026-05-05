import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PenTool } from 'lucide-react';
import { AssignSigners } from './steps/AssignSigners';
import { SigningCeremony } from './steps/SigningCeremony';
import { SignatureComplete } from './steps/SignatureComplete';
import { SignatureStatusBadge } from './components/SignatureStatusBadge';
import { ESignService } from './lib/esign.service';
import type { ESignPopupProps, ESignRequest, ESignRecord, AuthMethod } from './lib/esign.types';
import { useAuth } from '@/context/AuthContext';

export function ESignPopup({ open, onOpenChange, documentId, documentName, onClose, onComplete, selfSigner }: ESignPopupProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [signRequest, setSignRequest] = useState<ESignRequest | null>(null);
  const [signatureRecord, setSignatureRecord] = useState<ESignRecord | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const { user } = useAuth();

  // Reset state when dialog opens so it always starts at step 0
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setSignRequest(null);
      setSignatureRecord(null);
      setAuthMethod(null);
      setBootstrapError(null);
      bootstrapInFlightRef.current = false;
    }
  }, [open]);

  // Self-sign flow: when selfSigner is provided, auto-create a single-signer
  // request and jump straight to the signing ceremony (skip Add Signers).
  useEffect(() => {
    if (!open || !selfSigner) return;
    if (signRequest || bootstrapInFlightRef.current) return;
    bootstrapInFlightRef.current = true;
    let cancelled = false;
    (async () => {
      setBootstrapError(null);
      try {
        const documentHash = await ESignService.computeDocumentHash(documentId);
        const request = await ESignService.createSignRequest(
          documentId,
          documentHash,
          selfSigner.userId,
          'parallel',
          [{
            userId: selfSigner.userId,
            displayName: selfSigner.displayName,
            meaning: selfSigner.meaning,
            orderIndex: 0,
          }],
        );
        if (cancelled) return;
        if (request) {
          setSignRequest(request);
          setCurrentStep(1);
        } else {
          setBootstrapError('Failed to start signing session. Please try again.');
        }
      } catch (e) {
        if (cancelled) return;
        console.error('[ESignPopup] self-sign bootstrap failed', e);
        setBootstrapError('An error occurred while preparing the signature. Please try again.');
      } finally {
        bootstrapInFlightRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [open, selfSigner, documentId, signRequest]);

  const handleClose = () => {
    setCurrentStep(0);
    setSignRequest(null);
    setSignatureRecord(null);
    setAuthMethod(null);
    bootstrapInFlightRef.current = false;
    onOpenChange(false);
    onClose?.();
  };

  const handleSignersAssigned = (request: ESignRequest) => {
    setSignRequest(request);
    setCurrentStep(1);
  };

  const handleSigned = (record: ESignRecord, method: AuthMethod) => {
    setSignatureRecord(record);
    setAuthMethod(method);
    setCurrentStep(2);
    if (signRequest) {
      onComplete?.(signRequest);
    }
  };

  const signedCount = signRequest?.signers.filter(s => s.status === 'signed').length ?? 0;
  const totalCount = signRequest?.signers.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5 text-primary" />
              E-Signature — {documentName}
            </DialogTitle>
            <SignatureStatusBadge
              status={signRequest?.status ?? (currentStep === 0 ? 'pending' : currentStep === 1 ? 'in_progress' : 'completed')}
              signedCount={signedCount}
              totalCount={totalCount}
            />
          </div>
        </DialogHeader>

        {/* Step Content */}
        <div className="mt-4">
          {currentStep === 0 && selfSigner && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {bootstrapError ? (
                <span className="text-destructive">{bootstrapError}</span>
              ) : (
                'Preparing your signature…'
              )}
            </div>
          )}
          {currentStep === 0 && !selfSigner && (
            <AssignSigners
              documentId={documentId}
              onSubmit={handleSignersAssigned}
            />
          )}
          {currentStep === 1 && (
            <SigningCeremony
              documentName={documentName}
              documentId={documentId}
              signRequest={signRequest}
              onSigned={handleSigned}
              onBack={() => (selfSigner ? handleClose() : setCurrentStep(0))}
            />
          )}
          {currentStep === 2 && (
            <SignatureComplete
              documentId={documentId}
              documentName={documentName}
              signatureRecord={signatureRecord}
              authMethod={authMethod}
              onClose={handleClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

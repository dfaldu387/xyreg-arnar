import React, { useState, useRef, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, BookOpen, ArrowLeft, Upload, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DocumentTemplate } from '@/types/documentComposer';
import { convertDocxToHtml } from '@/utils/docxToSections';

interface AIAutoFillFromDocxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DocumentTemplate;
  companyId?: string;
  productId?: string;
  onContentUpdate: (contentId: string, newContent: string) => void;
  onBack?: () => void;
}

// Hard ceiling on the docx the user can upload. mammoth handles much larger
// files but anything above this is almost certainly a wrong-file mistake.
const MAX_DOCX_BYTES = 15 * 1024 * 1024; // 15MB

export function AIAutoFillFromDocxDialog({
  open,
  onOpenChange,
  template,
  onContentUpdate,
  onBack,
}: AIAutoFillFromDocxDialogProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [extractionState, setExtractionState] = useState<'idle' | 'extracting' | 'ready' | 'error'>('idle');
  const [isApplying, setIsApplying] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoPickTriggeredRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset state when (re)opened, then auto-open the OS file picker once.
  useEffect(() => {
    if (open) {
      setUploadedFile(null);
      setHtmlContent('');
      setExtractionState('idle');
      setIsApplying(false);
      autoPickTriggeredRef.current = false;
      const t = setTimeout(() => {
        if (!autoPickTriggeredRef.current) {
          autoPickTriggeredRef.current = true;
          fileInputRef.current?.click();
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleFileChosen = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext !== 'docx' && ext !== 'doc') {
      toast.error('Only .doc / .docx files can be uploaded.');
      return;
    }
    if (file.size > MAX_DOCX_BYTES) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The max supported size is ${(MAX_DOCX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      );
      return;
    }
    setUploadedFile(file);
    setExtractionState('extracting');
    try {
      const html = await convertDocxToHtml(file);
      if (!isMountedRef.current) return;
      if (!html.trim()) {
        setHtmlContent('');
        setExtractionState('error');
        toast.error('Could not read any content from this file.');
        return;
      }
      setHtmlContent(html);
      setExtractionState('ready');
    } catch (err) {
      console.error('Failed to read uploaded .docx:', err);
      if (!isMountedRef.current) return;
      setHtmlContent('');
      setExtractionState('error');
      toast.error('Could not read the uploaded file.');
    }
  };

  const handleReplaceFile = () => {
    if (isApplying) return;
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isApplying) return;
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isApplying) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChosen(file);
  };

  // Paste the ENTIRE uploaded document into the draft — no heading-based
  // filtering. All content from the .docx lands in the first section's
  // first writable content block so nothing is dropped because a heading
  // didn't match. Sent via the 'full-document-content' sentinel — same
  // protocol Copy-from-SOP and unified-editor sync already use
  // (DocumentComposer.tsx:878 / DocumentDraftDrawer.tsx:1249).
  const handleUpdate = () => {
    if (extractionState !== 'ready' || !htmlContent.trim()) {
      toast.error('Please upload a .docx file first.');
      return;
    }
    const targetSections = template?.sections || [];
    if (targetSections.length === 0) {
      toast.error('This draft has no sections to update.');
      return;
    }

    setIsApplying(true);
    try {
      const stamp = Date.now();
      const newSections = targetSections.map((section, idx) => {
        if (idx !== 0) return section;
        const existing = section.content || [];
        const target = existing.find((c) => c.type !== 'heading' && c.type !== 'table');
        const importedBlock = {
          id: target?.id || `${section.id}-imported-${stamp}`,
          type: 'paragraph' as const,
          content: htmlContent,
          isAIGenerated: false,
          metadata: {
            confidence: 1,
            lastModified: new Date(),
            author: 'user' as const,
            dataSource: 'manual' as const,
          },
        };
        const nextContent = target
          ? existing.map((c) => (c.id === target.id ? importedBlock : c))
          : [importedBlock, ...existing];
        return { ...section, content: nextContent };
      });

      onContentUpdate('full-document-content', JSON.stringify(newSections));
      toast.success(`Imported "${uploadedFile?.name || 'document'}" into draft.`);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to import .docx into draft:', err);
      toast.error(err?.message || 'Could not import .docx — try saving it as a newer Word format.');
    } finally {
      if (isMountedRef.current) setIsApplying(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleBack = () => {
    onOpenChange(false);
    onBack?.();
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
      return;
    }
    onOpenChange(true);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" style={{ zIndex: 1400 }} />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] max-h-[85vh] overflow-y-auto gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ zIndex: 1401 }}
        >
          {/* Header */}
          <div className="flex flex-col space-y-1.5 text-left mb-4">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Back"
                  className="h-7 w-7 -ml-1 inline-flex items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <Upload className="w-5 h-5 text-blue-600" />
              Upload Document
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Upload a Word document and paste its content into the matching draft sections.
            </DialogPrimitive.Description>
          </div>

          <DialogPrimitive.Close onClick={handleClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {/* Hidden file input — auto-clicked when the dialog opens */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileChosen(f);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Reference Document
              </h3>
              {!uploadedFile ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !isApplying && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isApplying) fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg px-6 py-10 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    isDragOver
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground/50'
                  } ${isApplying ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                    isDragOver ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-muted'
                  }`}>
                    <Upload className={`w-6 h-6 ${isDragOver ? 'text-blue-600' : 'text-muted-foreground'}`} />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {isDragOver ? 'Drop your .docx here' : 'Drag & drop your .docx here'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or <span className="text-blue-600 font-medium underline-offset-2 hover:underline">click to browse</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    .doc / .docx · up to {(MAX_DOCX_BYTES / 1024 / 1024).toFixed(0)} MB
                  </p>
                </div>
              ) : extractionState === 'error' ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">
                      Couldn't read this file
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Please make sure it's a valid Word (.docx) document and try uploading again.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReplaceFile}
                    disabled={isApplying}
                    className="shrink-0"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload .docx
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-2 space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded text-sm">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate flex-1">{uploadedFile.name}</span>
                    {extractionState === 'extracting' && (
                      <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-blue-100 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading…
                      </span>
                    )}
                    {extractionState === 'ready' && (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-green-100 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={handleReplaceFile}
                      disabled={isApplying || extractionState === 'extracting'}
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={isApplying}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={extractionState !== 'ready' || isApplying}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Update Draft
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

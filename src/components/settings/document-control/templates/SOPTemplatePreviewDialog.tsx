import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileEdit, BookOpen } from 'lucide-react';
import { getSOPContentByName, SOPFullContent } from '@/data/sopFullContent';
import { SaveContentAsDocCIDialog } from '@/components/shared/SaveContentAsDocCIDialog';

interface SOPTemplatePreviewDialogProps {
  template: any;
  isOpen: boolean;
  onClose: () => void;
  onDraftCreated?: () => void;
  companyId: string;
  companyName: string;
}

export function SOPTemplatePreviewDialog({ template, isOpen, onClose, onDraftCreated, companyId, companyName }: SOPTemplatePreviewDialogProps) {
  const [showCIDialog, setShowCIDialog] = useState(false);

  if (!template) return null;

  const sopContent: SOPFullContent | null = getSOPContentByName(template.name);

  const buildHtmlContent = (): string => {
    if (!sopContent) return `<h1>${template.name}</h1><p>${template.description || ''}</p>`;
    
    return sopContent.sections.map((section, idx) => 
      `<h2>${section.title}</h2>\n<p>${section.content}</p>`
    ).join('\n');
  };

  const templateKey = `SOP-TPL-${template.name?.replace(/\s+/g, '-')}`;

  return (
    <>
      <Dialog open={isOpen && !showCIDialog} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <DialogTitle className="text-lg">{template.name}</DialogTitle>
            </div>
            {template.description && (
              <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4 -mr-4">
            {sopContent ? (
              <div className="space-y-4 py-2">
                {sopContent.sections.map((section, idx) => (
                  <div key={section.id} className="border rounded-lg p-4 bg-muted/30">
                    <h3 className="font-semibold text-sm text-foreground mb-2">
                      {section.title}
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>No SOP content available for this template.</p>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button 
              onClick={() => setShowCIDialog(true)}
              disabled={!sopContent}
              className="gap-2"
            >
              <FileEdit className="h-4 w-4" />
              Generate CI Doc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {companyId && (
        <SaveContentAsDocCIDialog
          open={showCIDialog}
          onOpenChange={(open) => {
            setShowCIDialog(open);
            if (!open) {
              onDraftCreated?.();
              onClose();
            }
          }}
          title={template.name}
          htmlContent={buildHtmlContent()}
          templateIdKey={templateKey}
          companyId={companyId}
          companyName={companyName || 'Company'}
          defaultScope="enterprise"
        />
      )}
    </>
  );
}

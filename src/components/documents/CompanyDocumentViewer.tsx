import React from 'react';
import { DocumentPdfPreviewDialog } from '@/components/documents/DocumentPdfPreviewDialog';

interface CompanyDocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    file_path?: string;
    file_name?: string;
    company_id?: string;
    document_type?: string;
    status?: string;
    description?: string;
    document_reference?: string;
  };
  companyId: string;
  // Kept on the prop type so existing callers don't break.
  // The lean preview dialog ignores them — review/approval features
  // live on DocumentReviewKanban via the original DocumentViewer.
  companyRole?: string;
}

export function CompanyDocumentViewer({
  open,
  onOpenChange,
  document,
  companyId,
}: CompanyDocumentViewerProps) {
  const enhancedDocumentName = `${document.name}${document.document_type ? ` (${document.document_type})` : ''}`;

  return (
    <DocumentPdfPreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      documentId={document.id}
      documentName={enhancedDocumentName}
      companyId={companyId}
    />
  );
}

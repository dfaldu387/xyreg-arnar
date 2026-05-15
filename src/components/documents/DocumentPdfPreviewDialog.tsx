import React, { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileText, Download, AlertCircle, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { DocumentPdfPreviewService } from "@/services/documentPdfPreviewService";
import { useAuditLog } from "@/hooks/useAuditLog";
import { LoadingSpinner } from "../ui/loading-spinner";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentPdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName?: string;
  companyId: string;
}

export function DocumentPdfPreviewDialog({
  open,
  onOpenChange,
  documentId,
  documentName = "Document",
  companyId,
}: DocumentPdfPreviewDialogProps) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);

  const MIN_WIDTH = 480;
  const getMaxWidth = () =>
    typeof window !== "undefined" ? Math.max(MIN_WIDTH, window.innerWidth - 80) : 1600;
  const getDefaultWidth = () =>
    typeof window !== "undefined"
      ? Math.min(Math.max(960, Math.round(window.innerWidth * 0.6)), getMaxWidth())
      : 960;

  const [width, setWidth] = useState<number>(getDefaultWidth);
  const isResizingRef = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = window.innerWidth - ev.clientX;
      const clamped = Math.min(Math.max(next, MIN_WIDTH), getMaxWidth());
      setWidth(clamped);
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    const onResize = () => {
      setWidth((w) => Math.min(w, getMaxWidth()));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useAuditLog({
    documentId,
    companyId,
    autoLogView: Boolean(open && documentId && companyId),
  });

  useEffect(() => {
    if (!open || !documentId || !companyId) return;

    let blobUrlForCleanup: string | null = null;
    let cancelled = false;

    const generate = async () => {
      setIsGenerating(true);
      setError(null);
      try {
        const pdfBlob = await DocumentPdfPreviewService.generatePreviewPdfBlob(
          documentId,
          companyId,
        );
        if (cancelled) return;
        if (!pdfBlob || pdfBlob.size === 0) {
          throw new Error("Conversion produced empty result");
        }
        const url = URL.createObjectURL(pdfBlob);
        blobUrlForCleanup = url;
        setPdfBlobUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error("PDF preview generation failed:", err);
        setError("Unable to preview this document. Please download to view.");
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    };

    generate();

    return () => {
      cancelled = true;
      if (blobUrlForCleanup) URL.revokeObjectURL(blobUrlForCleanup);
    };
  }, [open, documentId, companyId]);

  useEffect(() => {
    if (!open) {
      setPdfBlobUrl(null);
      setNumPages(0);
      setCurrentPage(1);
      setScale(1);
      setError(null);
    }
  }, [open]);

  const handleDownload = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `${documentName || "document"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(numPages || p, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)));
  const resetZoom = () => setScale(1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ width: `${width}px`, maxWidth: "100vw" }}
        className="p-0 flex flex-col gap-0 sm:max-w-none [&>button.absolute]:hidden"
      >
        <div
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          title="Drag to resize"
          className="group absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-50 flex items-center justify-center"
        >
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border/60 group-hover:bg-primary/60 transition-colors" />
          <span className="relative flex h-10 w-5 items-center justify-center rounded-full border border-border bg-background shadow-sm group-hover:border-primary/60 group-hover:bg-muted transition-colors">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </span>
        </div>
        <SheetHeader className="flex flex-row items-center justify-between gap-4 px-6 py-4 border-b space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate">
                {documentName}
              </SheetTitle>
              <SheetDescription className="sr-only">
                PDF preview of {documentName}
              </SheetDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!pdfBlobUrl}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </SheetHeader>

        {pdfBlobUrl && numPages > 0 && (
          <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-muted/30">
            <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage <= 1}>
              Previous
            </Button>
            <span className="text-sm px-3">
              Page {currentPage} of {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={currentPage >= numPages}
            >
              Next
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
              Zoom Out
            </Button>
            <Button variant="ghost" size="sm" onClick={resetZoom} className="min-w-[60px]">
              {Math.round(scale * 100)}%
            </Button>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3}>
              Zoom In
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-muted/20 flex justify-center p-6">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoadingSpinner />
              <p className="text-sm">Generating PDF preview…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground max-w-md text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm">{error}</p>
            </div>
          ) : pdfBlobUrl ? (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={(e) => {
                console.error("react-pdf load error:", e);
                setError("Unable to render the generated PDF.");
                toast.error("Unable to render the generated PDF.");
              }}
              loading={<LoadingSpinner />}
              className="flex justify-center"
            >
              <div className="shadow-lg bg-white">
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                />
              </div>
            </Document>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

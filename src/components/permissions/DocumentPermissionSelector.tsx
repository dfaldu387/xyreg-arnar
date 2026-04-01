import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Filter, ChevronDown, Check } from "lucide-react";

interface Phase {
  id: string;
  name: string;
}

interface DocumentItem {
  id: string;
  name: string;
  phase_id: string;
  phase_name: string;
}

interface DocumentPermissionSelectorProps {
  companyId: string;
  selectedProductIds: string[];
  selectedDocumentIds: string[];
  onChange: (ids: string[]) => void;
}

export function DocumentPermissionSelector({
  companyId,
  selectedProductIds,
  selectedDocumentIds,
  onChange,
}: DocumentPermissionSelectorProps) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // Temp selection that only commits on "Done"
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);

  // Fetch phases and documents filtered by selected products
  useEffect(() => {
    if (!companyId || selectedProductIds.length === 0) {
      setDocuments([]);
      setPhases([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch chosen phases
        const { data: chosenPhases } = await supabase
          .from("company_chosen_phases")
          .select("company_phases!inner(id, name, position)")
          .eq("company_id", companyId);

        const phaseList: Phase[] = (chosenPhases || [])
          .sort(
            (a: any, b: any) =>
              (a.company_phases?.position || 0) -
              (b.company_phases?.position || 0)
          )
          .map((item: any) => ({
            id: item.company_phases.id,
            name: item.company_phases.name,
          }));

        setPhases(phaseList);

        // Build phase name map
        const phaseNameMap = new Map<string, string>();
        phaseList.forEach((p) => phaseNameMap.set(p.id, p.name));

        // Fetch document templates filtered by selected product IDs
        const { data: docs } = await (supabase as any)
          .from("phase_assigned_document_template")
          .select("id, name, phase_id, product_id")
          .eq("company_id", companyId)
          .in("product_id", selectedProductIds);

        const docList: DocumentItem[] = (docs || [])
          .filter((d: any) => d.name)
          .map((d: any) => ({
            id: d.id,
            name: d.name,
            phase_id: d.phase_id,
            phase_name: (() => { const n = phaseNameMap.get(d.phase_id); return (!n || n === "No Phase") ? "Core" : n; })(),
          }));

        setDocuments(docList);
      } catch (error) {
        console.error("Error fetching document permissions data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, selectedProductIds]);

  // Clear stale document selections when products change
  useEffect(() => {
    if (loading) return;
    if (documents.length === 0 && selectedDocumentIds.length > 0) {
      onChange([]);
    } else if (selectedDocumentIds.length > 0) {
      const validIds = new Set(documents.map((d) => d.id));
      const filtered = selectedDocumentIds.filter((id) => validIds.has(id));
      if (filtered.length !== selectedDocumentIds.length) {
        onChange(filtered);
      }
    }
  }, [documents, loading]);

  // Filter documents by selected phase
  const filteredDocuments =
    selectedPhase === "all"
      ? documents
      : documents.filter((d) => d.phase_id === selectedPhase);

  // Check if all filtered documents are selected (using temp state when dialog open)
  const activeIds = dialogOpen ? tempSelectedIds : selectedDocumentIds;
  const allFilteredSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((d) => activeIds.includes(d.id));

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredDocuments.map((d) => d.id));
      setTempSelectedIds(tempSelectedIds.filter((id) => !filteredIds.has(id)));
    } else {
      const existing = new Set(tempSelectedIds);
      filteredDocuments.forEach((d) => existing.add(d.id));
      setTempSelectedIds(Array.from(existing));
    }
  };

  const handleToggleDocument = (docId: string) => {
    if (tempSelectedIds.includes(docId)) {
      setTempSelectedIds(tempSelectedIds.filter((id) => id !== docId));
    } else {
      setTempSelectedIds([...tempSelectedIds, docId]);
    }
  };

  const handleOpenDialog = () => {
    setTempSelectedIds([...selectedDocumentIds]);
    setSelectedPhase("all");
    setDialogOpen(true);
  };

  const handleDone = () => {
    onChange(tempSelectedIds);
    setDialogOpen(false);
  };

  const handleCancel = () => {
    setDialogOpen(false);
  };

  const getPhaseFilterLabel = () => {
    if (selectedPhase === "all") return "All Phases";
    const phase = phases.find((p) => p.id === selectedPhase);
    const name = phase?.name;
    return (!name || name === "No Phase") ? "Core" : name;
  };

  const disabled = selectedProductIds.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Document Permissions</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenDialog}
          disabled={disabled}
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {selectedDocumentIds.length > 0
            ? `${selectedDocumentIds.length} selected`
            : "Select Documents"}
        </Button>
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground">Select devices first to assign document permissions</p>
      )}

      {selectedDocumentIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedDocumentIds.length} document{selectedDocumentIds.length !== 1 ? "s" : ""} selected
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFilterOpen(false); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60" />
          <DialogPrimitive.Content
            className="fixed left-[50%] top-[50%] z-[80] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg max-h-[80vh] flex flex-col"
            style={{ overflow: "visible" }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
          <DialogHeader>
            <DialogTitle>Select Documents</DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading documents...</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No documents available for selected devices</p>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Phase filter dropdown */}
              <div className="relative" style={{ zIndex: 10 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  {getPhaseFilterLabel()}
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                </Button>
                {filterOpen && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 10 }} onClick={() => setFilterOpen(false)} />
                    <div
                      className="absolute left-0 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md overflow-y-auto"
                      style={{ zIndex: 11, maxHeight: 300, top: "100%" }}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-sm hover:bg-accent text-left"
                        onClick={() => { setSelectedPhase("all"); setFilterOpen(false); }}
                      >
                        {selectedPhase === "all" && <Check className="h-3.5 w-3.5 shrink-0" />}
                        <span className={selectedPhase === "all" ? "" : "ml-[22px]"}>All Phases</span>
                      </button>
                      {phases.map((phase) => (
                        <button
                          key={phase.id}
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-sm hover:bg-accent text-left"
                          onClick={() => { setSelectedPhase(phase.id); setFilterOpen(false); }}
                        >
                          {selectedPhase === phase.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                          <span className={selectedPhase === phase.id ? "" : "ml-[22px]"}>{phase.name === "No Phase" ? "Core" : phase.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Select All */}
              <div className="flex items-center space-x-2 border-b pb-2">
                <Checkbox
                  id="dialog-select-all-docs"
                  checked={allFilteredSelected}
                  onCheckedChange={handleSelectAll}
                />
                <Label
                  htmlFor="dialog-select-all-docs"
                  className="text-sm font-medium cursor-pointer"
                >
                  Select All ({filteredDocuments.length} documents)
                </Label>
              </div>

              {/* Document list */}
              <div className="h-[300px] overflow-y-auto rounded-md border p-3">
                {filteredDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No documents in this phase
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dialog-doc-${doc.id}`}
                          checked={tempSelectedIds.includes(doc.id)}
                          onCheckedChange={() => handleToggleDocument(doc.id)}
                        />
                        <Label
                          htmlFor={`dialog-doc-${doc.id}`}
                          className="text-sm cursor-pointer flex items-center gap-1.5 font-normal"
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{doc.name}</span>
                          {selectedPhase === "all" && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({doc.phase_name})
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {tempSelectedIds.length} document{tempSelectedIds.length !== 1 ? "s" : ""} selected
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handleDone}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </div>
  );
}

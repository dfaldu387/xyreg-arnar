import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, IconButton, Box, Typography, CircularProgress, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { LiveEditor } from '@/components/document-composer/LiveEditor';
import { DocumentTemplate } from '@/types/documentComposer';
import { DocumentTemplatePersistenceService } from '@/services/documentTemplatePersistenceService';
import { getDefaultSectionsForType } from '@/utils/documentTemplateUtils';
import { useCompanyRole } from '@/context/CompanyRoleContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DocumentEditor } from "@onlyoffice/document-editor-react";
import { FileEdit, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

// OnlyOffice constants
const SUPABASE_URL = "https://wzzkbmmgxxrfhhxggrcl.supabase.co";
const STORAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public`;
const CALLBACK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onlyoffice-callback`;

const getDocumentUrl = (filePath?: string): string => {
  if (!filePath) return "";
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return `${STORAGE_URL}/document-templates/${cleanPath}`;
};

const getFileType = (fileName?: string): string => {
  if (!fileName) return "docx";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "doc" || ext === "docx") return "docx";
  if (ext === "xls" || ext === "xlsx") return "xlsx";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  if (ext === "pdf") return "pdf";
  return "docx";
};

const getDocumentType = (fileName?: string): string => {
  if (!fileName) return "word";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "xls" || ext === "xlsx") return "cell";
  if (ext === "ppt" || ext === "pptx") return "slide";
  return "word";
};

interface DocumentDraftDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  documentType: string;
  productId?: string;
  companyId?: string;
  onDocumentSaved?: () => void;
  filePath?: string;
  fileName?: string;
}

export function DocumentDraftDrawer({
  open,
  onOpenChange,
  documentId,
  documentName,
  documentType,
  productId,
  companyId,
  onDocumentSaved,
  filePath,
  fileName,
}: DocumentDraftDrawerProps) {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingDraftId, setExistingDraftId] = useState<string | null>(null);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const { activeCompanyRole } = useCompanyRole();
  const { user } = useAuth();
  const activeRole = activeCompanyRole?.role;
  const canEdit = activeRole !== 'viewer';

  // Reset advanced editor state when drawer closes
  useEffect(() => {
    if (!open) {
      setShowAdvancedEditor(false);
      setEditorMounted(false);
      setEditorKey(null);
    }
  }, [open]);

  // Resizable drawer state
  const [drawerWidth, setDrawerWidth] = useState(() => window.innerWidth * 0.75);
  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 400;
      const maxWidth = window.innerWidth * 0.95;
      setDrawerWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const resolvedDocUrl = editorMounted && filePath ? getDocumentUrl(filePath) : "";

  // Fetch or create a stable editor key from DB for collaboration
  useEffect(() => {
    if (!editorMounted || !documentId) return;
    const fetchOrCreateKey = async () => {
      const { data } = await supabase
        .from('document_editor_sessions')
        .select('editor_key')
        .eq('document_id', documentId)
        .single();
      if (data) {
        setEditorKey(data.editor_key);
      } else {
        const newKey = `collab-${documentId}-v1`;
        await supabase.from('document_editor_sessions').insert({
          document_id: documentId,
          editor_key: newKey,
          version: 1,
        });
        setEditorKey(newKey);
      }
    };
    fetchOrCreateKey();
  }, [editorMounted, documentId]);

  // Normalize the CI document ID (strip "template-" prefix if present)
  const normalizedDocId = documentId?.startsWith('template-')
    ? documentId.replace('template-', '')
    : documentId;

  // Initialize template when drawer opens - check for existing draft first
  useEffect(() => {
    if (!open) {
      setTemplate(null);
      setExistingDraftId(null);
      return;
    }

    const resolvedCompanyId = companyId || activeCompanyRole?.companyId;
    if (!resolvedCompanyId || !normalizedDocId) return;

    const loadOrCreateTemplate = async () => {
      setIsLoading(true);
      try {
        // Look up existing draft by template_id = CI document ID
        const { data: existingDraft } = await supabase
          .from('document_studio_templates')
          .select('*')
          .eq('company_id', resolvedCompanyId)
          .eq('template_id', normalizedDocId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingDraft) {
          // Load existing draft
          const sections = Array.isArray(existingDraft.sections) ? existingDraft.sections : [];
          const docControl = existingDraft.document_control as any;

          const loadedTemplate: DocumentTemplate = {
            id: normalizedDocId,
            name: existingDraft.name,
            type: existingDraft.type,
            sections: sections as any,
            productContext: existingDraft.product_context as any || {
              id: productId || '',
              name: '',
              riskClass: '',
              phase: '',
              regulatoryRequirements: [],
            },
            documentControl: docControl || {
              sopNumber: '',
              documentTitle: existingDraft.name,
              version: '1.0',
              effectiveDate: new Date(),
              documentOwner: '',
              preparedBy: { name: '', title: '', date: new Date() },
              reviewedBy: { name: '', title: '', date: new Date() },
              approvedBy: { name: '', title: '', date: new Date() },
            },
            metadata: existingDraft.metadata as any || {
              version: '1.0',
              lastUpdated: new Date(),
              estimatedCompletionTime: '30 minutes',
            },
          };

          setExistingDraftId(existingDraft.id);
          setTemplate(loadedTemplate);
        } else {
          // No existing draft — create new blank template using CI doc ID as template_id
          const sections = getDefaultSectionsForType(documentType);
          const newTemplate: DocumentTemplate = {
            id: normalizedDocId,
            name: documentName,
            type: documentType,
            sections,
            productContext: {
              id: productId || '',
              name: '',
              riskClass: '',
              phase: '',
              regulatoryRequirements: [],
            },
            documentControl: {
              sopNumber: '',
              documentTitle: documentName,
              version: '1.0',
              effectiveDate: new Date(),
              documentOwner: '',
              preparedBy: { name: '', title: '', date: new Date() },
              reviewedBy: { name: '', title: '', date: new Date() },
              approvedBy: { name: '', title: '', date: new Date() },
            },
            metadata: {
              version: '1.0',
              lastUpdated: new Date(),
              estimatedCompletionTime: '30 minutes',
            },
          };

          setExistingDraftId(null);
          setTemplate(newTemplate);
        }
      } catch (error) {
        console.error('Error loading existing draft:', error);
        // Fallback to new template on error
        const sections = getDefaultSectionsForType(documentType);
        const newTemplate: DocumentTemplate = {
          id: normalizedDocId,
          name: documentName,
          type: documentType,
          sections,
          productContext: {
            id: productId || '',
            name: '',
            riskClass: '',
            phase: '',
            regulatoryRequirements: [],
          },
          documentControl: {
            sopNumber: '',
            documentTitle: documentName,
            version: '1.0',
            effectiveDate: new Date(),
            documentOwner: '',
            preparedBy: { name: '', title: '', date: new Date() },
            reviewedBy: { name: '', title: '', date: new Date() },
            approvedBy: { name: '', title: '', date: new Date() },
          },
          metadata: {
            version: '1.0',
            lastUpdated: new Date(),
            estimatedCompletionTime: '30 minutes',
          },
        };
        setExistingDraftId(null);
        setTemplate(newTemplate);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrCreateTemplate();
  }, [open, normalizedDocId, documentName, documentType, productId, companyId, activeCompanyRole?.companyId]);

  const handleContentUpdate = useCallback((contentId: string, newContent: string) => {
    setTemplate(prev => {
      if (!prev) return prev;

      // Handle document title update
      if (contentId === 'document-title') {
        const updated = { ...prev, name: newContent };
        DocumentTemplatePersistenceService.saveTemplateToLocalStorage(prev.id, updated);
        return updated;
      }

      // Update section content
      const updated = {
        ...prev,
        sections: prev.sections.map(section => ({
          ...section,
          content: section.content.map(contentItem =>
            contentItem.id === contentId
              ? { ...contentItem, content: newContent }
              : contentItem
          ),
        })),
      };

      DocumentTemplatePersistenceService.saveTemplateToLocalStorage(prev.id, updated);
      return updated;
    });
  }, []);

  const handleDocumentControlChange = useCallback((field: string, value: string) => {
    setTemplate(prev => {
      if (!prev) return prev;

      const dc = { ...(prev.documentControl || {}) } as any;

      if (field === 'documentOwner') {
        dc.documentOwner = value || undefined;
      } else if (field.startsWith('preparedBy.')) {
        dc.preparedBy = { ...(dc.preparedBy || {}), name: value || '' };
      } else if (field.startsWith('reviewedBy.')) {
        dc.reviewedBy = { ...(dc.reviewedBy || {}), name: value || '' };
      } else if (field.startsWith('approvedBy.')) {
        dc.approvedBy = { ...(dc.approvedBy || {}), name: value || '' };
      }

      return { ...prev, documentControl: dc };
    });
  }, []);

  const handleDocumentSaved = useCallback(() => {
    onOpenChange(false);
    onDocumentSaved?.();
  }, [onOpenChange, onDocumentSaved]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => onOpenChange(false)}
      ModalProps={{
        disableAutoFocus: true,
        disableEnforceFocus: true,
      }}
      PaperProps={{
        sx: { width: { xs: '100%', md: `${drawerWidth}px` }, maxWidth: '100vw', overflow: 'visible' },
      }}
    >
      {/* Resize handle — full-height line with grip icon */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'absolute',
          left: -6,
          top: 0,
          bottom: 0,
          width: 12,
          cursor: 'col-resize',
          zIndex: 1,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Vertical line — always visible, top to bottom */}
        <Box
          className="resize-line"
          sx={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '2px',
            transform: 'translateX(-50%)',
            bgcolor: 'grey.300',
          }}
        />
        {/* Grip icon */}
        <Box
          className="resize-grip"
          sx={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 32,
            borderRadius: '4px',
            bgcolor: 'grey.200',
            border: '1px solid',
            borderColor: 'grey.300',
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 16, color: 'grey.600' }} />
        </Box>
      </Box>

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {showAdvancedEditor && (
            <Tooltip title="Back to Draft Editor" arrow>
              <IconButton
                onClick={() => setShowAdvancedEditor(false)}
                size="small"
              >
                <ArrowLeft style={{ width: 20, height: 20 }} />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="h6" noWrap>
            {showAdvancedEditor
              ? `Advanced Editor — ${documentName}`
              : `${existingDraftId ? 'Edit Draft' : 'Create Draft'} — ${documentName}`
            }
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!showAdvancedEditor && (() => {
            const ext = (fileName || filePath || '').split('.').pop()?.toLowerCase();
            return ext === 'doc' || ext === 'docx';
          })() && (
            <Box
              onClick={() => { setShowAdvancedEditor(true); setEditorMounted(true); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: '#1976d2',
                border: '1px solid #1976d2',
                borderRadius: '6px',
                px: 1,
                py: 0.5,
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 500,
                '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.08)' }
              }}
            >
              <FileEdit style={{ width: 16, height: 16 }} />
              Advanced Editor
            </Box>
          )}
          <IconButton onClick={() => onOpenChange(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'hidden', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
        {/* Advanced Editor — hidden via CSS instead of unmounting to avoid DOM errors */}
        {editorMounted && resolvedDocUrl && editorKey && (
          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', display: showAdvancedEditor ? 'flex' : 'none' }}>
            <DocumentEditor
              id="onlyoffice-editor-inline"
              documentServerUrl={import.meta.env.VITE_ONLYOFFICE_SERVER_URL}
              config={{
                document: {
                  fileType: getFileType(fileName || filePath || documentName),
                  key: editorKey,
                  title: fileName || documentName || "Document",
                  url: resolvedDocUrl,
                },
                documentType: getDocumentType(fileName || documentName),
                editorConfig: {
                  mode: canEdit ? "edit" : "view",
                  callbackUrl: canEdit && filePath ? `${CALLBACK_URL}?path=${encodeURIComponent(filePath)}` : "",
                  user: {
                    id: user?.id || "anonymous",
                    name: [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") || user?.email || "Anonymous",
                  },
                  customization: {
                    autosave: true,
                    forcesave: true,
                    features: {
                      spellcheck: { mode: true },
                    },
                    goback: { blank: false },
                  },
                  lang: "en",
                },
                height: "100%",
                width: "100%",
              }}
              onLoadComponentError={(errorCode: number, errorDescription: string) => {
                console.error("ONLYOFFICE Error:", errorCode, errorDescription);
              }}
            />
          </Box>
        )}

        {/* Draft Editor */}
        <Box sx={{ flex: 1, overflow: 'auto', display: showAdvancedEditor ? 'none' : 'flex', flexDirection: 'column' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <CircularProgress />
            </Box>
          ) : template ? (
            <LiveEditor
              template={template}
              onContentUpdate={handleContentUpdate}
              companyId={companyId || activeCompanyRole?.companyId}
              onDocumentSaved={handleDocumentSaved}
              isEditingExistingDocument={!!existingDraftId}
              editingDocumentId={existingDraftId}
              onAIGenerate={() => {}}
              onAddAutoNote={() => {}}
              currentNotes={[]}
              selectedScope={productId ? 'product' : 'company'}
              selectedProductId={productId}
              onDocumentControlChange={handleDocumentControlChange}
            />
          ) : null}
        </Box>
      </Box>
    </Drawer>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, Building2, Crop } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/useTranslation';
import { LogoCropDialog } from './LogoCropDialog';

interface CompanyLogoUploadProps {
  companyId: string;
  currentLogoUrl?: string | null;
  currentLogoOriginalUrl?: string | null;
  currentDocumentLogoUrl?: string | null;
  currentDocumentLogoOriginalUrl?: string | null;
}

type SlotKind = 'square' | 'document';

interface SlotConfig {
  kind: SlotKind;
  title: string;
  description: string;
  previewClass: string; // tailwind sizing for the preview box
  filePrefix: string;   // storage filename segment
  urlColumn: 'logo_url' | 'document_logo_url';
  originalColumn: 'logo_original_url' | 'document_logo_original_url';
  cropTitle: string;
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { mode: 'cors' });
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface SlotProps {
  companyId: string;
  config: SlotConfig;
  initialUrl: string | null;
  initialOriginalUrl: string | null;
}

function LogoSlot({ companyId, config, initialUrl, initialOriginalUrl }: SlotProps) {
  const { lang } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingRecrop, setIsLoadingRecrop] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const [originalUrl, setOriginalUrl] = useState(initialOriginalUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingOriginal, setPendingOriginal] = useState<{ blob: Blob; ext: string } | null>(null);
  const queryClient = useQueryClient();
  const inputId = `logo-upload-${config.kind}`;

  const validateFile = (file: File | undefined): file is File => {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
      toast.error(lang('company.logo.invalidFileType'), {
        description: lang('company.logo.invalidFileTypeDesc'),
      });
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(lang('company.logo.fileTooLarge'), {
        description: lang('company.logo.fileTooLargeDesc'),
      });
      return false;
    }
    return true;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!validateFile(file)) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || (file.type.split('/')[1] ?? 'png');
    setPendingOriginal({ blob: file, ext });
    const reader = new FileReader();
    reader.onload = () => setCropSrc(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleConfirmRaw = async () => {
    if (!pendingOriginal) return;
    setIsUploading(true);
    try {
      const ts = Date.now();
      const filePath = `company-logos/${companyId}-${config.filePrefix}-${ts}.${pendingOriginal.ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-media')
        .upload(filePath, pendingOriginal.blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: pendingOriginal.blob.type || 'application/octet-stream',
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('company-media').getPublicUrl(uploadData.path);

      // For raw uploads, the "logo" and the "original" are the same file —
      // store the same URL in both columns so Recrop still works later.
      const updatePayload: Record<string, any> = {
        [config.urlColumn]: urlData.publicUrl,
        [config.originalColumn]: urlData.publicUrl,
      };

      let { error: updateError } = await supabase
        .from('companies')
        .update(updatePayload as any)
        .eq('id', companyId);
      if (updateError && new RegExp(config.originalColumn).test(updateError.message || '')) {
        const retry = await supabase
          .from('companies')
          .update({ [config.urlColumn]: urlData.publicUrl } as any)
          .eq('id', companyId);
        updateError = retry.error;
      }
      if (updateError && new RegExp(config.urlColumn).test(updateError.message || '')) {
        throw new Error(
          `The "${config.urlColumn}" column doesn't exist yet. Apply the pending migration to enable this slot.`,
        );
      }
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-info', companyId] });
      const newUrl = `${urlData.publicUrl}?t=${ts}`;
      setPreviewUrl(newUrl);
      setOriginalUrl(urlData.publicUrl);
      setCropSrc(null);
      setPendingOriginal(null);
      toast.success(lang('company.logo.uploadSuccess'), {
        description: lang('company.logo.uploadSuccessDesc'),
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(lang('company.logo.uploadFailed'), {
        description: (error as any)?.message || lang('company.logo.uploadFailedDesc'),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecrop = async () => {
    const source = originalUrl || previewUrl;
    if (!source) return;
    setIsLoadingRecrop(true);
    try {
      const dataUrl = await urlToDataUrl(source);
      setPendingOriginal(null);
      setCropSrc(dataUrl);
    } catch (err) {
      console.error('Failed to load logo for recrop', err);
      toast.error(lang('company.logo.uploadFailed'), {
        description: 'Could not load the existing logo for cropping.',
      });
    } finally {
      setIsLoadingRecrop(false);
    }
  };

  const handleCroppedUpload = async (croppedBlob: Blob) => {
    setIsUploading(true);
    try {
      const ts = Date.now();
      const croppedPath = `company-logos/${companyId}-${config.filePrefix}-${ts}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-media')
        .upload(croppedPath, croppedBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/png',
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('company-media').getPublicUrl(uploadData.path);

      let nextOriginalUrl = originalUrl;
      if (pendingOriginal) {
        const origPath = `company-logos/${companyId}-${config.filePrefix}-original-${ts}.${pendingOriginal.ext}`;
        const { data: origUpload, error: origErr } = await supabase.storage
          .from('company-media')
          .upload(origPath, pendingOriginal.blob, {
            cacheControl: '3600',
            upsert: false,
            contentType: pendingOriginal.blob.type || 'application/octet-stream',
          });
        if (!origErr && origUpload) {
          const { data: origUrlData } = supabase.storage.from('company-media').getPublicUrl(origUpload.path);
          nextOriginalUrl = origUrlData.publicUrl;
        } else if (origErr) {
          console.warn('Failed to persist original logo:', origErr);
        }
      }

      const updatePayload: Record<string, any> = { [config.urlColumn]: urlData.publicUrl };
      if (nextOriginalUrl) updatePayload[config.originalColumn] = nextOriginalUrl;

      let { error: updateError } = await supabase
        .from('companies')
        .update(updatePayload as any)
        .eq('id', companyId);
      if (updateError && new RegExp(config.originalColumn).test(updateError.message || '')) {
        const retry = await supabase
          .from('companies')
          .update({ [config.urlColumn]: urlData.publicUrl } as any)
          .eq('id', companyId);
        updateError = retry.error;
      }
      if (updateError && new RegExp(config.urlColumn).test(updateError.message || '')) {
        // column missing entirely (document_logo_url migration not yet applied)
        throw new Error(
          `The "${config.urlColumn}" column doesn't exist yet. Apply the pending migration to enable this slot.`,
        );
      }
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-info', companyId] });
      const newUrl = `${urlData.publicUrl}?t=${ts}`;
      setPreviewUrl(newUrl);
      setOriginalUrl(nextOriginalUrl);
      setCropSrc(null);
      setPendingOriginal(null);
      toast.success(lang('company.logo.uploadSuccess'), {
        description: lang('company.logo.uploadSuccessDesc'),
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(lang('company.logo.uploadFailed'), {
        description: (error as any)?.message || lang('company.logo.uploadFailedDesc'),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const canRecrop = !!previewUrl;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">{config.title}</h4>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>
      <div className="flex items-center gap-4">
        <div
          className={`relative ${config.previewClass} rounded-lg border-2 border-dashed border-border bg-muted/20 overflow-hidden flex items-center justify-center`}
        >
          {isUploading && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={lang('company.logo.altText')}
              className={`w-full h-full object-contain transition-opacity ${
                isUploading ? 'opacity-50' : 'opacity-100'
              }`}
            />
          ) : (
            <Building2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 flex items-center gap-2">
          <input
            type="file"
            id={inputId}
            accept="image/*"
            onChange={handleFileSelect}
            disabled={isUploading}
            className="hidden"
          />
          <Button
            variant="outline"
            disabled={isUploading || isLoadingRecrop}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {lang('company.logo.processing')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {previewUrl ? lang('company.logo.changeLogo') : lang('company.logo.uploadLogo')}
              </>
            )}
          </Button>

          {canRecrop && (
            <Button
              variant="outline"
              disabled={isUploading || isLoadingRecrop}
              onClick={handleRecrop}
              title={originalUrl ? 'Re-crop the original uploaded image' : 'Re-crop the current logo'}
            >
              {isLoadingRecrop ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Crop className="mr-2 h-4 w-4" />
              )}
              Recrop
            </Button>
          )}
        </div>
      </div>

      <LogoCropDialog
        open={cropSrc !== null}
        imageSrc={cropSrc}
        allowRawUpload={pendingOriginal !== null}
        title={config.cropTitle}
        onCancel={() => {
          setCropSrc(null);
          setPendingOriginal(null);
        }}
        onConfirmRaw={handleConfirmRaw}
        onConfirm={handleCroppedUpload}
      />
    </div>
  );
}

export function CompanyLogoUpload({
  companyId,
  currentLogoUrl,
  currentLogoOriginalUrl,
  currentDocumentLogoUrl,
  currentDocumentLogoOriginalUrl,
}: CompanyLogoUploadProps) {
  const { lang } = useTranslation();

  const squareConfig: SlotConfig = {
    kind: 'square',
    title: 'Square logo',
    description: 'Used everywhere — cards, marketplace, investor views, document thumbnails. Square artwork works best.',
    previewClass: 'w-24 h-24',
    filePrefix: 'logo',
    urlColumn: 'logo_url',
    originalColumn: 'logo_original_url',
    cropTitle: 'Upload square logo',
  };

  const documentConfig: SlotConfig = {
    kind: 'document',
    title: 'Document logo (optional)',
    description: 'Wide banner used on document headers and PDF exports. Falls back to the square logo when empty.',
    previewClass: 'w-40 h-[90px]',
    filePrefix: 'doc-logo',
    urlColumn: 'document_logo_url',
    originalColumn: 'document_logo_original_url',
    cropTitle: 'Upload document logo',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lang('company.logo.title')}</CardTitle>
        <CardDescription>{lang('company.logo.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LogoSlot
          companyId={companyId}
          config={squareConfig}
          initialUrl={currentLogoUrl ?? null}
          initialOriginalUrl={currentLogoOriginalUrl ?? null}
        />
        <div className="border-t" />
        <LogoSlot
          companyId={companyId}
          config={documentConfig}
          initialUrl={currentDocumentLogoUrl ?? null}
          initialOriginalUrl={currentDocumentLogoOriginalUrl ?? null}
        />
      </CardContent>
    </Card>
  );
}

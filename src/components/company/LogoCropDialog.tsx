import { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crop as CropIcon, Loader2 } from 'lucide-react';

interface LogoCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  allowRawUpload?: boolean;
  onCancel: () => void;
  onConfirmRaw?: () => Promise<void> | void;
  onConfirm: (blob: Blob) => Promise<void> | void;
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
  title?: string;
  description?: string;
}

async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  outputWidth?: number,
  outputHeight?: number,
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  const targetWidth = outputWidth ?? Math.round(sourceWidth);
  const targetHeight = outputHeight ?? Math.round(sourceHeight);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create image'))),
      'image/png',
      1,
    );
  });
}

function buildInitialCrop(mediaWidth: number, mediaHeight: number, aspect?: number): Crop {
  if (aspect) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight,
    );
  }
  return centerCrop(
    { unit: '%', x: 0, y: 0, width: 80, height: 80 },
    mediaWidth,
    mediaHeight,
  );
}

export function LogoCropDialog({
  open,
  imageSrc,
  allowRawUpload = false,
  onCancel,
  onConfirmRaw,
  onConfirm,
  aspect,
  outputWidth,
  outputHeight,
  title = 'Upload logo',
  description,
}: LogoCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mode, setMode] = useState<'preview' | 'crop'>(allowRawUpload ? 'preview' : 'crop');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset to the right starting mode each time the dialog opens.
  useEffect(() => {
    if (open) {
      setMode(allowRawUpload ? 'preview' : 'crop');
      setCrop(undefined);
      setCompletedCrop(null);
    }
  }, [open, allowRawUpload]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const initial = buildInitialCrop(width, height, aspect);
      setCrop(initial);
      setCompletedCrop({
        unit: 'px',
        x: (initial.x / 100) * width,
        y: (initial.y / 100) * height,
        width: (initial.width / 100) * width,
        height: (initial.height / 100) * height,
      });
    },
    [aspect],
  );

  const handleUploadCropped = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      return;
    }
    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop, outputWidth, outputHeight);
      await onConfirm(blob);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadRaw = async () => {
    if (!onConfirmRaw) return;
    setIsProcessing(true);
    try {
      await onConfirmRaw();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isProcessing) {
      onCancel();
    }
  };

  const isCropMode = mode === 'crop';
  const effectiveDescription =
    description ??
    (isCropMode
      ? 'Drag any edge or corner to resize the crop box. Drag inside to reposition.'
      : 'Preview your image. Upload it as-is, or crop it first.');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-3 p-4 sm:p-5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{effectiveDescription}</DialogDescription>
        </DialogHeader>

        <div className="w-full max-h-[24rem] bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {imageSrc && !isCropMode && (
            <img
              src={imageSrc}
              alt="Preview"
              style={{ maxHeight: '24rem', maxWidth: '100%', display: 'block' }}
            />
          )}
          {imageSrc && isCropMode && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              keepSelection
              minWidth={20}
              minHeight={20}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                onLoad={onImageLoad}
                alt="Crop preview"
                style={{ maxHeight: '24rem', maxWidth: '100%', display: 'block' }}
              />
            </ReactCrop>
          )}
        </div>

        <DialogFooter className="mt-1">
          {isCropMode ? (
            <>
              <Button
                variant="outline"
                onClick={() => (allowRawUpload ? setMode('preview') : onCancel())}
                disabled={isProcessing}
              >
                {allowRawUpload ? 'Back' : 'Cancel'}
              </Button>
              <Button onClick={handleUploadCropped} disabled={isProcessing || !completedCrop}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save & upload'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode('crop')}
                disabled={isProcessing}
              >
                <CropIcon className="mr-2 h-4 w-4" />
                Crop
              </Button>
              <Button onClick={handleUploadRaw} disabled={isProcessing || !onConfirmRaw}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

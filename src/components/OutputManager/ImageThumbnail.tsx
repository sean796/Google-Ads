import { useState, useEffect } from "react";
import * as React from "react";
import { Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/ui";


interface ImageThumbnailProps {
  src: string; // base64 data URL
  alt?: string;
  size?: number; // default 50
  onClick?: () => void; // optional full-size preview
}

export const ImageThumbnail = ({
  src,
  alt = "Image preview",
  size = 50,
  onClick,
}: ImageThumbnailProps) => {
  const [hasError, setHasError] = useState(false);
  const [showFullSize, setShowFullSize] = useState(false);

  // Normalize src to ensure it's a valid data URL
  const normalizedSrc = React.useMemo(() => {
    if (!src) return null;
    if (src.startsWith('data:') || src.startsWith('http')) {
      return src;
    }
    // Assume it's base64 without prefix
    return `data:image/png;base64,${src}`;
  }, [src]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('ImageThumbnail load error:', {
      srcPrefix: normalizedSrc?.substring(0, 100),
      hasSrc: !!normalizedSrc,
      srcLength: normalizedSrc?.length
    });
    setHasError(true);
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowFullSize(true);
    }
  };

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  if (hasError || !normalizedSrc) {
    return (
      <div
        className="flex items-center justify-center rounded border border-border bg-muted/30 flex-shrink-0"
        style={{ width: size, height: size }}
        title={hasError ? "Failed to load image" : "No image data"}
      >
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div
        className="relative flex-shrink-0 rounded border border-border bg-muted/30 overflow-hidden cursor-pointer hover:border-primary transition-colors"
        style={{ width: size, height: size }}
        onClick={handleClick}
        title={alt}
      >
        <img
          src={normalizedSrc}
          alt={alt}
          className="w-full h-full object-contain"
          onError={handleImageError}
        />
      </div>

      {/* Full-size preview modal */}
      {showFullSize && normalizedSrc && (
        <Dialog open={showFullSize} onOpenChange={setShowFullSize}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
            <div className="flex items-center justify-center bg-background p-4">
              <img
                src={normalizedSrc}
                alt={alt}
                className="max-w-full max-h-[85vh] object-contain rounded"
                onError={handleImageError}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};


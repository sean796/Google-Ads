import { Download, ImageIcon } from "lucide-react";
import { PPC_DETAIL_TEXTAREA_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import { clampInstagramCaption } from "@/lib/social/content-creator-social-copy-limits";
import type { SocialCreatorRow } from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { Button, TextareaField } from "@/ui";

export type SocialCreatorInstagramPreviewProps = {
  row: SocialCreatorRow;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onDownloadImage?: () => void;
};

export function SocialCreatorInstagramPreview({
  row,
  caption,
  onCaptionChange,
  onDownloadImage,
}: SocialCreatorInstagramPreviewProps) {
  const imageSrc = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64 ?? null;

  return (
    <div className="mx-auto w-full max-w-sm bg-black">
      <div className="relative aspect-square w-full bg-ui-field">
        {imageSrc ? (
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden />
            <span className="text-base">No image</span>
          </div>
        )}
        {imageSrc && onDownloadImage ? (
          <Button
            variant="quiet"
            type="button"
            onClick={onDownloadImage}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 pt-3">
        <label className="text-base text-muted-foreground">Caption</label>
        <TextareaField
          placeholder="Instagram caption"
          value={caption}
          aria-label="Instagram caption"
          onChange={(e) => onCaptionChange(clampInstagramCaption(e.target.value))}
        />
      </div>
    </div>
  );
}

import { Download, ImageIcon } from "lucide-react";
import { PPC_DETAIL_TEXTAREA_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import { clampMetaAdPrimaryText } from "@/lib/ppc/meta-ads-field-limits";
import type { MetaAdCopy, MetaAdRow } from "@/lib/ppc/meta-ads-types";
import { cn } from "@/lib/utils";
import { Button, TextareaField } from "@/ui";

export type MetaAdsInstagramPreviewProps = {
  row: MetaAdRow;
  copy: MetaAdCopy;
  onCaptionChange: (caption: string) => void;
  onDownloadImage?: () => void;
};

export function MetaAdsInstagramPreview({
  row,
  copy,
  onCaptionChange,
  onDownloadImage,
}: MetaAdsInstagramPreviewProps) {
  const imageSrc = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64 ?? null;

  return (
    <div className="mx-auto w-full max-w-sm bg-black">
      <p className="px-1 pb-2 text-base text-muted-foreground">Sponsored</p>

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
          value={copy.primaryText}
          aria-label="Instagram caption"
          onChange={(e) => onCaptionChange(clampMetaAdPrimaryText(e.target.value))}
        />
        <div className="flex items-center gap-2 pt-1">
          <span className="inline-flex h-8 items-center rounded-none bg-primary px-4 text-base font-medium text-primary-foreground">
            {copy.cta}
          </span>
        </div>
      </div>
    </div>
  );
}

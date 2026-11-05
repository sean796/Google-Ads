
import { SocialCreatorInstagramPreview } from "@/components/social/creator/SocialCreatorInstagramPreview";
import { SocialCreatorRowVisualSettingsInline } from "@/components/social/creator/SocialCreatorRowVisualSettingsInline";
import {
  META_VISUAL_CELL_CLASS,
  META_VISUAL_GRID_CLASS,
  META_VISUAL_TEXTAREA_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/social/creator/social-creator-visual-settings-layout";
import type { SocialCreatorRow, SocialGenerateConfig } from "@/lib/social/social-creator-types";
import { resolveMetaRowFocusKeyword } from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { TextareaField } from "@/ui";

export type SocialCreatorPostRowDetailsProps = {
  row: SocialCreatorRow;
  panelId?: string;
  fieldsReadOnly?: boolean;
  includeImage?: boolean;
  generateConfig: SocialGenerateConfig;
  onUpdateAd: (patch: Partial<SocialCreatorRow>) => void;
};

function downloadPostImage(row: SocialCreatorRow) {
  const src = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64;
  if (!src) return;
  const anchor = document.createElement("a");
  anchor.href = src;
  const label = resolveMetaRowFocusKeyword(row) || "social-post";
  anchor.download = `${label}-${row.id.slice(-6)}.png`;
  anchor.click();
}

export function SocialCreatorPostRowDetails({
  row,
  panelId,
  fieldsReadOnly,
  includeImage = true,
  generateConfig,
  onUpdateAd,
}: SocialCreatorPostRowDetailsProps) {
  const caption = row.fbInstagramContent ?? "";
  const showInstagramPreview = caption.length > 0;

  return (
    <div className="flex flex-col gap-3 px-0 pb-3 pt-0 sm:px-0" id={panelId}>
      {includeImage !== false && !showInstagramPreview ? (
        <>
          <div
            className={cn(
              metaVisualSettingsRowClass(0),
              META_VISUAL_GRID_CLASS,
              "items-start",
            )}
          >
            <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
              FB/Instagram Content
            </span>
            <TextareaField
              value={caption}
              placeholder="Optional draft caption"
              aria-label="FB/Instagram Content"
              disabled={fieldsReadOnly}
              onChange={(e) => onUpdateAd({ fbInstagramContent: e.target.value })}
            />
          </div>
          <SocialCreatorRowVisualSettingsInline
            row={row}
            generateConfig={generateConfig}
            stripeRowOffset={1}
            disabled={fieldsReadOnly}
            onUpdateAd={onUpdateAd}
          />
        </>
      ) : null}

      {showInstagramPreview ? (
        <SocialCreatorInstagramPreview
          row={row}
          caption={caption}
          onCaptionChange={(next) => onUpdateAd({ fbInstagramContent: next })}
          onDownloadImage={
            row.creative?.imagePreviewUrl || row.creative?.imageBase64
              ? () => downloadPostImage(row)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

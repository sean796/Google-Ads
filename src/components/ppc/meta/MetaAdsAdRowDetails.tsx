
import { MetaAdsInstagramPreview } from "@/components/ppc/meta/MetaAdsInstagramPreview";
import { MetaAdsRowVisualSettingsInline } from "@/components/ppc/meta/MetaAdsRowVisualSettingsInline";
import {
  META_VISUAL_CELL_CLASS,
  META_VISUAL_GRID_CLASS,
  META_VISUAL_TEXTAREA_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/ppc/meta/meta-ads-visual-settings-layout";
import type { MetaAdRow, MetaGenerateConfig } from "@/lib/ppc/meta-ads-types";
import { cn } from "@/lib/utils";
import { TextareaField } from "@/ui";

export type MetaAdsAdRowDetailsProps = {
  row: MetaAdRow;
  panelId?: string;
  fieldsReadOnly?: boolean;
  includeImage?: boolean;
  generateConfig: MetaGenerateConfig;
  onUpdateAd: (patch: Partial<MetaAdRow>) => void;
};

function downloadMetaImage(row: MetaAdRow) {
  const src = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64;
  if (!src) return;
  const anchor = document.createElement("a");
  anchor.href = src;
  anchor.download = `${row.adName.trim() || "meta-ad"}-${row.id.slice(-6)}.png`;
  anchor.click();
}

export function MetaAdsAdRowDetails({
  row,
  panelId,
  fieldsReadOnly,
  includeImage = true,
  generateConfig,
  onUpdateAd,
}: MetaAdsAdRowDetailsProps) {
  const copy = row.copy;
  const showInstagramPreview = Boolean(copy);

  const patchCopy = (patch: Partial<NonNullable<MetaAdRow["copy"]>>) => {
    if (!copy) return;
    onUpdateAd({ copy: { ...copy, ...patch } });
  };

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
              value={row.fbInstagramContent ?? ""}
              placeholder="Optional calendar draft copy"
              aria-label="FB/Instagram Content"
              disabled={fieldsReadOnly}
              onChange={(e) => onUpdateAd({ fbInstagramContent: e.target.value })}
            />
          </div>
          <MetaAdsRowVisualSettingsInline
            row={row}
            generateConfig={generateConfig}
            stripeRowOffset={1}
            disabled={fieldsReadOnly}
            onUpdateAd={onUpdateAd}
          />
        </>
      ) : null}

      {showInstagramPreview && copy ? (
        <MetaAdsInstagramPreview
          row={row}
          copy={copy}
          onCaptionChange={(caption) => patchCopy({ primaryText: caption })}
          onDownloadImage={
            row.creative?.imagePreviewUrl || row.creative?.imageBase64
              ? () => downloadMetaImage(row)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

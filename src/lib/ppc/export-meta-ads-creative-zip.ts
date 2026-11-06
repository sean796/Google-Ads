import { zipSync } from "fflate";
import { buildMetaAdDeliverableFiles, metaAdRowDisplayName } from "@/lib/ppc/meta-ad-deliverable-files";
import { buildMetaAdsExportCsv } from "@/lib/ppc/export-meta-ads-csv";
import { metaAdPlacementLabel } from "@/lib/ppc/meta-ads-field-limits";
import {
  resolveMetaRowAdName,
  resolveMetaRowFocusKeyword,
  type MetaAdDeliverableRow,
  type MetaAdRow,
} from "@/lib/ppc/meta-ads-types";

function sanitizeZipPart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "meta-ad";
}

export function metaAdsCreativeZipFilename(siteLabel: string): string {
  const slug = sanitizeZipPart(siteLabel.toLowerCase());
  const stamp = new Date().toISOString().slice(0, 10);
  return `meta-ads-creatives-${slug}-${stamp}.zip`;
}

function resolveCreativeImageSrc(row: MetaAdRow): string | null {
  const src = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64;
  return typeof src === "string" && src.trim() ? src.trim() : null;
}

function extensionForImageSrc(src: string): string {
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return "jpg";
  if (src.startsWith("data:image/webp")) return "webp";
  return "png";
}

export async function loadImageBytes(src: string): Promise<Uint8Array | null> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    if (comma < 0) return null;
    const base64 = src.slice(comma + 1);
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export function buildMetaAdCopySidecar(row: MetaAdDeliverableRow): string {
  const copy = row.copy;
  if (!copy) return "";
  const lines = [
    `Ad name: ${resolveMetaRowAdName(row)}`,
    `Keyword: ${resolveMetaRowFocusKeyword(row)}`,
    `Format: ${metaAdPlacementLabel(row.creative?.aspectRatio ?? row.config?.placement ?? "feed_1x1")}`,
    "",
    "Primary text:",
    copy.primaryText,
    "",
    `Headline: ${copy.headline}`,
    `Description: ${copy.description}`,
    `CTA: ${copy.cta}`,
    `Final URL: ${copy.finalUrl}`,
  ];
  if (row.imagePromptDescription?.trim()) {
    lines.push("", "Image prompt:", row.imagePromptDescription.trim());
  }
  return lines.join("\n");
}

export function metaAdRowHasZipExportContent(row: MetaAdRow): boolean {
  return (
    Boolean(resolveCreativeImageSrc(row)) ||
    Boolean(row.copy) ||
    Boolean(row.researchSections?.some((section) => section.status === "done" && section.markdown?.trim()))
  );
}

export function metaAdsRowsWithCreativeImages(rows: MetaAdRow[]): MetaAdRow[] {
  return rows.filter((row) => Boolean(resolveCreativeImageSrc(row)));
}

export function metaAdsRowsWithZipContent(rows: MetaAdRow[]): MetaAdRow[] {
  return rows.filter(metaAdRowHasZipExportContent);
}

export async function buildMetaAdsCreativeZipBlob(rows: MetaAdRow[]): Promise<Blob> {
  const exportRows = metaAdsRowsWithZipContent(rows);
  if (!exportRows.length) {
    throw new Error("No ad creatives to export.");
  }

  const files: Record<string, Uint8Array> = {};
  let index = 0;

  for (const row of exportRows) {
    index += 1;
    const prefix = `${String(index).padStart(2, "0")}-${sanitizeZipPart(metaAdRowDisplayName(row, index - 1))}`;
    const deliverables = buildMetaAdDeliverableFiles(row, prefix);
    for (const file of deliverables) {
      if (file.name.endsWith(".ref")) {
        const imageBytes = await loadImageBytes(file.content);
        if (imageBytes?.length) {
          files[`creatives/${prefix}.${extensionForImageSrc(file.content)}`] = imageBytes;
        }
        continue;
      }
      files[`creatives/${file.name}`] = new TextEncoder().encode(file.content);
    }
  }

  if (!Object.keys(files).length) {
    throw new Error("No ad creative files could be loaded for export.");
  }

  if (rows.some((row) => row.copy)) {
    files["meta-ads.csv"] = new TextEncoder().encode(buildMetaAdsExportCsv(rows));
  }

  const zipped = zipSync(files);
  return new Blob([zipped], { type: "application/zip" });
}

export function triggerMetaAdsCreativeZipDownload(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export async function exportMetaAdsCreativeZip(rows: MetaAdRow[], siteLabel: string): Promise<void> {
  const blob = await buildMetaAdsCreativeZipBlob(rows);
  triggerMetaAdsCreativeZipDownload(metaAdsCreativeZipFilename(siteLabel), blob);
}

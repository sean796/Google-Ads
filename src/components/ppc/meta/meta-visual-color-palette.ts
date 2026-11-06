import type { MetaAdColorPalette } from "@/lib/ppc/meta-ads-types";

export type MetaAdsColorColumnMode =
  | "heading"
  | "background"
  | "accent"
  | "primary"
  | "reset"
  | "empty";

export function metaVisualColorColumnMode(dataRowIndex: number): MetaAdsColorColumnMode {
  if (dataRowIndex === 0) return "background";
  if (dataRowIndex === 1) return "accent";
  if (dataRowIndex === 2) return "primary";
  if (dataRowIndex === 4) return "reset";
  return "empty";
}

export function patchMetaColorPalette(
  current: MetaAdColorPalette | undefined,
  key: keyof MetaAdColorPalette,
  color: string,
): MetaAdColorPalette | undefined {
  const next: MetaAdColorPalette = { ...current };
  if (color.trim()) {
    next[key] = color;
  } else {
    delete next[key];
  }
  if (!next.background && !next.accent && !next.primary) return undefined;
  return next;
}

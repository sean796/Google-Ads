import { createIdleSocialCreatorRow, type MetaAdColorPalette, type SocialCreatorRow } from "@/lib/social/social-creator-types";

export function syncSocialCreatorRowsToCount(
  rows: SocialCreatorRow[],
  targetCount: number,
  defaultColorPalette?: MetaAdColorPalette,
): SocialCreatorRow[] {
  const next = [...rows];

  while (next.length < targetCount) {
    next.push({
      ...createIdleSocialCreatorRow(),
      colorPalette: defaultColorPalette ? { ...defaultColorPalette } : undefined,
    });
  }

  while (next.length > targetCount) {
    const last = next[next.length - 1];
    if (last?.status === "idle" && !last.fbInstagramContent && !last.creative) {
      next.pop();
    } else {
      break;
    }
  }

  return next;
}

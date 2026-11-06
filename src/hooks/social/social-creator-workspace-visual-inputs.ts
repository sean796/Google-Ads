import type { SocialCreatorRow, SocialGenerateConfig } from "@/lib/social/social-creator-types";
import { resolveMetaGenerateVisualToolPaletteForGenerate } from "@/lib/social/social-creator-generate-config-defaults";
import { resolveMetaAdRowVisualToolPalette, rowHasManualVisualToolPalette } from "@/lib/ppc/meta-ad-visual-tool-themes";
import { emptyVisualToolPalette, migrateLegacyPeopleToolPalette, resolveAllowPeopleInImage } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";

export function resolveRowGenerateVisualInputs(sourceRow: SocialCreatorRow, config: SocialGenerateConfig) {
  const hasRowOverride = rowHasManualVisualToolPalette(sourceRow.visualToolPalette);
  const useFixedPalette = config.defaultVisualToolMode === "fixed" || hasRowOverride;
  const palette = migrateLegacyPeopleToolPalette(
    resolveMetaAdRowVisualToolPalette({
      rowPalette: sourceRow.visualToolPalette,
      defaultPalette: config.defaultVisualToolPalette,
    }) ?? emptyVisualToolPalette(),
    sourceRow.allowPeopleInImage,
  );
  return {
    visualToolPalette: useFixedPalette
      ? resolveMetaGenerateVisualToolPaletteForGenerate(palette)
      : undefined,
    allowPeopleInImage: resolveAllowPeopleInImage(palette, sourceRow.allowPeopleInImage),
    typographyStyle: resolveMetaTypographyStyle(
      sourceRow.typographyStyle ?? config.defaultTypographyStyle,
    ),
  };
}


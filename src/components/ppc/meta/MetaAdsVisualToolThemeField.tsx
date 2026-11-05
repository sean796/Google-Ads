import type { MetaAdVisualToolThemeId } from "@/lib/ppc/meta-ads-types";
import { MetaAdsDarkSelect } from "@/components/ppc/meta/MetaAdsDarkSelect";
import {
  META_AD_VISUAL_TOOL_THEMES,
  resolveMetaAdVisualToolThemeId,
} from "@/lib/ppc/meta-ad-visual-tool-themes";
import { cn } from "@/lib/utils";

export type MetaAdsVisualToolThemeFieldProps = {
  value?: MetaAdVisualToolThemeId;
  includeHeaderDefault?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (themeId: MetaAdVisualToolThemeId | undefined) => void;
};

const HEADER_DEFAULT_VALUE = "__header_default__";

export function MetaAdsVisualToolThemeField({
  value,
  includeHeaderDefault = false,
  disabled,
  className,
  onChange,
}: MetaAdsVisualToolThemeFieldProps) {
  const selectValue =
    includeHeaderDefault && value === undefined
      ? HEADER_DEFAULT_VALUE
      : resolveMetaAdVisualToolThemeId(value);

  const options = [
    ...(includeHeaderDefault ? [{ value: HEADER_DEFAULT_VALUE, label: "Header default" }] : []),
    ...META_AD_VISUAL_TOOL_THEMES.map((theme) => ({ value: theme.id, label: theme.label })),
  ];

  return (
    <MetaAdsDarkSelect
      value={selectValue}
      disabled={disabled}
      options={options}
      ariaLabel={
        includeHeaderDefault ? "Visual tool palette for this row" : "Default visual tool palette"
      }
      onChange={(next) => {
        if (includeHeaderDefault && next === HEADER_DEFAULT_VALUE) {
          onChange(undefined);
          return;
        }
        onChange(resolveMetaAdVisualToolThemeId(next));
      }}
    />
  );
}

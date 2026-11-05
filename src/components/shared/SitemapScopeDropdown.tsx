
import { generatorTitleRowPrimarySelectSlotProps } from "@/components/blog-generator/generator-title-row-select-width";
import { WORKSPACE_PRIMARY_SELECT_SLOT_CLASS, sitemapScopeDropdownReserveProps } from "@/components/shared/workspace-primary-select-styles";
import { SelectField } from "@/ui";

export type SitemapScopeDropdownOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type SitemapScopeDropdownProps = {
  options: SitemapScopeDropdownOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** @deprecated Use {@link sitemapScopeDropdownReserveProps}. */
export const SITEMAP_SCOPE_DROPDOWN_SLOT_CLASS = WORKSPACE_PRIMARY_SELECT_SLOT_CLASS;

export { sitemapScopeDropdownReserveProps };

export function SitemapScopeDropdown({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: SitemapScopeDropdownProps) {
  const enabled = options.filter((o) => !o.disabled);
  const resolvedValue = enabled.some((o) => o.id === value)
    ? value
    : (enabled[0]?.id ?? value);

  const slot = generatorTitleRowPrimarySelectSlotProps();

  return (
    <div className={slot.className} style={slot.style}>
      <SelectField
        placeholder={ariaLabel}
        value={resolvedValue}
        onValueChange={onChange}
        options={options.map((opt) => ({ value: opt.id, label: opt.label, disabled: opt.disabled }))}
        width="full"
        disabled={disabled}
      />
    </div>
  );
}
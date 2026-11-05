
import { BLOG_GENERATOR_SECTION_DEFS, type BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { generatorTitleRowPrimarySelectSlotProps } from "@/components/blog-generator/generator-title-row-select-width";
import { SelectField } from "@/ui";

export type BlogGeneratorSectionPillsProps = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  disabled?: boolean;
  /** Hide Opt when team lacks content-optimizer permission. */
  showOpt?: boolean;
};

export function BlogGeneratorSectionPills({
  activeSection,
  onSectionChange,
  disabled = false,
  showOpt = true,
}: BlogGeneratorSectionPillsProps) {
  const visibleSections = showOpt
    ? BLOG_GENERATOR_SECTION_DEFS
    : BLOG_GENERATOR_SECTION_DEFS.filter((s) => s.id !== "opt");

  const resolvedValue = visibleSections.some((s) => s.id === activeSection)
    ? activeSection
    : (visibleSections[0]?.id ?? activeSection);

  const slot = generatorTitleRowPrimarySelectSlotProps();

  return (
    <div className={slot.className} style={slot.style}>
      <SelectField
        placeholder="Generator mode"
        value={resolvedValue}
        onValueChange={(id) => {
          const next = id as BlogGeneratorSectionId;
          if (next !== activeSection) onSectionChange(next);
        }}
        options={visibleSections.map(({ id, label, icon }) => ({ value: id, label, icon }))}
        width="full"
        disabled={disabled}
      />
    </div>
  );
}

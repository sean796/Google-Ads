import { cn } from "@/lib/utils";
import { BULK_HEADER_TOOL_BTN, BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { ResearchSectionId } from "@/components/research/research-workspace-sections";

const MODES: { id: ResearchSectionId; label: string }[] = [
  { id: "research-proposal", label: "Proposal" },
];

export type ResearchToolbarModeMenuProps = {
  activeSection: ResearchSectionId;
  onSectionChange: (id: ResearchSectionId) => void;
  disabled?: boolean;
};

export function ResearchToolbarModeMenu({
  activeSection,
  onSectionChange,
  disabled = false,
}: ResearchToolbarModeMenuProps) {
  return (
    <>
      <div className="flex min-w-0 flex-nowrap items-center gap-0.5" aria-label="Research mode">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={activeSection === id}
            className={cn(
              BULK_HEADER_TOOL_BTN,
              "px-2.5",
              activeSection === id && "bg-primary text-black hover:bg-primary/90",
            )}
            onClick={() => onSectionChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
    </>
  );
}

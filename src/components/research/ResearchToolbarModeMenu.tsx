import { cn } from "@/lib/utils";
import { BULK_HEADER_TOOL_BTN, BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { ResearchSectionId } from "@/components/research/research-workspace-sections";
import { Button } from "@/ui";

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
          <Button
            pressed={activeSection === id}
            variant="quiet"
            key={id}
            disabled={disabled}
            aria-pressed={activeSection === id}
            onClick={() => onSectionChange(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
    </>
  );
}

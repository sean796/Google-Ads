import { cn } from "@/lib/utils";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import {
  DASHBOARD_SECTION_LABELS,
  DASHBOARD_SECTION_ORDER,
} from "@/components/manager/dashboard/dashboard-section-labels";
import {
  WORKSPACE_PRIMARY_SELECT_ITEM_CLASS,
  WORKSPACE_PRIMARY_SELECT_MENU_CLASS,
  WORKSPACE_PRIMARY_SELECT_TRIGGER_CLASS,
  workspacePrimarySelectSlotProps,
  workspacePrimarySelectWidthStyle,
} from "@/components/shared/workspace-primary-select-styles";
import { SelectField } from "@/ui";

export type DashboardSectionPillsProps = {
  activeSection: ManagerSettingsClusterId;
  onSectionChange: (id: ManagerSettingsClusterId) => void;
  disabled?: boolean;
  className?: string;
  sectionOrder?: readonly ManagerSettingsClusterId[];
};

export function DashboardSectionPills({
  activeSection,
  onSectionChange,
  disabled = false,
  className,
  sectionOrder = DASHBOARD_SECTION_ORDER,
}: DashboardSectionPillsProps) {
  const visibleSections = sectionOrder;
  const sectionLabels = visibleSections.map((id) => DASHBOARD_SECTION_LABELS[id]);

  const resolvedValue = visibleSections.some((id) => id === activeSection)
    ? activeSection
    : (visibleSections[0] ?? activeSection);

  const activeLabel = DASHBOARD_SECTION_LABELS[resolvedValue];

  const slot = workspacePrimarySelectSlotProps(sectionLabels);
  const menuWidth = workspacePrimarySelectWidthStyle(sectionLabels);

  return (
    <div className={cn(slot.className, className)} style={slot.style}>
      <SelectField placeholder="Dashboard section" value={resolvedValue} onValueChange={(id) => {
          const next = id as ManagerSettingsClusterId;
          if (next !== activeSection) onSectionChange(next);
        }} disabled={disabled} options={visibleSections.map((id) => ({ value: id, label: DASHBOARD_SECTION_LABELS[id] }))} />
    </div>
  );
}

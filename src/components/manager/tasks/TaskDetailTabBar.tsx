import type { ReactElement } from "react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type { TaskDetailTabBarProps } from "@/components/manager/tasks/task-detail-pane-types";

export function TaskDetailTabBar({
  tabs,
  activeTab,
  onChange,
}: TaskDetailTabBarProps): ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap gap-1 border-b border-border pb-3" role="tablist">
      {tabs.map((tab) => (
        <WorkspacePill
          key={tab.id}
          label={tab.label}
          active={activeTab === tab.id}
          square
          onClick={() => onChange(tab.id)}
        />
      ))}
    </div>
  );
}

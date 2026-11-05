import { Bot, ListTodo, MessageCircle, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileAppTab } from "./mobile-app-types";
import { Button } from "@/ui";

type MobileBottomNavProps = {
  activeTab: MobileAppTab;
  onTabChange: (tab: MobileAppTab) => void;
  runningAgentsCount: number;
  mentionUnreadCount: number;
};

const TAB_ITEMS: Array<{
  id: MobileAppTab;
  label: string;
  icon: typeof MessageCircle;
  center?: boolean;
}> = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "assist", label: "Assist", icon: Sparkles, center: true },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "automations", label: "Auto", icon: Zap },
];

export function MobileBottomNav({
  activeTab,
  onTabChange,
  runningAgentsCount,
  mentionUnreadCount,
}: MobileBottomNavProps) {
  return (
    <nav className="mobile-bottom-nav shrink-0" aria-label="Mobile app navigation">
      <div className="mobile-bottom-nav__inner">
        {TAB_ITEMS.map(({ id, label, icon: Icon, center }) => {
          const active = activeTab === id;
          const badge =
            id === "agents" && runningAgentsCount > 0
              ? runningAgentsCount
              : id === "chat" && mentionUnreadCount > 0
                ? mentionUnreadCount
                : 0;

          return (
            <Button
              pressed={Boolean(center)}
              variant="quiet"
              key={id}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              onClick={() => onTabChange(id)}
            >
              <span className="mobile-bottom-nav__icon-wrap">
                <Icon className="mobile-bottom-nav__icon" aria-hidden />
                {badge > 0 ? (
                  <span className="mobile-bottom-nav__badge" aria-hidden>
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="mobile-bottom-nav__label">{label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

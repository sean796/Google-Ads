import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useMobilePushContext } from "@/contexts/MobilePushContext";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { MobilePushDeepLink } from "@/lib/mobile-push/types";
import { useMobilePush } from "@/lib/mobile-push/use-mobile-push";
import { NEO_PULSE_BRAND_LIGHT_SRC } from "@/lib/neo-pulse-branding-assets";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileChatScreen } from "./MobileChatScreen";
import { MobileAssistScreen } from "./MobileAssistScreen";
import { MobileAgentsScreen } from "./MobileAgentsScreen";
import { MobileTasksScreen } from "./MobileTasksScreen";
import { MobileAutomationsScreen } from "./MobileAutomationsScreen";
import { MobileClientSitePicker } from "./MobileClientSitePicker";
import { MobilePushPrefsSheet } from "./MobilePushPrefsSheet";
import type { MobileAppTab } from "./mobile-app-types";
import { Button } from "@/ui";

type MobileChatPushNav = {
  channelId?: number;
  messageId?: number;
  threadRootId?: number;
};

export function MobileAppShell() {
  const { user } = useAuth();
  const { refreshTasksWorkspace, switchTeam, activeTeam } = useTeam();
  const { runs, selectRun } = useAgentRunsContext();
  const { applyDeepLink, pendingDeepLink, consumeDeepLink, setPushReady } = useMobilePushContext();
  const [activeTab, setActiveTab] = useState<MobileAppTab>("assist");
  const [mentionUnreadCount, setMentionUnreadCount] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [chatPushNav, setChatPushNav] = useState<MobileChatPushNav | null>(null);
  const [pushTaskId, setPushTaskId] = useState<number | null>(null);
  const [pushRunId, setPushRunId] = useState<number | null>(null);

  useEffect(() => {
    void refreshTasksWorkspace();
  }, [refreshTasksWorkspace]);

  const runningAgentsCount = useMemo(
    () => runs.filter((run) => !isAgentRunTerminal(run.status)).length,
    [runs],
  );

  const handleDeepLink = useCallback(
    async (link: MobilePushDeepLink) => {
      if (link.teamId > 0 && activeTeam?.id !== link.teamId) {
        await switchTeam(link.teamId);
      }
      setActiveTab(link.tab);
      if (link.tab === "chat") {
        setChatPushNav({
          channelId: link.channelId,
          messageId: link.messageId,
          threadRootId: link.threadRootId,
        });
        return;
      }
      if (link.tab === "tasks" && link.taskId) {
        setPushTaskId(link.taskId);
        return;
      }
      if (link.tab === "agents" && link.runId) {
        setPushRunId(link.runId);
        selectRun(link.runId);
      }
    },
    [activeTeam?.id, selectRun, switchTeam],
  );

  useMobilePush({
    enabled: Boolean(user),
    onDeepLink: (link) => {
      applyDeepLink(link);
      void handleDeepLink(link);
    },
    onReady: setPushReady,
  });

  useEffect(() => {
    if (!pendingDeepLink) return;
    void handleDeepLink(pendingDeepLink);
    consumeDeepLink();
  }, [consumeDeepLink, handleDeepLink, pendingDeepLink]);

  return (
    <div className="mobile-app-shell flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-black text-white">
      <header className="mobile-app-header shrink-0">
        <img src={NEO_PULSE_BRAND_LIGHT_SRC} alt="NEOPulse" className="mobile-app-header__logo" />
        <div className="mobile-app-header__end flex min-w-0 items-center gap-2">
          {activeTab === "assist" ? <MobileClientSitePicker /> : null}
          <Button
            size="icon" icon={Bell}
            variant="quiet"
            aria-label="Notification settings"
            onClick={() => setPrefsOpen(true)}
          ></Button>
          {runningAgentsCount > 0 ? (
            <span className="mobile-app-header__pill">{runningAgentsCount} running</span>
          ) : null}
        </div>
      </header>

      <main className="mobile-app-main min-h-0 flex-1 overflow-hidden">
        {activeTab === "chat" ? (
          <MobileChatScreen
            onMentionUnreadCountChange={setMentionUnreadCount}
            pushNav={chatPushNav}
            onPushNavHandled={() => setChatPushNav(null)}
          />
        ) : null}
        {activeTab === "assist" ? <MobileAssistScreen /> : null}
        {activeTab === "agents" ? (
          <MobileAgentsScreen pushRunId={pushRunId} onPushRunHandled={() => setPushRunId(null)} />
        ) : null}
        {activeTab === "tasks" ? (
          <MobileTasksScreen pushTaskId={pushTaskId} onPushTaskHandled={() => setPushTaskId(null)} />
        ) : null}
        {activeTab === "automations" ? <MobileAutomationsScreen /> : null}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        runningAgentsCount={runningAgentsCount}
        mentionUnreadCount={mentionUnreadCount}
      />

      <MobilePushPrefsSheet open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}

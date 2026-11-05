import React, { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatShellState } from "@/components/chat/layout/useChatShellState";
import { ChatSidebar } from "@/components/chat/sidebar/ChatSidebar";
import { ChatMessageList } from "@/components/chat/thread/ChatMessageList";
import { ChatComposer } from "@/components/chat/thread/ChatComposer";
import { ChatThreadPanel } from "@/components/chat/thread/ChatThreadPanel";
import { ChatNotificationPermissionPrompt } from "@/components/chat/ChatNotificationPermissionPrompt";
import { ChatPersonalizationModal } from "@/components/chat/settings/ChatPersonalizationModal";
import { ChatCallModal } from "@/components/chat/calls/ChatCallModal";
import { ChatIncomingCallModal } from "@/components/chat/calls/ChatIncomingCallModal";
import { ChatFloHuddleJoinPopup } from "@/components/chat/calls/ChatFloHuddleJoinPopup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatRichEditor } from "@/components/chat/editor/ChatRichEditor";
import { ChatDraftLinkPreviews } from "@/components/chat/editor/ChatDraftLinkPreviews";
import {
  CHAT_CHANNEL_TITLE_CLASS,
  CHAT_TEXT_MUTED,
  chatThemedRootClass,
} from "@/components/chat/chat-theme";
import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import { channelTitle, threadBarLabel } from "@/components/chat/layout/chat-shell-utils";
import { fetchMentionUnreadCount } from "@/lib/chat-api";
import type { ChatMessage } from "@/lib/chat-types";
import type { ChatShellViewModel } from "@/components/chat/layout/useChatShellState";
import { Button } from "@/ui";

type MobileChatScreenProps = {
  onMentionUnreadCountChange?: (count: number) => void;
  pushNav?: {
    channelId?: number;
    messageId?: number;
    threadRootId?: number;
  } | null;
  onPushNavHandled?: () => void;
};

function MobileChatSidebar({
  vm,
  onSelectChannel,
  onOpenConversation,
}: {
  vm: ChatShellViewModel;
  onSelectChannel: (channelId: number) => void;
  onOpenConversation: () => void;
}) {
  return (
    <ChatSidebar
      layoutMode="minimal"
      channels={vm.channels}
      activeChannelId={vm.activeChannelId}
      canWrite={vm.canWrite}
      onSelectChannel={onSelectChannel}
      onChannelCreated={vm.upsertChannel}
      onDmOpened={(channel) => {
        vm.upsertChannel(channel);
        onSelectChannel(channel.id);
      }}
      mentions={vm.mentions}
      mentionUnreadCount={vm.mentionUnreadCount}
      activeMentionMessageId={vm.activeMentionMessageId}
      onOpenMention={(item) => {
        vm.handleOpenMention(item);
        onOpenConversation();
      }}
      alerts={vm.alerts}
      activeAlertId={vm.activeAlertId}
      onOpenAlert={(alert) => {
        vm.handleOpenAlert(alert);
        onOpenConversation();
      }}
      onDismissAlert={vm.dismissAlert}
      sidebarSections={vm.themePrefs.appearance.sidebarSections}
      activeHuddles={vm.activeHuddles}
      starredChannelIds={vm.starredChannelIds}
      onToggleStarred={vm.toggleStarredChannel}
      zoneClassName="mobile-chat-sidebar-zone"
      zoneTheme="dark"
    />
  );
}

export function MobileChatScreen({
  onMentionUnreadCountChange,
  pushNav,
  onPushNavHandled,
}: MobileChatScreenProps) {
  const state = useChatShellState();
  const [showThread, setShowThread] = useState(false);
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false);
  const [visibleDay, setVisibleDay] = useState("");

  useEffect(() => {
    if (!state.ready) return;
    onMentionUnreadCountChange?.(state.mentionUnreadCount);
    let cancelled = false;
    void fetchMentionUnreadCount(state.teamId).then((count) => {
      if (!cancelled) onMentionUnreadCountChange?.(count);
    });
    return () => {
      cancelled = true;
    };
  }, [onMentionUnreadCountChange, state.ready, state.ready ? state.teamId : null, state.ready ? state.mentionUnreadCount : 0]);

  useEffect(() => {
    if (!state.ready || state.activeChannelId == null) return;
    setShowThread(true);
  }, [state.ready, state.ready ? state.activeChannelId : null]);

  useEffect(() => {
    setVisibleDay("");
  }, [state.ready ? state.activeChannelId : null]);

  useEffect(() => {
    if (!state.ready || !pushNav?.channelId) return;
    state.onSelectChannel(pushNav.channelId);
    setShowThread(true);
    setChannelDrawerOpen(false);
    if (pushNav.threadRootId) {
      const root = state.messages.find((message) => message.id === pushNav.threadRootId);
      if (root) state.openThread(root);
    } else if (pushNav.messageId) {
      state.setHighlightMessageId(pushNav.messageId);
    }
    onPushNavHandled?.();
  }, [
    onPushNavHandled,
    pushNav?.channelId,
    pushNav?.messageId,
    pushNav?.threadRootId,
    state.ready,
  ]);

  if (!state.ready) {
    return (
      <div className="mobile-screen mobile-screen--chat flex h-full items-center justify-center px-6 text-center">
        <p className="text-base text-muted-foreground">Select a team to use chat.</p>
      </div>
    );
  }

  const vm = state;
  const inConversation = showThread && vm.activeChannelId != null;

  const openChannel = (channelId: number) => {
    vm.onSelectChannel(channelId);
    setShowThread(true);
    setChannelDrawerOpen(false);
  };

  const openThread = (message: ChatMessage) => {
    vm.openThread(message);
    setShowThread(true);
    setChannelDrawerOpen(false);
  };

  const openChannelDrawer = () => {
    if (vm.threadRoot) vm.closeThread();
    setChannelDrawerOpen(true);
  };

  const channelLabel = vm.threadRoot
    ? threadBarLabel(vm.threadRoot)
    : channelTitle(vm.activeChannel, vm.activeChannelId);

  return (
    <div
      className={cn(
        chatThemedRootClass(SEO_WORKSPACE_TYPO_CLASS),
        "mobile-screen mobile-screen--chat flex h-full min-h-0 flex-col",
      )}
      data-chat-density="compact"
      data-zone-theme="dark"
    >
      {!inConversation ? (
        <div className="mobile-chat-inbox flex h-full min-h-0 w-full flex-col">
          <div className="mobile-chat-inbox-header flex shrink-0 items-center justify-between gap-2 px-2 py-2">
            <h2 className="px-2 text-base font-bold text-white">Messages</h2>
            {vm.activeChannelId != null ? (
              <Button
                variant="quiet"
                type="button"
                aria-label="Back to chat"
                onClick={() => setShowThread(true)}
              >
                <X className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 w-full flex-1 overflow-hidden">
            <MobileChatSidebar
              vm={vm}
              onSelectChannel={openChannel}
              onOpenConversation={() => setShowThread(true)}
            />
          </div>
        </div>
      ) : (
        <div className="mobile-chat-thread flex h-full min-h-0 w-full flex-col overflow-hidden">
          <div className="mobile-chat-header relative flex shrink-0 items-center gap-0 px-1 py-2">
            <Button
              variant="quiet"
              type="button"
              aria-label="Back to channels"
              onClick={() => {
                if (vm.threadRoot) {
                  vm.closeThread();
                  return;
                }
                setShowThread(false);
                setChannelDrawerOpen(false);
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="quiet"
              onClick={openChannelDrawer}
            >
              <h2 className={cn(CHAT_CHANNEL_TITLE_CLASS, "text-base")}>{channelLabel}</h2>
            </Button>
            {!vm.threadRoot && visibleDay ? (
              <span className="mobile-chat-header__date pointer-events-none absolute inset-x-0 text-center text-base font-semibold text-white">
                {visibleDay}
              </span>
            ) : null}
          </div>

          <ChatNotificationPermissionPrompt
            teamId={vm.teamId}
            onEnableDesktopAlerts={vm.handleEnableDesktopAlerts}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {vm.threadRoot && vm.activeChannelId ? (
              <ChatThreadPanel
                teamId={vm.teamId}
                channelId={vm.activeChannelId}
                threadRoot={vm.threadRoot}
                members={vm.mentionMembers}
                currentUserId={vm.user.id}
                canWrite={vm.canWrite}
                isTeamAdmin={vm.isTeamAdmin}
                loadThread={vm.loadThread}
                markThreadRead={vm.markThreadRead}
                sendMessage={vm.handleSend}
                pingTyping={vm.pingTyping}
                sending={vm.sending}
                highlightMessageId={vm.highlightMessageId}
                threadSearchQuery={vm.threadSearchQuery}
                onEdit={vm.handleEdit}
                onDelete={(message) => void vm.handleDeleteMessage(message)}
                onAiCorrect={vm.handleAiCorrect}
                composerRef={vm.threadComposerRef}
                userCardLayout
                compactToolbar
              />
            ) : vm.activeChannelId ? (
              <>
                <div className="neo-pulse-hide-scrollbar min-h-0 flex-1 overflow-y-auto">
                  <ChatMessageList
                    teamId={vm.teamId}
                    messages={vm.liveDisplayMessages}
                    currentUserId={vm.user.id}
                    hydrated={vm.isChannelHydrated}
                    canWrite={vm.canWrite}
                    isTeamAdmin={vm.isTeamAdmin}
                    highlightMessageId={vm.highlightMessageId}
                    threadUnreadMap={vm.threadUnreadMap}
                    userSentRef={vm.userSentRef}
                    searchActive={vm.messageSearchActive}
                    onHighlightDone={() => vm.setHighlightMessageId(null)}
                    onEdit={vm.handleEdit}
                    onDelete={(message) => void vm.handleDeleteMessage(message)}
                    onAiCorrect={vm.handleAiCorrect}
                    onReplyInThread={openThread}
                    userCardLayout
                    hideDayPills
                    onVisibleDayChange={setVisibleDay}
                  />
                </div>
                <ChatComposer
                  ref={vm.mainComposerRef}
                  teamId={vm.teamId}
                  channelId={vm.activeChannelId}
                  members={vm.mentionMembers}
                  disabled={!vm.canWrite || !vm.activeChannelId}
                  sending={vm.sending}
                  onSend={vm.handleSend}
                  onTyping={vm.pingTyping}
                  enterToSend={vm.themePrefs.behavior.enterToSend}
                  showLinkPreviews={vm.themePrefs.behavior.showLinkPreviews}
                  compactToolbar
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <p className={cn("text-base", CHAT_TEXT_MUTED)}>Select a channel</p>
              </div>
            )}
          </div>
        </div>
      )}

      {inConversation && channelDrawerOpen ? (
        <div className="mobile-chat-drawer fixed inset-0 z-50 flex flex-col bg-black">
          <div className="mobile-chat-drawer-header flex shrink-0 items-center justify-between gap-2 px-2 py-2">
            <h2 className="px-2 text-base font-bold text-white">Channels</h2>
            <Button
              variant="quiet"
              type="button"
              aria-label="Close channels"
              onClick={() => setChannelDrawerOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="min-h-0 w-full flex-1 overflow-hidden">
            <MobileChatSidebar vm={vm} onSelectChannel={openChannel} onOpenConversation={() => setShowThread(true)} />
          </div>
        </div>
      ) : null}

      {vm.personalizationOpen ? (
        <ChatPersonalizationModal open={vm.personalizationOpen} onOpenChange={vm.setPersonalizationOpen} />
      ) : null}

      <ChatIncomingCallModal
        call={vm.incomingCall}
        callerDisplayName={vm.incomingCallerName}
        onAccept={() => {
          if (vm.incomingCall) vm.setActiveChannelId(vm.incomingCall.channelId);
          void vm.acceptIncoming();
        }}
        onDecline={() => void vm.declineIncoming()}
      />
      <ChatFloHuddleJoinPopup
        open={vm.joinPopupOpen}
        channelLabel={channelTitle(vm.activeChannel, vm.activeChannelId)}
        huddle={vm.channelActiveHuddle}
        participantNames={vm.joinParticipantNames}
        onJoin={() => void vm.handleJoinChannelHuddle()}
        onDismiss={() => {
          if (vm.channelActiveHuddle) vm.setJoinDismissedCallId(vm.channelActiveHuddle.callId);
        }}
      />
      <ChatCallModal
        open={
          !vm.floCall && (vm.callPhase === "outgoing" || vm.callPhase === "active" || vm.callPhase === "ended")
        }
        phase={vm.callPhase}
        remoteDisplayName={vm.callRemoteName}
        localStream={vm.localStream}
        remoteStream={vm.remoteStream}
        muted={vm.callMuted}
        cameraOff={vm.callCameraOff}
        error={vm.callError}
        floMode={vm.floCall}
        floTranscript={vm.floTranscriptLines}
        onHangUp={() => void vm.hangUp()}
        onToggleMute={vm.toggleMute}
        onToggleCamera={vm.toggleCamera}
        onDismissEnded={vm.dismissEnded}
      />

      <Dialog
        open={vm.editTarget != null}
        onOpenChange={(open) => {
          if (!open) vm.setEditTarget(null);
        }}
      >
        <DialogContent className="bg-white text-black sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit message</DialogTitle>
          </DialogHeader>
          {vm.editTarget ? (
            <>
              <ChatRichEditor
                ref={vm.editEditorRef}
                key={vm.editTarget.id}
                members={vm.mentionMembers}
                content={vm.editTarget.bodyHtml}
                disabled={vm.editBusy}
                placeholder="Edit message…"
                onChange={vm.setEditHtml}
                onSubmit={() => void vm.handleSaveEdit()}
                showAiToolbar={!vm.editBusy}
                submitOnEnter={false}
              />
              <ChatDraftLinkPreviews teamId={vm.teamId} html={vm.editHtml} className="rounded-md border border-border" />
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="quiet" type="button" onClick={() => vm.setEditTarget(null)}>
              Cancel
            </Button>
            <Button variant="run" type="button" disabled={vm.editBusy} onClick={() => void vm.handleSaveEdit()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

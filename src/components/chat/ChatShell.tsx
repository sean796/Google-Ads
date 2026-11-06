import React from "react";

import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import { cn } from "@/lib/utils";
import { CHAT_TEXT_MUTED, chatRootDataAttrs, chatThemedRootClass } from "@/components/chat/chat-theme";
import { ChatPersonalizationModal } from "@/components/chat/settings/ChatPersonalizationModal";
import { ChatDraftLinkPreviews } from "@/components/chat/editor/ChatDraftLinkPreviews";
import { ChatRichEditor } from "@/components/chat/editor/ChatRichEditor";
import { ChatCallModal } from "@/components/chat/calls/ChatCallModal";
import { ChatIncomingCallModal } from "@/components/chat/calls/ChatIncomingCallModal";
import { ChatFloHuddleJoinPopup } from "@/components/chat/calls/ChatFloHuddleJoinPopup";
import { useChatShellState } from "@/components/chat/layout/useChatShellState";
import { ChatDefaultLayout } from "@/components/chat/layout/ChatDefaultLayout";
import { ChatMinimalLayout } from "@/components/chat/layout/ChatMinimalLayout";
import { channelTitle } from "@/components/chat/layout/chat-shell-utils";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui";

export function ChatShell(): React.ReactElement {
  const state = useChatShellState();

  if (!state.ready) {
    return (
      <div className={cn("flex h-full min-h-0 flex-1 items-center justify-center font-sans text-base")}>
        <p className={cn("text-base", CHAT_TEXT_MUTED)}>Select a team to use chat.</p>
      </div>
    );
  }

  const vm = state;
  const { appearance, layoutMode, personalizationOpen, setPersonalizationOpen } = vm;

  return (
    <div
      className={chatThemedRootClass(SEO_WORKSPACE_TYPO_CLASS)}
      {...chatRootDataAttrs(appearance)}
    >
      {layoutMode === "minimal" ? <ChatMinimalLayout vm={vm} /> : <ChatDefaultLayout vm={vm} />}

      {personalizationOpen ? (
        <ChatPersonalizationModal open={personalizationOpen} onOpenChange={setPersonalizationOpen} />
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
            <Button
              variant="quiet"
              type="button"
              onClick={() => vm.setEditTarget(null)}
            >
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

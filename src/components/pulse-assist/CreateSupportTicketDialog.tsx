import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton, Button, Field, TextareaField, Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/ui";

import { SupportChatLogAttachment } from "@/components/support/SupportChatLogAttachment";
import { supportChatLogFileName } from "@/components/support/support-chat-log-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { createSupportTicket, previewSupportTicketAi } from "@/lib/support-api";
import type { PulseAssistDebugLog } from "@/lib/pulse-assist/debug-log";
import { cn } from "@/lib/utils";

const CONTINUE_STATES = ["Continue", "Generating"] as const;
const CREATE_STATES = ["Create ticket", "Creating"] as const;

type CreateSupportTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatLog: PulseAssistDebugLog | null;
};

function SupportTicketDialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="support-ticket-dialog-overlay fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "support-ticket-dialog-content fixed left-[50%] top-[50%] grid w-full max-w-xl translate-x-[-50%] translate-y-[-50%] gap-4 bg-background p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function CreateSupportTicketDialog({
  open,
  onOpenChange,
  chatLog,
}: CreateSupportTicketDialogProps) {
  const { activeTeam: authActiveTeam } = useAuth();
  const { activeTeam: teamContextTeam } = useTeam();
  const activeTeam = teamContextTeam ?? authActiveTeam;
  const { navigateTo } = usePulseAssistContext();
  const [step, setStep] = useState<"describe" | "review">("describe");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);

  const resetForm = useCallback(() => {
    setStep("describe");
    setDescription("");
    setTitle("");
    setSummary("");
    setError("");
    setCreatedId(null);
    setLoadingAi(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleGenerate = async () => {
    if (!activeTeam?.id || !chatLog || !description.trim()) return;

    setLoadingAi(true);
    setError("");

    try {
      const result = await previewSupportTicketAi(activeTeam.id, {
        chatLog,
        comment: description.trim(),
      });
      if (!result.ok) {
        setError(result.error || "Could not generate title and summary");
        return;
      }
      setTitle(result.title || "");
      setSummary(result.summary || "");
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate title and summary");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTeam?.id || !chatLog) {
      setError("Select a team before creating a ticket.");
      return;
    }

    setSubmitting(true);
    setError("");

    const result = await createSupportTicket(activeTeam.id, {
      title: title.trim(),
      summary: summary.trim(),
      comment: description.trim(),
      source: "pulse-assist",
      chatLog,
      workspace: {
        managerTab: chatLog.workspace.managerTab,
        siteName: chatLog.workspace.pulseContext?.siteName,
        url: chatLog.app.url,
        deployGitSha: chatLog.app.deployGitSha,
        submode: chatLog.session.submode,
        targetScope: chatLog.session.targetScope,
      },
    });

    setSubmitting(false);

    if (!result.ok || !result.ticket) {
      setError(result.error || "Could not create ticket");
      return;
    }

    setCreatedId(result.ticket.id);
  };

  const handleOpenSupport = () => {
    handleOpenChange(false);
    navigateTo({ kind: "managerTab", tab: "support" });
  };

  const canGenerate = Boolean(activeTeam?.id && chatLog && description.trim() && !loadingAi);
  const canSubmit = Boolean(activeTeam?.id && chatLog && title.trim() && summary.trim() && !submitting);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <SupportTicketDialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a ticket</DialogTitle>
        </DialogHeader>

        {createdId ? (
          <div className="flex flex-col gap-3">
            <p className="text-base text-foreground">
              Ticket #{createdId} was created with the chat log attached.
            </p>
            <DialogFooter className="gap-1.5 sm:justify-start">
              <Button variant="run" onClick={handleOpenSupport}>
                Open Support
              </Button>
              <Button variant="tool" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : step === "describe" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <TextareaField
                rows={5}
                placeholder="What is the issue? Describe what went wrong or what you need help with"
                aria-label="What is the issue?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loadingAi}
              />
              <p className="text-base font-medium text-foreground">Attachment</p>
              <SupportChatLogAttachment chatLog={chatLog} fileName={supportChatLogFileName()} />
              {!activeTeam?.id ? (
                <p className="text-base text-destructive">No active team. Switch to a team before creating a ticket.</p>
              ) : null}
              {error ? <p className="text-base text-destructive">{error}</p> : null}
            </div>

            <DialogFooter className="gap-1.5 sm:justify-start">
              <ActionButton
                states={CONTINUE_STATES}
                state={loadingAi ? "Generating" : "Continue"}
                disabled={!canGenerate}
                onClick={() => void handleGenerate()}
              />
              <Button variant="tool" onClick={() => handleOpenChange(false)} disabled={loadingAi}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-medium text-foreground">Your description</p>
              <p className="text-base text-foreground">{description.trim()}</p>
              <Field
                placeholder="Title, a short issue title"
                aria-label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
              <TextareaField
                rows={4}
                placeholder="Summary, what went wrong?"
                aria-label="Summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                disabled={submitting}
              />
              <p className="text-base font-medium text-foreground">Attachment</p>
              <SupportChatLogAttachment chatLog={chatLog} fileName={supportChatLogFileName()} />
              {!activeTeam?.id ? (
                <p className="text-base text-destructive">No active team. Switch to a team before creating a ticket.</p>
              ) : null}
              {error ? <p className="text-base text-destructive">{error}</p> : null}
            </div>

            <DialogFooter className="gap-1.5 sm:justify-start">
              <ActionButton
                states={CREATE_STATES}
                state={submitting ? "Creating" : "Create ticket"}
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
              />
              <Button
                variant="tool"
                onClick={() => {
                  setError("");
                  setStep("describe");
                }}
                disabled={submitting}
              >
                Back
              </Button>
            </DialogFooter>
          </>
        )}
      </SupportTicketDialogContent>
    </Dialog>
  );
}
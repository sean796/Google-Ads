import { CheckCircle } from "lucide-react";
import { useGmbConnectionStatus } from "@/hooks/gbp-post/use-gmb-connection-status";
import { Button } from "@/ui";

const CONNECT_SLOT_CLASS = "inline-flex h-8 min-w-[6.75rem] shrink-0 items-center justify-center";

const CONNECTED_BTN_CLASS =
  `${CONNECT_SLOT_CLASS} gap-1.5 rounded-none border-0 bg-ui-field px-2.5 text-base font-medium text-primary shadow-none cursor-default`;

/**
 * Opens server OAuth flow (GET /api/gmb/authorize) in a new tab when not connected.
 */
export function GbpConnectGoogleBusinessButton({
  variant: _variant = "default",
}: {
  variant?: "default" | "toolbar" | "titleBar";
}) {
  const { connected, loading } = useGmbConnectionStatus();

  if (loading) {
    return (
      <span className={CONNECTED_BTN_CLASS} aria-live="polite">
        
      </span>
    );
  }

  if (connected) {
    return (
      <span className={CONNECTED_BTN_CLASS} aria-live="polite">
        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
        Connected
      </span>
    );
  }

  return (
    <Button
      variant="quiet"
      onClick={() => {
        window.open("/api/gmb/authorize", "_blank", "noopener,noreferrer");
      }}
    >
      Connect
    </Button>
  );
}

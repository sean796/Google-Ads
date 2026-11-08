import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, UserCheck } from "lucide-react";
import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import { CHAT_ICON_BTN_CLASS } from "@/components/chat/chat-theme";
import {
  getFlowAssistChatSettings,
  updateFlowAssistChatSettings,
} from "@/lib/wordpress-api/chat-flow-assist-settings";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

function resolveActiveWordPressSite(): WordPressSite | null {
  const sites = getStoredSites().filter(
    (site) => site.enabled !== false && site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim(),
  );
  if (!sites.length) return null;
  try {
    const activeId = localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
    if (activeId) {
      const match = sites.find((site) => site.id === activeId);
      if (match) return match;
    }
  } catch {
    /* ignore */
  }
  return sites[0] ?? null;
}

type ChatFrontendWidgetToggleProps = {
  disabled?: boolean;
};

/**
 * Team admin control: show Flow Assist on the active WordPress property frontend for logged-in WP users only.
 */
export function ChatFrontendWidgetToggle({ disabled = false }: ChatFrontendWidgetToggleProps): React.ReactElement | null {
  const site = useMemo(() => resolveActiveWordPressSite(), []);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!site) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getFlowAssistChatSettings(site);
      const enabled = result.enabled === true;
      const loggedInOnly = result.logged_in_only === true;
      setActive(enabled && loggedInOnly);
    } catch {
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async () => {
    if (!site || saving) return;
    const next = !active;
    setSaving(true);
    try {
      await updateFlowAssistChatSettings(site, {
        enabled: next,
        logged_in_only: next,
      });
      setActive(next);
    } finally {
      setSaving(false);
    }
  }, [active, saving, site]);

  if (!site) return null;

  const busy = disabled || loading || saving;

  return (
    <Button
      variant="quiet"
      type="button"
      aria-label={
        active
          ? "Flow Assist visible on site frontend for logged-in users. Click to disable."
          : "Enable Flow Assist on site frontend for logged-in users only"
      }
      title={
        active
          ? "Flow Assist on frontend (logged-in users only)"
          : "Show Flow Assist on frontend for logged-in users only"
      }
      disabled={busy}
      onClick={() => void handleToggle()}
    >
      {loading || saving ? (
        null
      ) : active ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <Globe className="h-4 w-4" />
      )}
    </Button>
  );
}

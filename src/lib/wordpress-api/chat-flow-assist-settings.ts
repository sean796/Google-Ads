import type { WordPressSite } from "@/components/integrations/types";
import { backendApiUrl } from "./connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type FlowAssistChatSettings = {
  enabled: boolean;
  logged_in_only: boolean;
};

async function postSettings(
  action: "flow-assist-chat-settings-get" | "flow-assist-chat-settings-update",
  site: WordPressSite,
  patch?: Partial<FlowAssistChatSettings>,
): Promise<FlowAssistChatSettings & { ok?: boolean }> {
  const response = await fetch(backendApiUrl(`/wordpress/${action}`), {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
      ...patch,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as FlowAssistChatSettings & {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || response.statusText || `HTTP ${response.status}`);
  }
  return data;
}

export async function getFlowAssistChatSettings(
  site: WordPressSite,
): Promise<FlowAssistChatSettings> {
  const data = await postSettings("flow-assist-chat-settings-get", site);
  return {
    enabled: data.enabled === true,
    logged_in_only: data.logged_in_only === true,
  };
}

export async function updateFlowAssistChatSettings(
  site: WordPressSite,
  patch: Partial<FlowAssistChatSettings>,
): Promise<FlowAssistChatSettings> {
  const data = await postSettings("flow-assist-chat-settings-update", site, patch);
  return {
    enabled: data.enabled === true,
    logged_in_only: data.logged_in_only === true,
  };
}

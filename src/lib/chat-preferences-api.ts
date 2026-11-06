import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ChatPreferencesPatch, ChatUserPreferences } from "@/lib/chat-preferences-types";
import { normalizeChatPreferences } from "@/lib/chat-preferences-types";

function api(path: string, options?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(backendApiUrl(p), {
    ...options,
    headers: neoPulseApiHeaders(options?.headers),
    credentials: "include",
    cache: "no-store",
  });
}

export async function fetchChatPreferences(teamId: number): Promise<ChatUserPreferences | null> {
  const res = await api(`/teams/${teamId}/chat/preferences`);
  const data = (await res.json()) as { ok?: boolean; prefs?: ChatUserPreferences };
  return data.ok && data.prefs ? normalizeChatPreferences(data.prefs) : null;
}

export async function patchChatPreferences(
  teamId: number,
  patch: ChatPreferencesPatch,
): Promise<{ ok: boolean; prefs?: ChatUserPreferences; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { ok?: boolean; prefs?: ChatUserPreferences; error?: string };
  return {
    ok: Boolean(data.ok),
    prefs: data.prefs ? normalizeChatPreferences(data.prefs) : undefined,
    error: data.error,
  };
}

export async function uploadChatAvatar(
  teamId: number,
  file: File,
): Promise<{ ok: boolean; avatarUrl?: string; error?: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const dataBase64 = btoa(binary);
  const res = await api(`/teams/${teamId}/chat/preferences/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataBase64,
      mime: file.type || "image/jpeg",
      fileName: file.name || "avatar.jpg",
    }),
  });
  const data = (await res.json()) as { ok?: boolean; avatarUrl?: string; error?: string };
  return { ok: Boolean(data.ok), avatarUrl: data.avatarUrl, error: data.error };
}

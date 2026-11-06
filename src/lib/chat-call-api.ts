import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ActiveHuddleSummary, ChatCall, ChatCallSignal, ChatCallTranscriptLine } from "@/lib/chat-call-types";

function api(path: string, options?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers = neoPulseApiHeaders(options?.headers);
  return fetch(backendApiUrl(p), { ...options, headers, credentials: "include", cache: "no-store" });
}

export async function startChatCall(
  teamId: number,
  channelId: number,
  options?: { floHuddle?: boolean },
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, floHuddle: options?.floHuddle !== false }),
  });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function joinChatHuddle(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/join`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function leaveChatHuddle(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/leave`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function fetchActiveHuddles(teamId: number): Promise<ActiveHuddleSummary[]> {
  const res = await api(`/teams/${teamId}/chat/calls/active`);
  const data = (await res.json()) as { ok?: boolean; huddles?: ActiveHuddleSummary[] };
  return data.huddles ?? [];
}

export async function fetchChatCall(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}`);
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function acceptChatCall(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/accept`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function declineChatCall(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/decline`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function endChatCall(
  teamId: number,
  callId: number,
): Promise<{ ok: boolean; call?: ChatCall; error?: string }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/end`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; call?: ChatCall; error?: string };
  return { ok: Boolean(data.ok), call: data.call, error: data.error };
}

export async function sendChatCallSignal(
  teamId: number,
  callId: number,
  payload: ChatCallSignal["payload"],
): Promise<{ ok: boolean }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const data = (await res.json()) as { ok?: boolean };
  return { ok: Boolean(data.ok) };
}

export async function pollChatCallSignals(
  teamId: number,
  callId: number,
  since: number,
): Promise<ChatCallSignal[]> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/signals?since=${since}`);
  const data = (await res.json()) as { ok?: boolean; signals?: ChatCallSignal[] };
  return data.signals ?? [];
}

export async function fetchIncomingChatCalls(teamId: number): Promise<ChatCall[]> {
  const res = await api(`/teams/${teamId}/chat/calls/incoming`);
  const data = (await res.json()) as { ok?: boolean; calls?: ChatCall[] };
  return data.calls ?? [];
}

export async function postChatCallTranscript(
  teamId: number,
  callId: number,
  payload: { text: string; displayName: string; spokenAtMs: number },
): Promise<{ ok: boolean }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean };
  return { ok: Boolean(data.ok) };
}

export async function fetchChatCallTranscript(
  teamId: number,
  callId: number,
): Promise<ChatCallTranscriptLine[]> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/transcript`);
  const data = (await res.json()) as { ok?: boolean; transcript?: ChatCallTranscriptLine[] };
  return data.transcript ?? [];
}

export async function postFloCallTranscribe(
  teamId: number,
  callId: number,
  payload: { dataBase64: string; format?: string; displayName: string; spokenAtMs: number },
): Promise<{ ok: boolean; userText?: string; floLine?: ChatCallTranscriptLine; error?: string; code?: string; addressed?: boolean }> {
  const res = await api(`/teams/${teamId}/chat/calls/${callId}/flo-transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    userText?: string;
    floLine?: ChatCallTranscriptLine;
    error?: string;
    code?: string;
    addressed?: boolean;
  };
  return {
    ok: Boolean(data.ok),
    userText: data.userText,
    floLine: data.floLine,
    error: data.error,
    code: data.code,
    addressed: data.addressed,
  };
}

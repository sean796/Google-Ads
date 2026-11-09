import { getSessionToken } from "@/lib/auth-device";
import { loadApiKey } from "@/lib/api";

/** Session + OpenRouter headers for neodigital.ca /api/* (Capacitor WebView needs Bearer). */
export function neoPulseApiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const hubToken =
    typeof process !== "undefined" && process.env?.PULSE_HOST_API_TOKEN
      ? process.env.PULSE_HOST_API_TOKEN.trim()
      : "";
  if (hubToken && !headers.has("X-Pulse-Host-Api-Token")) {
    headers.set("X-Pulse-Host-Api-Token", hubToken);
  }
  const openRouterKey = loadApiKey().trim();
  if (openRouterKey && !headers.has("X-OpenRouter-Api-Key")) {
    headers.set("X-OpenRouter-Api-Key", openRouterKey);
  }
  return headers;
}

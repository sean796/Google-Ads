import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { backendApiUrl } from "@/lib/wordpress-api/connection";

export async function fetchUrlTextViaApi(url: string): Promise<string> {
  try {
    const response = await fetch(backendApiUrl("/proxy/fetch-text"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url }),
    });
    if (!response.ok) return "";
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; content?: string };
    if (!data.ok || typeof data.content !== "string") {
      return "";
    }
    return data.content;
  } catch {
    return "";
  }
}

export function isAppApiUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/api/") || trimmed === "/api") return true;
  try {
    const parsed = new URL(trimmed, "https://neodigital.local");
    return parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export async function fetchImageDataUrlViaApi(url: string): Promise<string> {
  const response = await fetch(backendApiUrl("/images/fetch-data-url"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ url }),
  });
  const data = (await response.json()) as { success?: boolean; dataUrl?: string; error?: string };
  if (!response.ok || typeof data.dataUrl !== "string" || !data.dataUrl) {
    throw new Error(data.error?.trim() || `Could not fetch image (${response.status})`);
  }
  return data.dataUrl;
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

export async function fetchAppApiText(url: string): Promise<string> {
  if (!isAppApiUrl(url)) {
    throw new Error("File URL is not an app API path");
  }
  const resolved = url.startsWith("/api") ? backendApiUrl(url.replace(/^\/api/, "") || "/") : url;
  const response = await fetch(resolved, {
    credentials: "include",
    cache: "no-store",
    headers: neoPulseApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Could not fetch deliverable (${response.status})`);
  }
  return response.text();
}

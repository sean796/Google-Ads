import { backendApiUrl } from "@/lib/wordpress-api/connection";
import {
  parseOrganicClientReportDeckPayload,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveOrganicClientReportDeckId(searchParams: URLSearchParams): string {
  const deck = searchParams.get("deck")?.trim() ?? "";
  if (deck && UUID_RE.test(deck)) return deck;
  const hash = searchParams.get("hash")?.trim() ?? "";
  if (hash && UUID_RE.test(hash)) return hash;
  return "";
}

export async function saveOrganicClientReportDeckShare(
  deckId: string,
  payload: OrganicClientReportDeckPayload,
): Promise<void> {
  if (!UUID_RE.test(deckId.trim())) return;
  const response = await fetch(backendApiUrl("/organic-dashboard/client-report/save"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deckId: deckId.trim(), payload }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : `Client report save HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function fetchOrganicClientReportDeckShare(
  deckId: string,
  siteIdHint: string,
): Promise<OrganicClientReportDeckPayload | null> {
  if (!UUID_RE.test(deckId.trim())) return null;
  const params = new URLSearchParams({ deckId: deckId.trim() });
  const hinted = siteIdHint.trim();
  if (hinted) params.set("siteId", hinted);
  let response: Response;
  try {
    response = await fetch(backendApiUrl(`/organic-dashboard/client-report/load?${params.toString()}`), {
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return null;
  }
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    payload?: unknown;
    error?: string;
  };
  if (!response.ok || !data.ok || !data.payload) {
    return null;
  }
  const payloadSiteId =
    data.payload &&
    typeof data.payload === "object" &&
    typeof (data.payload as { siteId?: unknown }).siteId === "string"
      ? (data.payload as { siteId: string }).siteId.trim()
      : "";
  const parseHint = payloadSiteId || hinted;
  return parseOrganicClientReportDeckPayload(parseHint, data.payload);
}

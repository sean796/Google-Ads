import { useEffect } from "react";
import { buildOrganicClientReportLinkPreviewMeta } from "@/lib/organic-dashboard/organic-client-report-link-preview";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";

const META_KEYS = [
  "description",
  "og:title",
  "og:description",
  "og:type",
  "twitter:title",
  "twitter:description",
] as const;

function upsertMeta(property: string, content: string, attr: "name" | "property"): void {
  if (!content.trim()) return;
  const selector = `meta[${attr}="${property}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useOrganicClientReportDocumentMeta(
  payload: OrganicClientReportDeckPayload | null,
): void {
  useEffect(() => {
    if (!payload) return;
    const { title, description } = buildOrganicClientReportLinkPreviewMeta(payload);
    document.title = title;
    upsertMeta("description", description, "name");
    upsertMeta("og:title", title, "property");
    upsertMeta("og:description", description, "property");
    upsertMeta("og:type", "article", "property");
    upsertMeta("twitter:title", title, "name");
    upsertMeta("twitter:description", description, "name");
    return () => {
      for (const key of META_KEYS) {
        const attr = key.startsWith("og:") ? "property" : "name";
        document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
      }
    };
  }, [payload]);
}

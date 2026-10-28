import { fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";

async function toDataUrlIfRemote(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return trimmed;
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      const isRelative = trimmed.startsWith("/");
      const isSameOrigin = trimmed.startsWith(window.location.origin);
      if (isRelative || isSameOrigin) {
        const fullUrl = isRelative ? `${window.location.origin}${trimmed}` : trimmed;
        const res = await fetch(fullUrl);
        if (res.ok) {
          const blob = await res.blob();
          return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string) || trimmed);
            reader.onerror = () => resolve(trimmed);
            reader.readAsDataURL(blob);
          });
        }
      }
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return await fetchImageDataUrlViaApi(trimmed);
    }
    return trimmed;
  } catch (err) {
    console.warn("Could not pre-fetch logo data URL for PDF capture, using original URL:", err);
    return trimmed;
  }
}

/** Preload remote cover logos for html2canvas (avoids CORS on client domains). */
export async function withOrganicClientReportCoverDataUrls(
  content: OrganicClientReportContent,
): Promise<OrganicClientReportContent> {
  const [agencyLogoUrl, clientLogoUrl] = await Promise.all([
    toDataUrlIfRemote(content.agencyLogoUrl),
    content.clientLogoUrl.trim()
      ? toDataUrlIfRemote(content.clientLogoUrl)
      : Promise.resolve(content.clientLogoUrl),
  ]);
  return { ...content, agencyLogoUrl, clientLogoUrl };
}

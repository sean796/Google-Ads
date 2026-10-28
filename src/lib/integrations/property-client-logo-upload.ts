import { backendApiUrl } from "@/lib/wordpress-api/connection";

export async function uploadPropertyClientLogo(
  siteId: string,
  dataUrl: string,
): Promise<string> {
  const id = siteId.trim();
  if (!id) {
    throw new Error("Save the property before uploading a logo.");
  }

  const res = await fetch(backendApiUrl("/manager-wordpress-properties/client-logo/upload"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: id, dataUrl }),
  });

  const data = (await res.json()) as { ok?: boolean; logoUrl?: string; error?: string };
  if (!res.ok || !data.ok || !data.logoUrl?.trim()) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }

  const base = data.logoUrl.trim();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${Date.now()}`;
}

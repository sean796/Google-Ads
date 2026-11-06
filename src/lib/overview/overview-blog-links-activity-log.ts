import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

export function logBlogLinksActivity(
  event: string,
  data: Record<string, string | number | boolean | null | undefined>,
): void {
  const payload = { event, ...data, ts: Date.now() };
  const base = BACKEND_API_BASE?.trim();
  if (!base) return;
  fetch(`${base}/api/overview/blog-links-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";

export function formatRevisionTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function triggerRevisionsJsonDownload(
  list: OverviewStudioRevision[],
  filename = "studio-revisions.json",
): void {
  const blob = new Blob([JSON.stringify(list, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printOverviewStudioRevisionsReport(): void {
  document.body.classList.add("overview-revisions-printing");
  window.print();
  window.requestAnimationFrame(() => {
    document.body.classList.remove("overview-revisions-printing");
  });
}

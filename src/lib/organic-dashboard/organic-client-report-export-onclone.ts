const EXPORT_BG = "#ffffff";
const EXPORT_FG = "#18181b";

/** Ensures the cloned document for html2canvas has an unclipped light-theme canvas. */
export function applyOrganicClientReportExportOnclone(clonedDoc: Document): void {
  const html = clonedDoc.documentElement;
  const body = clonedDoc.body;
  html.style.background = EXPORT_BG;
  html.style.color = EXPORT_FG;
  html.style.height = "auto";
  html.style.overflow = "visible";
  body.style.background = EXPORT_BG;
  body.style.color = EXPORT_FG;
  body.style.margin = "0";
  body.style.height = "auto";
  body.style.overflow = "visible";

  const host = clonedDoc.querySelector<HTMLElement>(".organic-client-report-pdf-capture-host");
  if (host) {
    host.style.position = "static";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "1";
    host.style.opacity = "1";
  }
}

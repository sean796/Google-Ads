import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  ORGANIC_CLIENT_REPORT_PDF_CAPTURE_CLASS,
  ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX,
} from "@/lib/organic-dashboard/organic-client-report-pdf-types";

const CAPTURE_HOST_CLASS = "organic-client-report-pdf-capture-host";

export type OrganicClientReportPdfCaptureHandle = {
  rootElement: HTMLElement;
  cleanup: () => void;
};

/** Mounts white export markup off-screen for html2canvas capture with synchronous DOM commit. */
export async function mountOrganicClientReportPdfCapture(
  content: OrganicClientReportContent,
): Promise<OrganicClientReportPdfCaptureHandle> {
  const host = document.createElement("div");
  host.className = CAPTURE_HOST_CLASS;
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX}px;background:#ffffff;color:#18181b;overflow:visible;pointer-events:none;opacity:1;z-index:-1;`;
  document.body.appendChild(host);

  let reactRoot: Root | null = createRoot(host);
  flushSync(() => {
    reactRoot!.render(<OrganicClientReportExportDocument content={content} />);
  });

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  const article = host.querySelector("article.organic-client-report-export");
  if (!(article instanceof HTMLElement)) {
    reactRoot.unmount();
    host.remove();
    throw new Error("Export report markup is missing.");
  }

  article.classList.add(ORGANIC_CLIENT_REPORT_PDF_CAPTURE_CLASS);

  return {
    rootElement: article,
    cleanup: () => {
      reactRoot?.unmount();
      reactRoot = null;
      host.remove();
    },
  };
}

import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrganicClientReportCover, type OrganicClientReportCoverProps } from "../OrganicClientReportCover";

function renderCover(props: OrganicClientReportCoverProps): string {
  return renderToStaticMarkup(
    createElement(TooltipProvider, null, createElement(OrganicClientReportCover, props)),
  );
}

const base = {
  siteName: "In the Shade",
  siteUrl: "intheshadeflorida.com",
  periodLine: "Aug 1 - Oct 31, 2026",
  preparedOn: "Nov 4, 2026",
  agencyLogoUrl: "/branding/neodigital-logo.png",
  clientLogoUrl: "https://neo-pulse-static.onrender.com/api/manager-wordpress-properties/client-logo/wp-1791924906059-5",
};

describe("OrganicClientReportCover client logo box", () => {
  it("renders the client logo as an HTML img overlay on a white box", () => {
    const html = renderCover({ ...base, clientLogoBoxTheme: "white" });
    expect(html).toContain('fill="#ffffff"');
    expect(html).toContain('data-report-cover-logo="client"');
    expect(html).toContain('class="organic-client-report-export__cover-client-logo"');
    expect(html).toContain(`src="${base.clientLogoUrl}"`);
    expect(html).not.toContain("<foreignObject");
  });

  it("defaults to a black box and shows the site name only when there is no logo", () => {
    const html = renderCover({ ...base, clientLogoUrl: "" });
    expect(html).toContain('fill="#02050a"');
    expect(html).not.toContain('data-report-cover-logo="client"');
    expect(html).toContain(">In the Shade</text>");
  });
});

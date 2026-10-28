import { useId } from "react";
import { cn } from "@/lib/utils";
import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import {
  cleanTakeawayBulletText,
  isNonExistentSectionOmissionStatement,
  stripNonExistentOmissionClauses,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { toExportTitleCase } from "@/lib/organic-dashboard/organic-client-report-copy";

export type OrganicClientReportCoverProps = {
  siteName: string;
  siteUrl: string;
  periodLine: string;
  preparedOn: string;
  agencyLogoUrl: string;
  clientLogoUrl: string;
  clientLogoBoxTheme?: "black" | "white";
  onToggleTheme?: () => void;
  executiveSummary?: string;
  keyTakeaways?: string[];
  insightsLoading?: boolean;
  insightsError?: string | null;
  totalPages?: number;
  className?: string;
};

/**
 * Geometric corporate network globe emblem matching Neo Digital branding.
 * Uses Neo Digital deep black #02050a and signature lime green #84bd00 node points.
 */
function ReportNetworkGlobeEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 84 84"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Network globe emblem"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer hexagon */}
      <polygon
        points="42,7 74,25.5 74,62.5 42,81 10,62.5 10,25.5"
        fill="none"
        stroke="#02050a"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Globe grid lines */}
      <line x1="42" y1="7" x2="42" y2="81" stroke="#02050a" strokeWidth="2.5" />
      <line x1="10" y1="44" x2="74" y2="44" stroke="#02050a" strokeWidth="2.5" />
      {/* Latitude arcs */}
      <path
        d="M 18,28 Q 42,37 66,28"
        fill="none"
        stroke="#02050a"
        strokeWidth="2"
      />
      <path
        d="M 18,60 Q 42,51 66,60"
        fill="none"
        stroke="#02050a"
        strokeWidth="2"
      />
      {/* Longitude ellipses */}
      <ellipse
        cx="42"
        cy="44"
        rx="16"
        ry="36"
        fill="none"
        stroke="#02050a"
        strokeWidth="2"
      />
      {/* Neo Digital Lime Green network node vertices */}
      <circle cx="42" cy="7" r="4.5" fill="#84bd00" />
      <circle cx="74" cy="25.5" r="4.5" fill="#84bd00" />
      <circle cx="74" cy="62.5" r="4.5" fill="#84bd00" />
      <circle cx="42" cy="81" r="4.5" fill="#84bd00" />
      <circle cx="10" cy="62.5" r="4.5" fill="#84bd00" />
      <circle cx="10" cy="25.5" r="4.5" fill="#84bd00" />
      <circle cx="42" cy="44" r="4" fill="#84bd00" />
    </svg>
  );
}

/**
 * Executive Report Cover:
 * - Neo Digital logo positioned top-right, perfectly flush with the top edge of the lime green triangle
 * - Geometric header banner with square framed client logo in Neo brand palette (#84bd00 & #02050a)
 * - Unbroken single-line "Performance Report" title with client metadata byline & network emblem
 * - Integrated Insights Box with Neo brand lime green accent border (Executive Summary + Key Takeaways)
 */
export function OrganicClientReportCover({
  siteName,
  siteUrl,
  periodLine,
  preparedOn,
  agencyLogoUrl,
  clientLogoUrl,
  clientLogoBoxTheme = "black",
  onToggleTheme,
  executiveSummary = "",
  keyTakeaways = [],
  insightsLoading = false,
  insightsError = null,
  totalPages,
  className,
}: OrganicClientReportCoverProps) {
  const clipId = useId().replace(/:/g, "");
  const clientLogo = clientLogoUrl?.trim() ?? "";
  const agencyLogo = agencyLogoUrl?.trim() || "/branding/neodigital-logo.png";
  const name = siteName?.trim() || "Client";
  const url = siteUrl?.trim() || "";
  const summaryText = stripNonExistentOmissionClauses(executiveSummary.trim());
  const isWhiteBox = clientLogoBoxTheme === "white";
  const boxFill = isWhiteBox ? "#ffffff" : "#02050a";
  const fallbackTextColor = isWhiteBox ? "#02050a" : "#ffffff";

  return (
    <div className={cn("organic-client-report-export__cover-wrapper", className)}>
      {/* Hero Banner: Neo brand triangle and Neo Digital logo start at the exact same top edge */}
      <div className="organic-client-report-export__cover-hero-banner">
        {/* Top-Right Logo: Flush with the top of the container and lime triangle */}
        <div className="organic-client-report-export__cover-top-logo-slot">
          {agencyLogo ? (
            <img
              src={agencyLogo}
              alt="Neo Digital"
              className="organic-client-report-export__cover-agency-logo"
              data-report-cover-logo="agency"
            />
          ) : (
            <span className="text-xl font-bold tracking-tight text-[#02050a]">
              Neo Digital
            </span>
          )}
        </div>

        {/* Vector Artwork: Balanced banner with perpendicular square logo box (rx=0, no rounded radius) */}
        <svg
          viewBox="0 0 720 270"
          className="organic-client-report-export__cover-graphic-svg"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Cover design graphic"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={365 + 4}
                y={79.5 + 4}
                width={240 - 8}
                height={105 - 8}
                rx={0}
              />
            </clipPath>
          </defs>

          {/* Top-Left Neo Brand Lime Green Triangle - flush with top edge */}
          <polygon points="0,0 260,0 0,220" fill="#84bd00" />

          {/* Neo Brand Lime Green Curved Accent Wing below frame */}
          <path
            d="M 425,182 C 475,242 560,232 720,208 L 720,251 C 540,278 450,253 395,194 Z"
            fill="#84bd00"
          />

          {/* Client Logo Solid Box Base - square corners, perpendicular to sides (rx=0) */}
          <g
            role={onToggleTheme ? "button" : undefined}
            tabIndex={onToggleTheme ? 0 : undefined}
            onClick={onToggleTheme}
            className={onToggleTheme ? "cursor-pointer select-none" : undefined}
            aria-label={onToggleTheme ? "Toggle logo box black or white theme" : undefined}
          >
            <rect
              x={365}
              y={79.5}
              width={240}
              height={105}
              rx={0}
              fill={boxFill}
            />

            {/* Inner Client Logo Viewport - uniform fit with preserveAspectRatio meet */}
            {clientLogo ? (
              <image
                href={clientLogo}
                xlinkHref={clientLogo}
                x={365 + 14}
                y={79.5 + 10}
                width={240 - 28}
                height={105 - 20}
                preserveAspectRatio="xMidYMid meet"
                clipPath={`url(#${clipId})`}
                data-report-cover-logo="client"
              />
            ) : (
              <g clipPath={`url(#${clipId})`}>
                <text
                  x={485}
                  y={132}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={fallbackTextColor}
                  fontSize="20"
                  fontWeight="700"
                  fontFamily="Lato, system-ui, sans-serif"
                >
                  {name.length > 22 ? `${name.slice(0, 21)}…` : name}
                </text>
              </g>
            )}

            {/* Square Box Outer Stroke - perpendicular to sides with crisp 90-degree corners (rx=0) */}
            <rect
              x={365}
              y={79.5}
              width={240}
              height={105}
              rx={0}
              fill="none"
              stroke="#02050a"
              strokeWidth={4}
            />
          </g>
        </svg>
      </div>

      {/* Cover Title & Byline (One unbroken line) */}
      <div className="organic-client-report-export__cover-content">
        <div className="organic-client-report-export__cover-title-row">
          <div className="organic-client-report-export__cover-title-heading">
            <h1 className="organic-client-report-export__cover-title-text">
              {toExportTitleCase("Performance Report")}
            </h1>
            <p className="organic-client-report-export__cover-client-name">
              {name}
            </p>
            <p className="organic-client-report-export__cover-byline">
              {url ? <span className="text-slate-600">{url}</span> : null}
              {url && periodLine ? <span> • </span> : null}
              {periodLine ? (
                <span className="font-semibold text-[#84bd00]">{periodLine}</span>
              ) : null}
              {(url || periodLine) && preparedOn ? <span> • </span> : null}
              {preparedOn ? <span>Prepared {preparedOn}</span> : null}
            </p>
          </div>
          <ReportNetworkGlobeEmblem className="organic-client-report-export__cover-emblem" />
        </div>

        {/* Insights Box (Integrated with Neo Digital signature brand styling) */}
        <div className="organic-client-report-export__cover-insights-box">
          <h2 className="organic-client-report-export__cover-insights-heading">
            {toExportTitleCase("Insights")}
          </h2>

          {summaryText ? (
            <p className="organic-client-report-export__cover-insights-summary">
              <OrganicClientReportInlineText text={summaryText} />
            </p>
          ) : insightsLoading ? (
            <p className="organic-client-report-export__cover-insights-summary text-slate-500 italic">
              Generating executive summary…
            </p>
          ) : insightsError ? (
            <p className="organic-client-report-export__cover-insights-summary text-rose-600">
              {insightsError}
            </p>
          ) : null}

          {(() => {
            const visibleTakeaways = keyTakeaways
              .map((t) => cleanTakeawayBulletText(stripNonExistentOmissionClauses(t)))
              .filter(
                (t) => t.length > 0 && !isNonExistentSectionOmissionStatement(t),
              );
            if (visibleTakeaways.length === 0) return null;
            return (
              <div className="organic-client-report-export__cover-insights-takeaways">
                <h3 className="organic-client-report-export__cover-insights-takeaways-title">
                  {toExportTitleCase("Key Takeaways")}
                </h3>
                <ul className="organic-client-report-export__cover-insights-bullets">
                  {visibleTakeaways.map((takeaway, idx) => {
                    const text = cleanTakeawayBulletText(takeaway);
                    return (
                      <li
                        key={`${idx}-${text}`}
                        className="organic-client-report-export__cover-insights-bullet-item"
                      >
                        <span
                          className="organic-client-report-export__cover-insights-bullet-dot"
                          aria-hidden="true"
                        />
                        <span className="organic-client-report-export__cover-insights-bullet-text">
                          <OrganicClientReportInlineText text={text} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </div>
        <footer className="organic-client-report-export__sheet-footer mt-auto pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Neo Digital Inc</span>
          <span className="tabular-nums">
            Prepared {preparedOn}
            {totalPages ? ` • Page 1 of ${totalPages}` : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}

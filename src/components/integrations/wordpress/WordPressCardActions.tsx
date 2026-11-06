import React from "react";
import { TestTube, Map, Network, Database, CheckCircle2, XCircle, BarChart3, Building2, Download } from "lucide-react";
import { getCyberpunkTextClasses } from "./cyberpunk-theme";
import { cn } from "@/lib/utils";
import { PROFILE_CARD, PROFILE_CARD_HEAD, PROFILE_CARD_TITLE } from "@/components/hosting/site-profile/site-profile-theme";
import { Button } from "@/ui";
import type { ConnectionAction, WordPressCardActionsProps } from "./wordpress-card-actions-types";
import { useWordPressCardActions } from "./use-wordpress-card-actions";

export const WordPressCardActions: React.FC<WordPressCardActionsProps> = ({
  site,
  isTesting,
  isDetecting,
  isExtractingNAPAndGraph,
  onTest,
  onDetect,
  onExtractNAPAndGraph,
  onPatchSite,
  tone = "card",
  layout = "default",
}) => {
  const isPropertyBlack = tone === "propertyBlack";
  const isProfileCard = layout === "profileCard";
  const isDisabled = site.enabled === false;
  const {
    isTestingNeoFields,
    isTestingGA,
    isTestingGMB,
    isPullingGMBStats,
    neoFieldsTestResult,
    handlePullGMBStats,
    handleTestGMB,
    handleTestGA,
    handleTestNeoFields,
  } = useWordPressCardActions(site);
  /** Label column in action rows — stays white on black when disabled. */
  const rowLabel = cn("min-w-0 flex-1", isPropertyBlack && "text-white");

  /** Flat action row: fixed icon column; sits in a compact grid cell. */
  const iconSlot = cn(
    "flex shrink-0 items-center justify-center [&>svg]:shrink-0",
    isPropertyBlack
      ? "h-7 w-8 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-white"
      : "h-8 w-9 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-foreground",
  );
  const rowBase = cn(
    "flex w-full max-w-full items-center justify-start gap-0 rounded-md text-left font-medium shadow-none outline-none transition-colors",
    isPropertyBlack
      ? "min-h-8 border-0 bg-transparent px-1.5 py-0.5 text-xs text-white hover:bg-white/[0.08] active:bg-white/[0.1]"
      : "min-h-9 border-0 bg-transparent px-2 py-1 text-xs hover:bg-foreground/[0.07] active:bg-foreground/[0.09] sm:text-sm",
    !isPropertyBlack && "text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isPropertyBlack ? "focus-visible:ring-offset-black" : "focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:hover:bg-transparent",
    isPropertyBlack
      ? "disabled:!opacity-100 disabled:cursor-not-allowed disabled:text-white"
      : "disabled:opacity-50 disabled:hover:bg-transparent",
  );

  const sectionShell = isPropertyBlack
    ? "flex min-h-0 w-full min-w-0 shrink-0 flex-col rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 shadow-none ring-0 sm:px-4 sm:py-4"
    : "min-w-0 rounded-lg border border-border/50 bg-muted/40 p-2 shadow-none ring-0";

  const sectionTitle = isPropertyBlack
    ? "mb-3 shrink-0 text-base font-semibold tracking-tight text-white [word-spacing:0.2em] sm:mb-4 sm:text-xs"
    : "mb-1.5 text-xs font-semibold tracking-tight text-foreground sm:text-sm";

  const actionGrid =
    "mt-0 grid w-full min-w-0 list-none grid-cols-1 p-0 sm:grid-cols-2 " +
    (isPropertyBlack ? "gap-0 sm:gap-x-0.5 sm:gap-y-0" : "gap-0.5 sm:gap-x-1 sm:gap-y-0.5");

  const actionGridScroll = actionGrid;
  const connectionActions: ConnectionAction[] = [
    {
      key: "test",
      label: isTesting ? "Testing Connection…" : "Test Connection",
      icon: isTesting ? null : <TestTube />,
      onClick: onTest,
      disabled: isTesting || isDisabled,
    },
    {
      key: "neoFields",
      label: isTestingNeoFields
        ? "Testing NEO Fields…"
        : neoFieldsTestResult?.success
          ? "NEO Fields OK"
          : neoFieldsTestResult?.success === false
            ? "NEO Fields Failed"
            : "Test NEO Fields",
      icon: isTestingNeoFields ? (
        null
      ) : neoFieldsTestResult?.success ? (
        <CheckCircle2 className="text-primary" />
      ) : neoFieldsTestResult?.success === false ? (
        <XCircle className="text-ui-danger" />
      ) : (
        <Database />
      ),
      onClick: handleTestNeoFields,
      disabled: isTestingNeoFields || isDisabled,
      className: cn(
        neoFieldsTestResult?.success && "bg-primary/12 hover:bg-primary/18",
        neoFieldsTestResult?.success === false && "bg-ui-danger/10 hover:bg-ui-danger/16",
      ),
      title: "Test NEO Fields API and set date_modifier to today on entity post",
    },
    {
      key: "gmb",
      label: isTestingGMB ? "Testing GMB Connection…" : "Test GMB Connection",
      icon: isTestingGMB ? null : <Building2 />,
      onClick: handleTestGMB,
      disabled: isTestingGMB || isDisabled,
      title: "Test Google Business Profile connection (connect in Settings first)",
    },
    {
      key: "ga",
      label: isTestingGA ? "Testing GA…" : "Test GA",
      icon: isTestingGA ? null : <BarChart3 />,
      onClick: handleTestGA,
      disabled: isTestingGA || isDisabled,
      title: "Test Google Analytics 4 connection (uses GA4 Property ID from Settings)",
    },
    ...(onExtractNAPAndGraph
      ? [
          {
            key: "nap",
            label: isExtractingNAPAndGraph ? "Extracting NAP & Graph…" : "Extract NAP & Graph",
            icon: isExtractingNAPAndGraph ? (
              null
            ) : (
              <Network />
            ),
            onClick: onExtractNAPAndGraph,
            disabled: isExtractingNAPAndGraph || isDisabled,
          } satisfies ConnectionAction,
        ]
      : []),
    {
      key: "sitemaps",
      label: isDetecting ? "Detecting Sitemaps…" : "Detect Sitemaps",
      icon: isDetecting ? null : <Map />,
      onClick: onDetect,
      disabled: isDetecting || isDisabled,
    },
    {
      key: "gmb-stats",
      label: isPullingGMBStats ? "Pulling GMB Stats…" : "Pull GMB Stats To KB",
      icon: isPullingGMBStats ? null : <Download />,
      onClick: handlePullGMBStats,
      disabled: isPullingGMBStats || isDisabled,
      title: "Pull GMB stats (this month vs last month) into Knowledge Base",
    },
  ];

  if (isProfileCard) {
    return (
      <section className={PROFILE_CARD} aria-label="Connections">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Connections</h2>
        </div>
        <div className="grid grid-cols-2">
          {connectionActions.map((action) => (
            <Button
              key={action.key}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {action.icon}
              </span>
              <span className="min-w-0 break-words">{action.label}</span>
            </Button>
          ))}
        </div>

        {neoFieldsTestResult ? (
          <div
            className={cn(
              "px-5 py-3 text-base",
              neoFieldsTestResult.success ? "bg-primary/12" : "bg-ui-danger/12",
            )}
          >
            {neoFieldsTestResult.success ? (
              <div className="space-y-1.5">
                <div className="font-medium text-white">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />
                  ACF REST API Configured Correctly
                </div>
                {neoFieldsTestResult.dateModifierSet && neoFieldsTestResult.postId ? (
                  <div className="text-base text-primary">
                    Set date_modifier on post {neoFieldsTestResult.postId}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="font-medium text-ui-danger-hover">
                  <XCircle className="mr-1 inline h-4 w-4" aria-hidden />
                  ACF REST API Not Configured
                </div>
                {neoFieldsTestResult.error ? (
                  <div className="text-base text-ui-danger-hover/80">{neoFieldsTestResult.error}</div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className={cn("mt-2 flex min-h-0 w-full max-w-full flex-col", isPropertyBlack ? "gap-1.5" : "gap-2")}>
      <section aria-labelledby="wp-property-actions-testing" className={sectionShell}>
        <h3 id="wp-property-actions-testing" className={sectionTitle}>
          Testing Connections
        </h3>
        <ul className={actionGridScroll}>
          <li className="min-w-0">
            <Button variant="quiet" onClick={onTest} disabled={isTesting || isDisabled}>
              <span className={iconSlot} aria-hidden>
                {isTesting ? null : <TestTube />}
              </span>
              <span className={rowLabel}>
                {isTesting ? "Testing Connection…" : "Test Connection"}
              </span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              pressed={Boolean(neoFieldsTestResult?.success)}
              variant="quiet"
              onClick={handleTestNeoFields}
              disabled={isTestingNeoFields || isDisabled}
              title="Test NEO Fields API and set date_modifier to today on entity post"
            >
              <span className={iconSlot} aria-hidden>
                {isTestingNeoFields ? (
                  null
                ) : neoFieldsTestResult?.success ? (
                  <CheckCircle2 className="text-primary" />
                ) : neoFieldsTestResult?.success === false ? (
                  <XCircle className="text-ui-danger" />
                ) : (
                  <Database />
                )}
              </span>
              <span className={rowLabel}>
                {isTestingNeoFields
                  ? "Testing NEO Fields…"
                  : neoFieldsTestResult?.success
                    ? "NEO Fields OK"
                    : neoFieldsTestResult?.success === false
                      ? "NEO Fields Failed"
                      : "Test NEO Fields"}
              </span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handleTestGMB}
              disabled={isTestingGMB || isDisabled}
              title="Test Google Business Profile connection (connect in Settings first)"
            >
              <span className={iconSlot} aria-hidden>
                {isTestingGMB ? null : <Building2 />}
              </span>
              <span className={rowLabel}>
                {isTestingGMB ? "Testing GMB Connection…" : "Test GMB Connection"}
              </span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handleTestGA}
              disabled={isTestingGA || isDisabled}
              title="Test Google Analytics 4 connection (uses GA4 Property ID from Settings)"
            >
              <span className={iconSlot} aria-hidden>
                {isTestingGA ? null : <BarChart3 />}
              </span>
              <span className={rowLabel}>{isTestingGA ? "Testing GA…" : "Test GA"}</span>
            </Button>
          </li>
          {onExtractNAPAndGraph ? (
            <li className="min-w-0">
              <Button
                variant="quiet"
                onClick={onExtractNAPAndGraph}
                disabled={isExtractingNAPAndGraph || isDisabled}
              >
                <span className={iconSlot} aria-hidden>
                  {isExtractingNAPAndGraph ? null : <Network />}
                </span>
                <span className={rowLabel}>
                  {isExtractingNAPAndGraph ? "Extracting NAP & Graph…" : "Extract NAP & Graph"}
                </span>
              </Button>
            </li>
          ) : null}
          <li className="min-w-0">
            <Button variant="quiet" onClick={onDetect} disabled={isDetecting || isDisabled}>
              <span className={iconSlot} aria-hidden>
                {isDetecting ? null : <Map />}
              </span>
              <span className={rowLabel}>{isDetecting ? "Detecting Sitemaps…" : "Detect Sitemaps"}</span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handlePullGMBStats}
              disabled={isPullingGMBStats || isDisabled}
              title="Pull GMB stats (this month vs last month) into Knowledge Base"
            >
              <span className={iconSlot} aria-hidden>
                {isPullingGMBStats ? null : <Download />}
              </span>
              <span className={rowLabel}>
                {isPullingGMBStats ? "Pulling GMB Stats…" : "Pull GMB Stats To KB"}
              </span>
            </Button>
          </li>
        </ul>
      </section>

      {neoFieldsTestResult && (
        <div
          className={cn(
            "rounded-lg p-3 text-sm shadow-none ring-0",
            neoFieldsTestResult.success ? "bg-primary/12" : "bg-ui-danger/12",
          )}
        >
          {neoFieldsTestResult.success ? (
            <div className="space-y-1.5">
              <div className={`font-medium ${getCyberpunkTextClasses("primary")}`}>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                ACF REST API Configured Correctly
              </div>
              {neoFieldsTestResult.dateModifierSet && neoFieldsTestResult.postId && (
                <div className="text-sm text-primary">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Set date_modifier to {new Date().toISOString().split("T")[0]} on post {neoFieldsTestResult.postId}
                </div>
              )}
              {neoFieldsTestResult.postUrl && (
                <div className={getCyberpunkTextClasses("muted")}>
                  <a
                    href={neoFieldsTestResult.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/90"
                  >
                    View Or Edit Post →
                  </a>
                </div>
              )}
              {neoFieldsTestResult.neoFields && Object.keys(neoFieldsTestResult.neoFields).length > 0 && (
                <div className={getCyberpunkTextClasses("muted")}>
                  <span className="font-medium">Fields Found</span>
                  {": "}
                  {Object.keys(neoFieldsTestResult.neoFields).join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-medium text-ui-danger-hover">
                <XCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                ACF REST API Not Configured
              </div>
              {neoFieldsTestResult.error && <div className="text-ui-danger-hover/80">{neoFieldsTestResult.error}</div>}
              {neoFieldsTestResult.requiredConfig?.php && (
                <div className="mt-2">
                  <div className={`mb-1 font-medium ${getCyberpunkTextClasses("secondary")}`}>
                    Add to functions.php
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-xs">
                    {neoFieldsTestResult.requiredConfig.php.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

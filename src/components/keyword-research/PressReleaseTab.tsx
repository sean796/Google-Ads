import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Copy, Download } from "lucide-react";
import { BlogGeneratorTabHeader } from "@/components/keyword-research/BlogGeneratorTabHeader";
import { BLOG_GENERATOR_TAB_ROOT_CLASS } from "@/components/keyword-research/blog-generator-tab-classes";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import type { PressReleaseWorkspaceBindings } from "@/components/press-release/press-release-workspace-bindings";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_IN_PROPERTIES_F, NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD, NOTIFY_ENTER_A_KEYWORD, NOTIFY_FETCHING_WORDPRESS_POST_INVENTORY, NOTIFY_MARKDOWN_COPIED, NOTIFY_NO_PUBLISHED_POSTS_OR_PAGES_IN_INVENTORY, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED, NOTIFY_PRESS_RELEASE_GENERATED } from "@/lib/notify-messages";
import type { CSVRow, BulkProcessingOptions, BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { KeywordData } from "@/lib/keyword-types";
import { generateMarkdownContentHarnessed } from "@/lib/bulk/bulk-content-generator";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { resolveInternalLinkPlaceholdersInMarkdown } from "@/lib/content-generation/internal-link-placeholders";
import { buildPressReleaseBlueprint } from "@/lib/press-release/press-release-blueprint";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import { appendPressReleaseAnchorLinksSection } from "@/lib/press-release/press-release-anchor-links-table";
import {
  buildPressReleaseWireDateline,
  finishPressReleaseMarkdown,
} from "@/lib/press-release/press-release-dateline";
import {
  createPressReleaseInventoryHostedLink,
  fetchPressReleaseSiteInventory,
  inventoryRowsToLinkablePosts,
  revokePressReleaseInventoryHostedLink,
  type PressReleaseInventoryHostedLink,
} from "@/lib/press-release/press-release-site-inventory";
import { ExternalLink, Newspaper, Play } from "lucide-react";
import { Button, Field, TextareaField } from "@/ui";

function normalizeDomain(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
}

function triggerDownloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "press-release";
}

export interface PressReleaseTabProps {
  dataForSEOApiKey: string;
  openRouterApiKey: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  pressReleaseWorkspace?: boolean;
  onPressReleaseWorkspaceBindings?: (bindings: PressReleaseWorkspaceBindings) => void;
}

export function PressReleaseTab({
  dataForSEOApiKey,
  openRouterApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  pressReleaseWorkspace = false,
  onPressReleaseWorkspaceBindings,
}: PressReleaseTabProps) {
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [wordPressSite, setWordPressSite] = useState<WordPressSite | null>(null);
  const [harnessSections, setHarnessSections] = useState<BulkHarnessSectionUi[]>([]);
  const [harnessPlannedCount, setHarnessPlannedCount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [runPhase, setRunPhase] = useState("");
  const [resultMarkdown, setResultMarkdown] = useState<string | null>(null);
  const [inventoryJsonLink, setInventoryJsonLink] = useState<PressReleaseInventoryHostedLink | null>(
    null,
  );
  const inventoryJsonHrefRef = useRef<string | null>(null);

  const clearInventoryJsonLink = useCallback(() => {
    revokePressReleaseInventoryHostedLink(inventoryJsonHrefRef.current);
    inventoryJsonHrefRef.current = null;
    setInventoryJsonLink(null);
  }, []);

  const handleClear = useCallback(() => {
    setKeyword("");
    setTitle("");
    setResultMarkdown(null);
    setHarnessSections([]);
    setHarnessPlannedCount(null);
    setRunPhase("");
    clearInventoryJsonLink();
  }, [clearInventoryJsonLink]);

  const refreshSite = useCallback(() => {
    const sites = getStoredSites();
    let enabled = sites.find((s) => s.connectionStatus === "success" && s.enabled !== false);
    if (!enabled) enabled = sites.find((s) => s.enabled !== false);
    if (enabled) {
      const d = normalizeDomain(enabled.siteUrl);
      if (d === "example.com" || d.endsWith(".example.com")) {
        setWordPressSite(null);
        return;
      }
      setWordPressSite(enabled);
      return;
    }
    if (sites.length > 0) {
      const fallback = [...sites].sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0];
      if (fallback) setWordPressSite(fallback);
      else setWordPressSite(null);
    } else setWordPressSite(null);
  }, []);

  useEffect(() => {
    refreshSite();
  }, [refreshSite]);

  useEffect(() => () => clearInventoryJsonLink(), [clearInventoryJsonLink]);

  const runGenerate = useCallback(async () => {
    const keywordTopic = keyword.trim();
    if (!openRouterApiKey?.trim()) {
      notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED);
      return;
    }
    if (!keywordTopic) {
      notify.error(NOTIFY_ENTER_A_KEYWORD);
      return;
    }
    if (!wordPressSite) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_IN_PROPERTIES_F);
      return;
    }

    setIsProcessing(true);
    setResultMarkdown(null);
    setHarnessSections([]);
    setHarnessPlannedCount(null);
    clearInventoryJsonLink();

    try {
      const publicUrl = getPublicSiteUrl(wordPressSite);
      const connectedSite = { name: wordPressSite.name, siteUrl: publicUrl };

      setRunPhase("Fetching WordPress post inventory…");
      notify.info(NOTIFY_FETCHING_WORDPRESS_POST_INVENTORY);
      const inventoryResult = await fetchPressReleaseSiteInventory(wordPressSite);
      if (inventoryResult.error) {
        notify.warning(inventoryResult.error);
      }
      if (inventoryResult.inventoryJson?.length && inventoryResult.rows.length > 0) {
        const hosted = createPressReleaseInventoryHostedLink(publicUrl, inventoryResult.inventoryJson);
        inventoryJsonHrefRef.current = hosted.href;
        setInventoryJsonLink(hosted);
      } else if (!inventoryResult.rows.length) {
        notify.warning(NOTIFY_NO_PUBLISHED_POSTS_OR_PAGES_IN_INVENTORY);
      }

      const wordPressPosts = inventoryRowsToLinkablePosts(inventoryResult.rows);

      const wireDateline = buildPressReleaseWireDateline(wordPressSite);

      const blueprint = buildPressReleaseBlueprint({
        seedKeyword: keywordTopic,
        headlineHint: title.trim() || undefined,
      });
      setHarnessPlannedCount(blueprint.agents.length);
      setRunPhase("Generating press release…");

      const row: CSVRow = {
        keyword: keywordTopic,
        title: blueprint.title,
        keyword_focus: keywordTopic,
      };

      const keywordData: KeywordData = {
        keyword: keywordTopic,
        difficulty: 0,
        searchVolume: 0,
        cpc: 0,
        competition: "LOW",
        intent: "informational",
        relatedKeywords: [],
        serpFeatures: [],
      };

      const stored = getStoredSites();
      const portfolioList = buildPortfolioBlockedHosts(stored, {
        excludeSiteId: wordPressSite.id,
        excludeSiteUrl: wordPressSite.siteUrl,
      });

      const onHarnessSection = (payload: BulkHarnessSectionPayload) => {
        setHarnessPlannedCount(payload.totalSections);
        setHarnessSections((prev) => reduceHarnessSectionList(prev, payload));
      };

      const options: BulkProcessingOptions = {
        apiKey: dataForSEOApiKey?.trim() ?? "",
        openRouterApiKey: openRouterApiKey.trim(),
        openRouterOnly: true,
        selectedModel: selectedModel || getProductionModel(wordPressSite.id),
        temperature: temperature ?? 1.0,
        maxTokens: maxTokens ?? 16000,
        topP: topP ?? 0.9,
        useEntitySitemapTemplate: false,
        portfolioBlockedHosts: portfolioList.length > 0 ? portfolioList : undefined,
        onHarnessSection,
      };

      const rawMarkdown = await generateMarkdownContentHarnessed(
        blueprint,
        row,
        keywordData,
        [],
        "",
        options,
        0,
        connectedSite,
        wordPressPosts,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          acfContextOverride: {
            keywordFocus: keywordTopic,
            contentRelevantFields: {
              "Wire dateline": `Section 1 only: open the first paragraph after ## with exactly "${wireDateline}" then the lead. Do not repeat this dateline or any calendar date in later sections.`,
            },
          },
          primaryKeyword: keywordTopic,
          contentKind: "press_release",
          siteId: wordPressSite.id,
        },
      );
      const finished = finishPressReleaseMarkdown(rawMarkdown, wireDateline);
      const markdown = await resolveInternalLinkPlaceholdersInMarkdown(finished, {
        siteId: wordPressSite.id,
        siteUrl: publicUrl,
        wordPressPosts,
        apiKey: openRouterApiKey.trim(),
      });
      const finalPrMarkdown = appendPressReleaseAnchorLinksSection(markdown, {
        primaryKeyword: keywordTopic,
        siteName: wordPressSite.name,
        siteUrl: publicUrl,
        headline: blueprint.title,
        releaseMarkdown: markdown,
        siteId: wordPressSite.id,
        inventoryRows: inventoryResult.rows,
      });
      setResultMarkdown(finalPrMarkdown);

      try {
        const { auditPressReleaseWithDecisionTree } = await import("@/lib/decision-tree/studio-decision-auditor");
        const decisionState = await auditPressReleaseWithDecisionTree({
          headline: blueprint.title,
          body: finalPrMarkdown,
          siteId: wordPressSite.id,
          apiKey: openRouterApiKey.trim(),
        });
        console.log(
          `%c[Decision Agent] 📰 Press Release QA complete: ${decisionState.terminalState}`,
          "color: #84bc00; font-weight: bold;",
          decisionState,
        );
      } catch (auditErr) {
        console.warn("[Decision Agent] Press release audit warning:", auditErr);
      }

      notify.success(NOTIFY_PRESS_RELEASE_GENERATED);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed.";
      notify.error(msg);
    } finally {
      setIsProcessing(false);
      setRunPhase("");
    }
  }, [
    dataForSEOApiKey,
    openRouterApiKey,
    keyword,
    title,
    wordPressSite,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    clearInventoryJsonLink,
  ]);

  const bindings = useMemo<PressReleaseWorkspaceBindings>(
    () => ({
      keyword,
      setKeyword,
      title,
      setTitle,
      isProcessing,
      runPhase,
      onRun: () => void runGenerate(),
      onClear: handleClear,
      harnessSections,
      harnessPlannedSectionCount: harnessPlannedCount,
      inventoryJsonLink,
      wordPressSite,
      resultMarkdown,
    }),
    [
      keyword,
      title,
      isProcessing,
      runPhase,
      runGenerate,
      handleClear,
      harnessSections,
      harnessPlannedCount,
      inventoryJsonLink,
      wordPressSite,
      resultMarkdown,
    ],
  );

  useEffect(() => {
    if (!pressReleaseWorkspace || !onPressReleaseWorkspaceBindings) return;
    onPressReleaseWorkspaceBindings(bindings);
  }, [pressReleaseWorkspace, onPressReleaseWorkspaceBindings, bindings]);

  const resultBlock =
    resultMarkdown && !isProcessing ? (
      <div className="min-h-0 flex-1 space-y-2 rounded-md border border-border p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(resultMarkdown);
                notify.success(NOTIFY_MARKDOWN_COPIED);
              } catch {
                notify.error(NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD);
              }
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Markdown
          </Button>
          <Button
            type="button"
            onClick={() =>
              triggerDownloadMarkdown(
                `press-release_${sanitizeFilenamePart(keyword.trim() || "release")}.md`,
                resultMarkdown,
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Download .md
          </Button>
        </div>
        <TextareaField placeholder="Press release markdown" readOnly value={resultMarkdown} rows={14} />
      </div>
    ) : null;

  if (pressReleaseWorkspace) {
    return null;
  }

  return (
    <div className={BLOG_GENERATOR_TAB_ROOT_CLASS}>
      <BlogGeneratorTabHeader icon={Newspaper} title="Press Release" />

      <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4 sm:p-6">
        <div className="max-w-xl space-y-4">
          <div className="space-y-2">
            <label htmlFor="pr-keyword">Keyword</label>
            <Field
              id="pr-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Topic keyword"
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="pr-title">Title (optional)</label>
            <Field
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Headline override"
              disabled={isProcessing}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="run" type="button" onClick={() => void runGenerate()} disabled={isProcessing}>
            {isProcessing ? (
              <>
                
                Generating…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        </div>

        <BulkHarnessSectionsPanel
          harnessSections={harnessSections}
          harnessPlannedSectionCount={harnessPlannedCount}
          currentRow={0}
          totalRows={1}
          isProcessing={isProcessing}
        />

        {inventoryJsonLink ? (
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-base">
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Post inventory</span>
            <a
              className="min-w-0 break-words font-medium text-primary underline underline-offset-4 hover:text-primary/90"
              href={inventoryJsonLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {inventoryJsonLink.filename}
            </a>
            <span className="text-muted-foreground">({inventoryJsonLink.rowCount} URLs)</span>
          </div>
        ) : null}

        {resultBlock}
      </div>
    </div>
  );
}

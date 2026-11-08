import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui";
import { BULK_HEADER_SELECT_TRIGGER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import {
  fetchChangelogArchive,
  fetchUncoveredCommits,
  saveChangelogEntry,
  type ChangelogArchivePayload,
  type ChangelogEntry,
} from "@/lib/changelog/changelog-api";
import {
  appChangelogWriterAgent,
  buildChangelogEntry,
} from "@/lib/changelog/changelog-agent";
import { loadApiKey } from "@/lib/api";
import { cn } from "@/lib/utils";

const DUE_AFTER_DAYS = 7;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

function monthLabel(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Nov 7, 2026" from an ISO date (YYYY-MM-DD). */
function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ChangelogTabContent(): React.ReactElement {
  const [archive, setArchive] = useState<ChangelogArchivePayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchChangelogArchive();
      setArchive(payload);
      setSelectedId((prev) => prev ?? payload.entries[0]?.id ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const entries = useMemo(() => archive?.entries ?? [], [archive]);
  const newestEntryDate = entries[0]?.date ?? null;
  const due = newestEntryDate === null || daysBetween(newestEntryDate, todayIso()) >= DUE_AFTER_DAYS;

  const months = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) {
      seen.add(entry.date.slice(0, 7));
    }
    return [...seen];
  }, [entries]);

  const filteredEntries = useMemo(
    () => (monthFilter === "all" ? entries : entries.filter((e) => e.date.slice(0, 7) === monthFilter)),
    [entries, monthFilter],
  );

  const selectedEntry = useMemo(
    () => filteredEntries.find((e) => e.id === selectedId) ?? filteredEntries[0] ?? null,
    [filteredEntries, selectedId],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const feed = await fetchUncoveredCommits();
      if (feed.commits.length === 0) return;
      const modelDraft = await appChangelogWriterAgent.run(
        { commits: feed.commits, coveredThrough: feed.coveredThrough },
        { apiKey: loadApiKey() },
      );
      const nextEntry = buildChangelogEntry(modelDraft, feed.commits, todayIso());
      const payload = await saveChangelogEntry(nextEntry);
      setArchive(payload);
      setSelectedId(nextEntry.id);
    } catch {
      /* ignore */
    } finally {
      setGenerating(false);
    }
  }, []);

  const shownEntry = selectedEntry;
  const sourceStatus = archive?.source ?? null;
  const sourceLine = sourceStatus
    ? `${sourceStatus.uncoveredCount} commit${sourceStatus.uncoveredCount === 1 ? "" : "s"} waiting`
    : "Loading archive...";

  return (
    <div
      className={cn(
        SEO_WORKSPACE_TYPO_CLASS,
        "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background",
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-black">
        <aside
          aria-label="Changelog archive by month"
          className="relative flex h-full min-h-0 w-[21rem] shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
        >
          <div className="flex h-11 shrink-0 items-center border-b border-white/10 bg-black px-3">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger
                aria-label="Filter archive by month"
                className={cn(BULK_HEADER_SELECT_TRIGGER, "w-full")}
              >
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {months.map((month) => (
                  <SelectItem key={month} value={month}>
                    {monthLabel(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <p className="px-3 py-3 text-base text-muted-foreground">
                No changelog entries yet. Generate the first entry once commits have been sent with
                the source script.
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left",
                    shownEntry?.id === entry.id
                      ? "border-l-2 border-primary bg-ui-field"
                      : "bg-black hover:bg-ui-field/50",
                  )}
                >
                  <span className="text-base tabular-nums text-muted-foreground">
                    {formatDate(entry.date)}
                  </span>
                  <span className="text-base font-medium text-white">{entry.title}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
          <header
            className="relative z-30 flex w-full shrink-0 flex-col bg-black font-sans text-white"
            aria-label="Changelog header"
          >
            <div className="flex h-11 w-full min-w-0 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-black px-3">
              <div className="inline-flex h-8 w-[14.5rem] min-w-[14.5rem] max-w-[14.5rem] shrink-0 items-center gap-2 rounded-none border border-white/10 bg-ui-field px-2.5 font-semibold text-white">
                <ScrollText className="h-4 w-4 shrink-0" aria-hidden />
                Changelog
              </div>
              <div className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
              <div className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center justify-between rounded-none border border-white/10 bg-ui-field px-2.5 text-foreground">
                <span className="min-w-0 flex-1 truncate text-left font-mono text-base">
                  {sourceLine}
                </span>
              </div>
            </div>
            <div className="flex h-10 min-h-10 w-full min-w-0 shrink-0 items-center justify-between border-b border-white/10 bg-ui-field/95 px-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {due ? (
                  <span className="shrink-0 bg-amber-400/15 px-2.5 py-1 text-base text-amber-300">
                    New entry due
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="run"
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || loading}
                >
                  <span className="inline-block w-[5rem] text-center">
                    {generating ? "Writing" : "Generate"}
                  </span>
                </Button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto" aria-label="Changelog entry">
            <div className="mx-auto flex w-full max-w-4xl flex-col bg-black px-6 py-7 sm:px-10 sm:py-9">
            {shownEntry ? (
              <article className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-white">{shownEntry.title}</h3>
                  <p className="text-base tabular-nums text-muted-foreground">
                    {formatDate(shownEntry.date)} · {shownEntry.commitCount} commits
                  </p>
                </div>
                {shownEntry.highlights && shownEntry.highlights.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-base font-semibold text-white">Highlights</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-zinc-200">
                      {shownEntry.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {shownEntry.sections.map((section) => (
                  <div key={section.heading} className="flex flex-col gap-1.5">
                    <p className="text-base font-semibold text-white">{section.heading}</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-zinc-200">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ) : (
              <p className="text-base text-muted-foreground">
                Nothing to read yet. When commits are waiting, Generate entry writes the first one.
              </p>
            )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

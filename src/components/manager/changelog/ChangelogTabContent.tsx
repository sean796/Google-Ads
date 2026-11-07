import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
  SEO_WORKSPACE_TYPO_CLASS,
} from "@/components/seo/seo-workspace-layout";
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
import { ChangelogWorkspaceHeader } from "./ChangelogWorkspaceHeader";

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

export function ChangelogTabContent(): React.ReactElement {
  const [archive, setArchive] = useState<ChangelogArchivePayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChangelogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchChangelogArchive();
      setArchive(payload);
      setSelectedId((prev) => prev ?? payload.entries[0]?.id ?? null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load the changelog archive.");
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

  const monthGroups = useMemo(() => {
    const groups = new Map<string, ChangelogEntry[]>();
    for (const entry of entries) {
      const key = entry.date.slice(0, 7);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [entries]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const feed = await fetchUncoveredCommits();
      if (feed.commits.length === 0) {
        setNotice(
          "No new commits to cover yet. Run the changelog source script to send the latest git commits, then generate.",
        );
        return;
      }
      const modelDraft = await appChangelogWriterAgent.run(
        { commits: feed.commits, coveredThrough: feed.coveredThrough },
        { apiKey: loadApiKey() },
      );
      setDraft(buildChangelogEntry(modelDraft, feed.commits, todayIso()));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const payload = await saveChangelogEntry(draft);
      setArchive(payload);
      setSelectedId(draft.id);
      setDraft(null);
      setNotice("Entry saved to the archive.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const shownEntry = draft ?? selectedEntry;

  return (
    <div className={cn(SEO_WORKSPACE_SHELL_CLASS, SEO_WORKSPACE_TYPO_CLASS)}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <ChangelogWorkspaceHeader
          due={due}
          newestEntryDate={newestEntryDate}
          sourceStatus={archive?.source ?? null}
          generating={generating}
          loading={loading}
          onGenerate={() => void handleGenerate()}
          onRefresh={() => void loadArchive()}
        />
      </div>

      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "flex flex-col gap-3 pb-4")}>
        {errorMessage ? (
          <div className="bg-zinc-900 px-4 py-2.5 text-base text-red-400">{errorMessage}</div>
        ) : null}
        {notice ? (
          <div className="bg-zinc-900 px-4 py-2.5 text-base text-muted-foreground">{notice}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80" aria-label="Changelog archive by month">
            {monthGroups.length === 0 ? (
              <p className="bg-zinc-950 p-4 text-base text-muted-foreground">
                No changelog entries yet. Generate the first entry once commits have been sent with
                the source script.
              </p>
            ) : (
              monthGroups.map(([month, monthEntries]) => (
                <div key={month} className="flex flex-col gap-1.5">
                  <p className="px-1 text-base font-semibold text-white">{monthLabel(month)}</p>
                  {monthEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(entry.id);
                        setDraft(null);
                      }}
                      className={cn(
                        "flex flex-col gap-0.5 px-3 py-2 text-left",
                        shownEntry?.id === entry.id && !draft ? "bg-zinc-800" : "bg-zinc-950 hover:bg-zinc-900",
                      )}
                    >
                      <span className="text-base tabular-nums text-muted-foreground">{entry.date}</span>
                      <span className="text-base font-medium text-white">{entry.title}</span>
                      <span className="text-base tabular-nums text-muted-foreground">
                        {entry.rangeFrom} to {entry.rangeTo} · {entry.commitCount} commits
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </aside>

          <main className="min-w-0 flex-1 bg-zinc-950 p-5" aria-label="Changelog entry">
            {draft ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 bg-zinc-900 px-4 py-3">
                <span className="text-base font-semibold text-amber-300">Draft, not saved yet</span>
                <span className="text-base text-muted-foreground">
                  Read it over, then save it to the archive or discard it.
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    disabled={saving}
                    className="bg-zinc-800 px-4 py-2 text-base text-white hover:bg-zinc-700"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveDraft()}
                    disabled={saving}
                    className="bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {saving ? "Saving..." : "Save to archive"}
                  </button>
                </div>
              </div>
            ) : null}

            {shownEntry ? (
              <article className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-white">{shownEntry.title}</h3>
                  <p className="text-base tabular-nums text-muted-foreground">
                    {shownEntry.date} · covers {shownEntry.rangeFrom} to {shownEntry.rangeTo} ·{" "}
                    {shownEntry.commitCount} commits
                  </p>
                </div>
                <p className="text-base text-zinc-200">{shownEntry.summary}</p>
                {shownEntry.highlights.length > 0 ? (
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
          </main>
        </div>
      </div>
    </div>
  );
}

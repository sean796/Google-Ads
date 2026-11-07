import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ChangelogCommit } from "@/lib/changelog/changelog-agent";

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogEntry {
  id: string;
  date: string;
  rangeFrom: string;
  rangeTo: string;
  commitCount: number;
  title: string;
  summary: string;
  highlights: string[];
  sections: ChangelogSection[];
  createdAt?: string;
}

export interface ChangelogSourceStatus {
  commitCount: number;
  uncoveredCount: number;
  coveredThrough: string | null;
  latestCommitDate: string | null;
}

export interface ChangelogArchivePayload {
  ok: boolean;
  entries: ChangelogEntry[];
  source: ChangelogSourceStatus;
  error?: string;
}

export interface ChangelogSourceFeed {
  ok: boolean;
  coveredThrough: string | null;
  commits: ChangelogCommit[];
  error?: string;
}

export async function fetchChangelogArchive(): Promise<ChangelogArchivePayload> {
  const res = await fetch(backendApiUrl("/changelog"), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as ChangelogArchivePayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Changelog ${res.status}`);
  }
  return data;
}

export async function fetchUncoveredCommits(): Promise<ChangelogSourceFeed> {
  const res = await fetch(backendApiUrl("/changelog/source"), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as ChangelogSourceFeed;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Changelog source ${res.status}`);
  }
  return data;
}

export async function saveChangelogEntry(
  entry: ChangelogEntry,
): Promise<ChangelogArchivePayload> {
  const res = await fetch(backendApiUrl("/changelog/entry"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ entry }),
  });
  const data = (await res.json()) as ChangelogArchivePayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Save failed (${res.status})`);
  }
  return data;
}

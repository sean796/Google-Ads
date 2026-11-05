import React, { useEffect, useMemo, useState } from "react";
import { CheckField, Field, TextButton } from "@/ui";
import { getStoredSites } from "@/components/integrations/storage";
import { TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import {
  resolveTaskExecutionBucket,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
  type TaskExecutionTargetBucket,
} from "@/lib/task-execution-bucket";
import { resolveTaskExecutionBucketUrls } from "@/lib/task-execution-resolve-bucket-urls";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function urlLabel(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return path;
  } catch {
    return url;
  }
}

export type ChatGptAuditUrlScopeFieldsProps = {
  clientSiteId?: string;
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function ChatGptAuditUrlScopeFields({
  clientSiteId,
  executionPayload,
  disabled = false,
  onChange,
}: ChatGptAuditUrlScopeFieldsProps): React.ReactElement | null {
  const payload = executionPayload ?? {};
  const bucket = resolveTaskExecutionBucket(payload) ?? ("pages" as TaskExecutionTargetBucket);
  const site = useMemo(
    () => (clientSiteId?.trim() ? getStoredSites().find((item) => item.id === clientSiteId.trim()) : undefined),
    [clientSiteId],
  );

  const [bucketUrls, setBucketUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!site) {
      setBucketUrls([]);
      setLoadError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void resolveTaskExecutionBucketUrls(site, bucket)
      .then((urls) => {
        if (cancelled) return;
        setBucketUrls(urls.map(normalizeUrl));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBucketUrls([]);
        setLoadError(err instanceof Error ? err.message : "Could not load bucket URLs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site, bucket]);

  const selectedSet = useMemo(() => {
    const allowed = new Set(bucketUrls);
    const saved = (payload.targetUrls ?? []).map(normalizeUrl).filter((url) => allowed.has(url));
    if (saved.length > 0) return new Set(saved);
    return new Set(bucketUrls);
  }, [bucketUrls, payload.targetUrls]);

  const filteredUrls = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return bucketUrls;
    return bucketUrls.filter((url) => url.toLowerCase().includes(query) || urlLabel(url).toLowerCase().includes(query));
  }, [bucketUrls, filter]);

  const allFilteredSelected =
    filteredUrls.length > 0 && filteredUrls.every((url) => selectedSet.has(url));
  const someFilteredSelected = filteredUrls.some((url) => selectedSet.has(url));

  const patchSelection = (nextSelected: Set<string>) => {
    const ordered = bucketUrls.filter((url) => nextSelected.has(url));
    if (ordered.length === 0) {
      onChange({ ...payload, targetUrls: [] });
      return;
    }
    if (ordered.length === bucketUrls.length) {
      const { targetUrls: _removed, ...rest } = payload;
      onChange(rest);
      return;
    }
    onChange({ ...payload, targetUrls: ordered });
  };

  const toggleUrl = (url: string) => {
    const next = new Set(selectedSet);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    patchSelection(next);
  };

  const toggleFiltered = () => {
    const next = new Set(selectedSet);
    if (allFilteredSelected) {
      for (const url of filteredUrls) next.delete(url);
    } else {
      for (const url of filteredUrls) next.add(url);
    }
    patchSelection(next);
  };

  if (!clientSiteId?.trim()) {
    return (
      <TaskFormPanel title="Pages in bucket">
        <p className="bg-black px-3 py-2 text-base text-muted-foreground">
          Set a client on the workflow to choose pages.
        </p>
      </TaskFormPanel>
    );
  }

  const bucketLabel = TASK_EXECUTION_TARGET_BUCKET_LABELS[bucket];
  const summary =
    selectedSet.size === 0
      ? "None selected"
      : selectedSet.size === bucketUrls.length
        ? `All ${bucketUrls.length} selected`
        : `${selectedSet.size} of ${bucketUrls.length} selected`;

  return (
    <TaskFormPanel title="Pages in bucket">
      <div className="flex flex-col gap-2 bg-black px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <CheckField
            label="Select filtered"
            checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
            disabled={disabled || loading || filteredUrls.length === 0}
            aria-label={`Select filtered ${bucketLabel}`}
            onCheckedChange={toggleFiltered}
          />
          <TextButton
            tone="muted"
            disabled={disabled || loading || selectedSet.size === 0}
            onClick={() => patchSelection(new Set())}
          >
            Deselect all
          </TextButton>
          <span className="ml-auto tabular-nums text-base text-muted-foreground">{summary}</span>
        </div>

        <Field
          value={filter}
          disabled={disabled || loading}
          placeholder="Filter URLs"
          onChange={(event) => setFilter(event.target.value)}
        />

        {loading ? (
          <p className="py-3 text-base text-muted-foreground">Loading {bucketLabel.toLowerCase()}…</p>
        ) : null}

        {loadError ? (
          <p className="py-2 text-base text-ui-danger">{loadError}</p>
        ) : null}

        {!loading && !loadError && bucketUrls.length === 0 ? (
          <p className="py-2 text-base text-muted-foreground">No URLs in this bucket.</p>
        ) : null}

        {!loading && !loadError && bucketUrls.length > 0 ? (
          <ul className="max-h-56 overflow-y-auto">
            {filteredUrls.map((url) => {
              const checked = selectedSet.has(url);
              return (
                <li key={url}>
                  <CheckField label={urlLabel(url)} checked={checked} disabled={disabled} onCheckedChange={() => toggleUrl(url)} />
                </li>
              );
            })}
          </ul>
        ) : null}

        {selectedSet.size === 0 && !loading ? (
          <p className="text-base text-ui-danger">Select at least one URL to audit.</p>
        ) : null}
      </div>
    </TaskFormPanel>
  );
}

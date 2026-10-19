import React, { useSyncExternalStore } from "react";
import { Download, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerRevisionsJsonDownload } from "@/components/overview/studio/overview-revision-compare-ui";
import {
  getRevisionsForUrl,
  subscribeOverviewStudioRevisions,
} from "@/lib/overview/studio-doc-revisions-store";
import {
  getStudioDocRevisionsViewBridge,
  subscribeStudioDocRevisionsViewBridge,
} from "@/lib/overview/studio-doc-revisions-view-bridge";

export function OverviewDocRevisionsSection({ pageUrl }: { pageUrl: string }) {
  const list = useSyncExternalStore(
    subscribeOverviewStudioRevisions,
    () => getRevisionsForUrl(pageUrl),
    () => getRevisionsForUrl(pageUrl),
  );

  const viewBridge = useSyncExternalStore(
    subscribeStudioDocRevisionsViewBridge,
    getStudioDocRevisionsViewBridge,
    getStudioDocRevisionsViewBridge,
  );

  const openRevisions = () => {
    viewBridge?.openRevisions();
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-white">
          <History className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
          <span>Revisions</span>
          <span className="tabular-nums text-sky-400">{list.length}</span>
        </div>
        {list.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 rounded-none border-0 bg-zinc-900 px-2 text-base text-cyan-400 hover:bg-zinc-800 hover:text-white"
            onClick={() => triggerRevisionsJsonDownload(list)}
            title="Download revisions JSON"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>

      <p className="text-base text-muted-foreground">
        Compare before and after copy for each Auto SEO step on a full page in the studio.
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!viewBridge}
        onClick={openRevisions}
        className="h-8 w-full rounded-none border-0 bg-zinc-900 px-3 text-base text-primary hover:bg-zinc-800"
      >
        Open revisions page
      </Button>
    </div>
  );
}

import React, { useSyncExternalStore } from "react";
import { Download, History } from "lucide-react";
import { triggerRevisionsJsonDownload } from "@/components/overview/studio/overview-revision-compare-ui";
import {
  getRevisionsForUrl,
  subscribeOverviewStudioRevisions,
} from "@/lib/overview/studio-doc-revisions-store";
import {
  getStudioDocRevisionsViewBridge,
  subscribeStudioDocRevisionsViewBridge,
} from "@/lib/overview/studio-doc-revisions-view-bridge";
import { Button } from "@/ui";

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
          <History className="h-4 w-4 shrink-0 text-semantic-analysis-foreground" aria-hidden />
          <span>Revisions</span>
          <span className="tabular-nums text-semantic-analysis-foreground">{list.length}</span>
        </div>
        {list.length > 0 ? (
          <Button
            variant="quiet"
            type="button"
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
        variant="quiet"
        type="button"
        disabled={!viewBridge}
        onClick={openRevisions}
      >
        Open revisions page
      </Button>
    </div>
  );
}

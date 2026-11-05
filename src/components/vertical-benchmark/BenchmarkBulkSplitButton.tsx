
import { cn } from "@/lib/utils";
import { Download, Sparkles } from "lucide-react";
import { Button } from "@/ui";

const CLUSTER_CLASS =
  "inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-border bg-background";

type Props = {
  curating: boolean;
  onDownload: () => void;
  onCurate: () => void;
};

/** Left = download CSV only. Right = curate bulk template for selected roster clients. */
export function BenchmarkBulkSplitButton({ curating, onDownload, onCurate }: Props) {
  return (
    <div className={CLUSTER_CLASS} role="group" aria-label="Bulk CSV">
      <Button
        variant="quiet"
        type="button"
        title="Download bulk CSV (last curated file)"
        aria-label="Download bulk CSV"
        onClick={onDownload}
      >
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </Button>
      <Button
        variant="quiet"
        type="button"
        title="Curate bulk CSV from GSC for selected clients"
        aria-label="Curate bulk CSV"
        onClick={onCurate}
      >
        {curating ? (
          null
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="text-sm">Curate</span>
      </Button>
    </div>
  );
}

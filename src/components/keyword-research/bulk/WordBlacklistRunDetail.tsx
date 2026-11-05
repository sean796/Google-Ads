import { Download } from "lucide-react";
import { buildWordBlacklistDownloadText } from "@/lib/content-word-blocklist";
import { META_FIELD_END_RAIL_BTN } from "@/components/overview/MetaOptimizerPageRowDetails";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { Button } from "@/ui";

function downloadWordBlacklistTxt() {
  const content = buildWordBlacklistDownloadText();
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "word-blacklist.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify.success(NOTIFY_CSV_DOWNLOADED);
}

/** Default generation context: global word blacklist (always visible above sitemap inventory). */
export function WordBlacklistRunDetail() {
  return (
    <div className="flex h-8 items-center gap-2 px-2.5 sm:px-3">
      <p className="min-w-0 flex-1 text-base font-medium text-white">Word Blacklist</p>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Button
          size="icon" icon={Download}
          variant="quiet"
          type="button"
          title="Download word-blacklist.txt"
          aria-label="Download word blacklist"
          onClick={downloadWordBlacklistTxt}
        ></Button>
      </div>
    </div>
  );
}

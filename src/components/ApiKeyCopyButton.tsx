import { Copy } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { copyTextToClipboard } from "@/lib/backlink-research/backlink-bulk-csv-export";
import { Button } from "@/ui";

interface ApiKeyCopyButtonProps {
  value: string;
  emptyMessage?: string;
  "aria-label"?: string;
}

export function ApiKeyCopyButton({
  value,
  emptyMessage = "Nothing to copy.",
  "aria-label": ariaLabel = "Copy to clipboard",
}: ApiKeyCopyButtonProps) {
  const handleCopy = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      notify.warning(emptyMessage);
      return;
    }
    const ok = await copyTextToClipboard(trimmed);
    notify[ok ? "success" : "error"](ok ? "Copied to clipboard" : "Could not copy");
  };

  return (
    <Button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Copy className="h-4 w-4 shrink-0" aria-hidden />
      Copy
    </Button>
  );
}

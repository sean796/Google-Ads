import { Sparkles } from "lucide-react";
import { CONTENT_OPTIMIZER_MULTI_SITE_OPTIMIZE_ROW_BTN } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { Button } from "@/ui";

export type GoogleAdsCampaignRowGenerateButtonProps = {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function GoogleAdsCampaignRowGenerateButton({
  busy = false,
  disabled = false,
  onClick,
}: GoogleAdsCampaignRowGenerateButtonProps) {
  return (
    <Button
      variant="run"
      type="button"
      disabled={disabled || busy}
      aria-label={busy ? "Generating campaign" : "Generate campaign"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {busy ? (
        null
      ) : (
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-foreground sm:h-4 sm:w-4" aria-hidden />
      )}
    </Button>
  );
}

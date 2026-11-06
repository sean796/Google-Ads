import React from "react";

import { XCircle, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses, getPropertyListRowBlackIconButtonClass, getPropertyListRowIconButtonHoverGlowClass } from "./cyberpunk-theme";
import { Button, Switch } from "@/ui";

interface WordPressCardStatusProps {
  site: WordPressSite;
  isTesting: boolean;
  onToggle: () => void;
  variant?: "default" | "menuRow";
  /**
   * When `variant` is `menuRow`, compact row: no "Status:" / "Connected" / "Enabled" captions
   * (switch only; loader while testing, error icon when failed). Switch keeps a full `aria-label`.
   */
  hideInlineLabels?: boolean;
}

export const WordPressCardStatus: React.FC<WordPressCardStatusProps> = ({
  site,
  isTesting,
  onToggle,
  variant = "default",
  hideInlineLabels = false,
}) => {
  const isEnabled = site.enabled !== false;
  const menuDense = variant === "menuRow" && hideInlineLabels;

  const getStatusText = () => {
    if (isTesting) return "Testing...";
    if (site.connectionStatus === "success") return "Connected";
    if (site.connectionStatus === "failed") return "Failed";
    return "Not tested";
  };
  const getFieldsBackendLabel = () => {
    const cap = site.capabilities;
    if (!cap || site.connectionStatus !== "success") return null;
    if (cap.hasNeoPulseWp) {
      const ver = cap.neoPulseWpVersion ? ` ${cap.neoPulseWpVersion}` : "";
      if (cap.fieldsBackend === "neo_pulse_fields") {
        return `NEO Pulse WP${ver} · NEO Pulse Fields`;
      }
      return `NEO Pulse WP${ver}`;
    }
    if (cap.fieldsBackend === "acf_native") return "ACF Pro";
    if (cap.fieldsBackend === "neo_pulse_fields") return "NEO Pulse Fields";
    return null;
  };

  const fieldsBackendLabel = getFieldsBackendLabel();
  const switchAriaLabel = `${getStatusText()}. ${isEnabled ? "Enabled for API calls" : "Disabled"}.`;

  if (variant === "menuRow" && menuDense) {
    const powerClass = cn(
      getPropertyListRowBlackIconButtonClass(true),
      isEnabled && !isTesting
        ? cn(
            "!bg-[#84bd00] text-black [&_svg]:!text-black hover:!bg-[#84bd00]",
            getPropertyListRowIconButtonHoverGlowClass("powerOn"),
          )
        : !isTesting &&
            cn(
              "text-white [&_svg]:!text-white hover:!bg-[#000]",
              getPropertyListRowIconButtonHoverGlowClass("powerOff"),
            ),
    );

    return (
      <div className="flex min-w-0 shrink-0 items-center whitespace-nowrap px-0 py-0">
        <Button
          variant="quiet"
          type="button"
          disabled={isTesting}
          title={getStatusText()}
          aria-label={switchAriaLabel}
          onClick={(e) => {
            e.stopPropagation();
            if (!isTesting) onToggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isTesting ? (
            null
          ) : (
            <Power className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        variant === "menuRow"
          ? "flex min-w-0 items-center justify-between gap-3 py-0 px-0 bg-transparent border-0 rounded-none whitespace-nowrap"
          : "flex items-center justify-between py-2 px-3 bg-white/5 rounded"
      }
    >
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        {!menuDense ? (
          <span className={`text-base font-medium ${getCyberpunkTextClasses("muted")}`}>Status:</span>
        ) : null}
        {isTesting ? null : null}
        {!isTesting && site.connectionStatus === "failed" ? (
          <XCircle className="h-4 w-4 shrink-0 text-ui-danger-hover" aria-hidden />
        ) : null}
        <span className={`text-base font-semibold ${getCyberpunkTextClasses("secondary")}`}>
          {getStatusText()}
        </span>
        {fieldsBackendLabel ? (
          <span className={`text-xs font-medium ${getCyberpunkTextClasses("muted")}`}>
            {fieldsBackendLabel}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <div
          // Prevent parent “expand/collapse” clicks when interacting with the enabled switch.
          onClick={(e) => {
            if (variant === "menuRow") e.stopPropagation();
          }}
          onMouseDown={(e) => {
            if (variant === "menuRow") e.stopPropagation();
          }}
        >
          <Switch checked={isEnabled} onCheckedChange={onToggle} aria-label={switchAriaLabel} />
        </div>
        {!menuDense ? (
          <span className={`text-base font-medium ${getCyberpunkTextClasses("muted")}`}>
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        ) : null}
      </div>
    </div>
  );
};


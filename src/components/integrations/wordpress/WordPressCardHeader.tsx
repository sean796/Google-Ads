import React from "react";
import { Copy, Edit2, Trash2 } from "lucide-react";
import { type WordPressSite } from "../types";
import { cn } from "@/lib/utils";
import {
  getCyberpunkSiteUrlLinkClasses,
  getCyberpunkTextClasses,
  getPropertyListRowBlackIconButtonClass,
  getPropertyListRowIconButtonHoverGlowClass,
} from "./cyberpunk-theme";
import {
  truncateWordpressSiteUrlLabel,
  wordpressSiteDomainLabel,
} from "./wordpress-site-domain-label";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { Button, RowButton } from "@/ui";

interface WordPressCardHeaderProps {
  site: WordPressSite;
  onEdit: () => void;
  onDelete: () => void;
  /** When false, hide site name/URL (compact tile already provides it). */
  showSiteInfo?: boolean;
  variant?: "default" | "menuRow";
  /** Extra icon buttons (e.g. quarter gap CSV) rendered before Edit. */
  extraActions?: React.ReactNode;
  /** When false, omit the pencil (e.g. edit lives in the expanded Site settings tab). */
  showEditButton?: boolean;
}

export const WordPressCardHeader: React.FC<WordPressCardHeaderProps> = ({
  site,
  onEdit,
  onDelete,
  showSiteInfo = true,
  variant = "default",
  extraActions,
  showEditButton = true,
}) => {
  const rootClassName =
    variant === "menuRow"
      ? showSiteInfo
        ? "flex items-center mb-0 pb-0 border-b-0 justify-between pr-3"
        : "flex items-center mb-0 pb-0 border-b-0 justify-end pr-0"
      : showSiteInfo
        ? "flex items-start mb-4 pb-3 justify-between"
        : "flex items-start mb-0 pb-0 border-b-0 justify-end";

  const iconGroupClassName =
    variant === "menuRow" ? "flex gap-1 shrink-0" : "flex gap-2 ml-3 shrink-0";

  const iconButtonClassName =
    variant === "menuRow"
      ? getPropertyListRowBlackIconButtonClass(true)
      : "text-white hover:text-white hover:bg-black border border-white/30 hover:border-white/50 transition-all";

  const deleteButtonClassName =
    variant === "menuRow"
      ? cn(
          getPropertyListRowBlackIconButtonClass(true),
          getPropertyListRowIconButtonHoverGlowClass("destructive"),
          "text-ui-danger-hover [&_svg]:!text-ui-danger-hover",
        )
      : "text-ui-danger-hover hover:text-ui-danger-hover hover:bg-ui-danger/10 border border-ui-danger-edge/30 hover:border-ui-danger-edge/50 transition-all";

  const publicUrl = getPublicSiteUrl(site);
  const siteUrlLabel = truncateWordpressSiteUrlLabel(wordpressSiteDomainLabel(publicUrl));
  const restOnly = site.productionSiteUrl?.trim() ? site.siteUrl.trim() : null;

  return (
    <div
      className={rootClassName}
    >
      {showSiteInfo && (
        <div className="flex-1 min-w-0">
          <h3
            className={`text-lg font-bold ${getCyberpunkTextClasses("primary")} tracking-wider mb-1 break-words`}
          >
            {site.name}
          </h3>
          <RowButton
            type="button"
            aria-label={`Copy site URL: ${publicUrl}`}
            title={`Copy ${publicUrl}`}
            onClick={(e) => {
              if (variant === "menuRow") e.stopPropagation();
              void navigator.clipboard.writeText(publicUrl);
            }}
            onMouseDown={(e) => {
              if (variant === "menuRow") e.stopPropagation();
            }}
          >
            <span className="min-w-0 break-words">{siteUrlLabel}</span>
            <Copy className="h-3 w-3 shrink-0" aria-hidden />
          </RowButton>
          {restOnly ? (
            <p className="mt-1 text-xs text-white/55 break-words" title={restOnly}>
              WordPress REST: {truncateWordpressSiteUrlLabel(wordpressSiteDomainLabel(restOnly))}
            </p>
          ) : null}
        </div>
      )}
      <div className={iconGroupClassName}>
        {extraActions ? (
          <span
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => {
              if (variant === "menuRow") e.stopPropagation();
            }}
            onMouseDown={(e) => {
              if (variant === "menuRow") e.stopPropagation();
            }}
          >
            {extraActions}
          </span>
        ) : null}
        {showEditButton ? (
          <Button
            variant="quiet"
            onClick={(e) => {
              if (variant === "menuRow") e.stopPropagation();
              onEdit();
            }}
            onMouseDown={(e) => {
              if (variant === "menuRow") e.stopPropagation();
            }}
          >
            <Edit2 className={variant === "menuRow" ? "h-4 w-4" : "h-4 w-4"} />
          </Button>
        ) : null}
        <Button
          variant="quiet"
          onClick={(e) => {
            if (variant === "menuRow") e.stopPropagation();
            onDelete();
          }}
          onMouseDown={(e) => {
            if (variant === "menuRow") e.stopPropagation();
          }}
        >
          <Trash2 className={variant === "menuRow" ? "h-4 w-4" : "h-4 w-4"} />
        </Button>
      </div>
    </div>
  );
};


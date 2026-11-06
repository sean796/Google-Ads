import React from "react";
import { Wand2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractAllSectionLinkRowsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import { appendInternalLinkToHtml, patchSectionLinkAtIndex } from "@/lib/overview/overview-blog-links-apply-local";
import { isWikipediaHref } from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { Button, Field, TextareaField, CollapsibleTrigger } from "@/ui";


const META_OPT_OUTLINE =
  "rounded-none border-0 bg-ui-field text-foreground shadow-none hover:bg-ui-field-hover [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-0";

import {
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_CELL,
  META_TRIGGER_FLAT,
} from "@/components/overview/meta-optimizer-row-constants";

const META_EDITABLE_LIST_ITEM = "flex min-w-0 items-start gap-2";

export function MetaEditableListTextarea({
  index,
  value,
  onChange,
  readOnly,
  ariaLabel,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className={META_EDITABLE_LIST_ITEM}>
      <span className="w-6 shrink-0 pt-2 tabular-nums text-muted-foreground">{index + 1}</span>
      <TextareaField
        placeholder={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        rows={2}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function MetaEditableLinkRow({
  anchor,
  href,
  readOnly,
  onAnchorChange,
  onHrefChange,
  showAddButton,
  onAdd,
  linkLabel,
  onAiLink,
  aiLinkLoading,
}: {
  anchor: string;
  href: string;
  readOnly?: boolean;
  onAnchorChange: (value: string) => void;
  onHrefChange: (value: string) => void;
  showAddButton?: boolean;
  onAdd?: () => void;
  linkLabel?: string;
  onAiLink?: () => void | Promise<void>;
  aiLinkLoading?: boolean;
}) {
  const label = linkLabel ?? "Link";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Field
        value={anchor}
        onChange={(e) => onAnchorChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder="Anchor"
        aria-label={`${label} anchor`}
      />
      <div className="relative min-w-0 flex-1">
        <Field
          value={href}
          onChange={(e) => onHrefChange(e.target.value)}
          readOnly={readOnly}
          disabled={readOnly}
          placeholder="URL"
          aria-label={`${label} URL`}
        />
        {onAiLink ? (
          <MetaFieldEndRail align="top">
            <Button
              variant="quiet"
              type="button"
              disabled={readOnly || aiLinkLoading}
              title="Find an appropriate internal link for this section"
              onClick={() => void onAiLink()}
            >
              {aiLinkLoading ? (
                null
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          </MetaFieldEndRail>
        ) : null}
      </div>
      {showAddButton ? (
        <Button
          type="button"
          disabled={readOnly}
          title="Add link to this section"
          onClick={onAdd}
        >
          <span className="text-base font-medium leading-none">+</span>
        </Button>
      ) : null}
    </div>
  );
}

export function ElementorSectionLinks({
  bodyHtml,
  readOnly,
  onBodyChange,
  onAiLinkRow,
}: {
  bodyHtml: string;
  readOnly?: boolean;
  onBodyChange: (nextHtml: string) => void;
  onAiLinkRow?: (linkIndex: number) => void | Promise<void>;
}) {
  const extracted = React.useMemo(
    () =>
      extractAllSectionLinkRowsFromHtml(bodyHtml).filter((link) => !isWikipediaHref(link.href)),
    [bodyHtml],
  );
  const [pendingRows, setPendingRows] = React.useState<Array<{ anchor: string; href: string }> | null>(null);
  const [aiLinkLoadingIndex, setAiLinkLoadingIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (extracted.length > 0 && !(pendingRows?.length ?? 0)) {
      setPendingRows(null);
    }
  }, [extracted.length, pendingRows?.length]);

  const rows =
    extracted.length > 0
      ? [...extracted, ...(pendingRows ?? [])]
      : (pendingRows ?? [{ anchor: "", href: "" }]);

  const commitRow = (linkIndex: number, patch: { anchor?: string; href?: string }) => {
    const current = rows[linkIndex]!;
    const next = {
      anchor: patch.anchor ?? current.anchor,
      href: patch.href ?? current.href,
    };

    if (linkIndex < extracted.length) {
      onBodyChange(patchSectionLinkAtIndex(bodyHtml, linkIndex, next));
      return;
    }

    const pendingIndex = linkIndex - extracted.length;
    const pending = pendingRows ?? (extracted.length === 0 ? [{ anchor: "", href: "" }] : []);
    const updated = [...pending];
    updated[pendingIndex] = next;
    setPendingRows(updated);

    if (next.anchor.trim() || next.href.trim()) {
      onBodyChange(appendInternalLinkToHtml(bodyHtml, next.anchor, next.href));
      const remaining = updated.filter((_, i) => i !== pendingIndex);
      setPendingRows(remaining.length > 0 ? remaining : null);
    }
  };

  const handleAdd = () => {
    if (extracted.length > 0) {
      onBodyChange(appendInternalLinkToHtml(bodyHtml, "", ""));
      return;
    }
    const base = pendingRows ?? [{ anchor: "", href: "" }];
    setPendingRows([...base, { anchor: "", href: "" }]);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      {rows.map((link, linkIndex) => (
        <MetaEditableLinkRow
          key={`section-link-${linkIndex}`}
          linkLabel={`Section link ${linkIndex + 1}`}
          anchor={link.anchor}
          href={link.href}
          readOnly={readOnly}
          onAnchorChange={(nextAnchor) => commitRow(linkIndex, { anchor: nextAnchor })}
          onHrefChange={(nextHref) => commitRow(linkIndex, { href: nextHref })}
          showAddButton={linkIndex === rows.length - 1}
          onAdd={handleAdd}
          onAiLink={
            onAiLinkRow
              ? async () => {
                  setAiLinkLoadingIndex(linkIndex);
                  try {
                    await onAiLinkRow(linkIndex);
                  } finally {
                    setAiLinkLoadingIndex(null);
                  }
                }
              : undefined
          }
          aiLinkLoading={aiLinkLoadingIndex === linkIndex}
        />
      ))}
    </div>
  );
}

export function MetaFieldEndRail({
  align,
  className,
  children,
}: {
  align: "center" | "top";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-1 z-10",
        align === "center" && "top-1/2 -translate-y-1/2",
        align === "top" && "top-1.5",
        className,
      )}
    >
      <div className={cn("pointer-events-auto", META_FIELD_END_RAIL)}>{children}</div>
    </div>
  );
}

export function MetaAccordionStripeRow({
  stripeIndex,
  children,
}: {
  stripeIndex: number;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "w-full min-w-0")}>{children}</div>
  );
}

export function MetaAccordionHeaderRow({
  open,
  icon,
  label,
  count,
  countTitle,
  action,
}: {
  open: boolean;
  icon: React.ReactNode;
  label: string;
  count: string;
  countTitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
      <CollapsibleTrigger asChild>
        <Button variant="quiet">
          {icon}
          <span className="min-w-0 flex-1 break-words text-left">{label}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <div className={cn(META_FIELD_END_RAIL, "shrink-0")}>
        <span
          className={cn(
            META_FIELD_COUNT,
            META_FIELD_END_RAIL_CELL,
            "min-w-[1.75rem] tabular-nums font-semibold",
          )}
          title={countTitle}
        >
          {count}
        </span>
        {action}
      </div>
    </div>
  );
}


import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getStoredSites } from "@/components/integrations/storage";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
  TASK_FORM_SELECT_CONTENT_CLASS,
  TASK_FORM_SELECT_ITEM_CLASS,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";
import { cn } from "@/lib/utils";
import {
  ENTITY_SAP_PACKAGE_SELECT_OPTIONS,
  payloadForEntitySapPackageMode,
  resolveEntitySapPackageMode,
  type EntitySapPackageMode,
} from "@/lib/editorial/entity-sap-package-mode";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";

export type EntitySapPageCountFieldsProps = {
  executionPayload: EntityPageCreatorExecutionPayload;
  disabled?: boolean;
  clientSiteId?: string;
  onChange: (payload: EntityPageCreatorExecutionPayload) => void;
};

function SapPackageMenu({
  mode,
  menuWidth,
  onPick,
}: {
  mode: EntitySapPackageMode;
  menuWidth?: number;
  onPick: (nextMode: EntitySapPackageMode) => void;
}): React.ReactElement {
  return (
    <PopoverContent
      align="start"
      side="bottom"
      sideOffset={2}
      collisionPadding={12}
      onOpenAutoFocus={(event) => event.preventDefault()}
      style={menuWidth ? { width: menuWidth } : undefined}
      className={cn(
        TASK_FORM_SELECT_CONTENT_CLASS,
        "z-[200] max-h-64 rounded-none p-1 shadow-lg",
        menuWidth ? "w-auto" : "w-[var(--radix-popover-trigger-width)]",
      )}
    >
      <ul className="flex flex-col gap-0.5">
        {ENTITY_SAP_PACKAGE_SELECT_OPTIONS.map((opt) => (
          <li key={opt.value}>
            <button
              type="button"
              className={cn(
                TASK_FORM_SELECT_ITEM_CLASS,
                "flex min-h-10 w-full items-center rounded-none px-3 py-2 text-left hover:bg-zinc-900",
                mode === opt.value && "bg-zinc-900/80 text-primary",
              )}
              onClick={() => onPick(opt.value)}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
    </PopoverContent>
  );
}

export function EntitySapPageCountFields({
  executionPayload,
  disabled = false,
  clientSiteId = "",
  onChange,
}: EntitySapPageCountFieldsProps): React.ReactElement {
  const rowRef = useRef<HTMLDivElement>(null);
  const customCountRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);
  const payload = ensureEntityPageCreatorPayload(executionPayload);
  const site = useMemo(() => {
    const id = clientSiteId.trim();
    if (!id) return null;
    return getStoredSites().find((item) => item.id === id) ?? null;
  }, [clientSiteId]);

  const mode = resolveEntitySapPackageMode(payload, site);
  const customCount = Math.max(1, Math.floor(Number(payload.entityPageCount) || 1));
  const [customDraft, setCustomDraft] = useState(() => String(customCount));
  const presetLabel =
    ENTITY_SAP_PACKAGE_SELECT_OPTIONS.find((opt) => opt.value === mode)?.label ??
    "SAP pages this month";

  useEffect(() => {
    if (mode === "custom") {
      setCustomDraft(String(customCount));
    }
  }, [mode, customCount]);

  const applyMode = (nextMode: EntitySapPackageMode, nextCustomCount?: number) => {
    onChange(
      ensureEntityPageCreatorPayload(
        payloadForEntitySapPackageMode(nextMode, payload, nextCustomCount),
      ),
    );
  };

  useEffect(() => {
    if (mode !== "custom" || disabled) return;
    customCountRef.current?.focus();
    customCountRef.current?.select();
  }, [mode, disabled]);

  const syncMenuWidth = useCallback(() => {
    setMenuWidth(rowRef.current?.offsetWidth);
  }, []);

  const handleMenuOpenChange = (open: boolean) => {
    if (open) syncMenuWidth();
    setMenuOpen(open);
  };

  const pickMode = (nextMode: EntitySapPackageMode) => {
    applyMode(nextMode);
    setMenuOpen(false);
  };

  if (mode !== "custom") {
    return (
      <TaskFormPlaceholderCell>
        <Popover open={menuOpen} onOpenChange={handleMenuOpenChange}>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              type="button"
              className="flex h-9 min-h-9 w-full min-w-0 items-center justify-between gap-2 bg-transparent px-2 text-left text-base text-white outline-none disabled:opacity-50"
              aria-label="SAP pages this month"
              aria-expanded={menuOpen}
            >
              <span className="min-w-0 flex-1 truncate">{presetLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <SapPackageMenu mode={mode} onPick={pickMode} />
        </Popover>
      </TaskFormPlaceholderCell>
    );
  }

  return (
    <TaskFormPlaceholderCell>
      <Popover open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <div ref={rowRef} className="relative flex h-9 min-h-9 w-full min-w-0 items-stretch">
          <PopoverAnchor asChild>
            <div className="pointer-events-none absolute inset-0" aria-hidden />
          </PopoverAnchor>
          <Input
            ref={customCountRef}
            type="text"
            inputMode="numeric"
            placeholder="SAP pages this month"
            disabled={disabled}
            aria-label="SAP pages this month"
            value={customDraft}
            className={cn(TASK_FORM_FLAT_CONTROL_CLASS, "relative z-[1] min-w-0 flex-1 px-2 tabular-nums")}
            onChange={(event) => {
              setCustomDraft(event.target.value.replace(/\D/g, ""));
            }}
            onBlur={() => {
              const next = Number.parseInt(customDraft, 10);
              const committed = Number.isFinite(next) && next > 0 ? next : 1;
              setCustomDraft(String(committed));
              applyMode("custom", committed);
            }}
          />
          <PopoverTrigger asChild disabled={disabled}>
            <button
              type="button"
              className="relative z-[1] flex h-9 w-10 shrink-0 items-center justify-center bg-transparent text-muted-foreground outline-none disabled:opacity-50"
              aria-label="SAP package options"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
        </div>
        <SapPackageMenu mode={mode} menuWidth={menuWidth} onPick={pickMode} />
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

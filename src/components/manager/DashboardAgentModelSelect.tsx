import React, { useEffect, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import type { OpenRouterModelCatalogEntry } from "@/lib/openrouter-app-api";
import {
  catalogEntryById,
  filterCatalogForAgentKind,
  formatModelPriceHint,
  modelMatchesOpenRouterQuery,
} from "@/lib/openrouter-models-catalog";
import type { PipelineAgentKind } from "@/lib/agent-pipeline-cost-estimates";
import { formatEstimateUsd } from "@/lib/agent-pipeline-cost-estimates";
import { estimateImageOutputCostUsd } from "@/lib/image-model-defaults";
import { cn } from "@/lib/utils";

type Preset = { value: string; label: string; priceHint?: string };

function modelDisplayName(
  preset: Preset | undefined,
  modelId: string,
  entry: OpenRouterModelCatalogEntry | undefined,
): string {
  return preset?.label || entry?.name || modelId;
}

function appendLocalTag(label: string, entry: OpenRouterModelCatalogEntry | undefined): string {
  if (!entry?.local) return label;
  return `${label} · Local`;
}

function optionLabel(
  preset: Preset | undefined,
  modelId: string,
  entry: OpenRouterModelCatalogEntry | undefined,
  agentKind: PipelineAgentKind,
  nameOnly: boolean,
): string {
  if (nameOnly) {
    return appendLocalTag(modelDisplayName(preset, modelId, entry), entry);
  }
  const presetLabel = preset?.label ?? "";
  const price = formatModelPriceHint(entry) ?? preset?.priceHint ?? null;
  if (price) {
    const base = presetLabel || entry?.name || modelId;
    return appendLocalTag(`${base} · ${price}`, entry);
  }
  if (agentKind === "image") {
    const base = presetLabel || entry?.name || modelId;
    const usd = estimateImageOutputCostUsd(modelId, "16:9");
    return appendLocalTag(`${base} · ~${formatEstimateUsd(usd)}/16:9 image`, entry);
  }
  return appendLocalTag(presetLabel || entry?.name || modelId, entry);
}

type ListRow = { value: string; label: string; group: "Recommended" | "All models" };

export function DashboardAgentModelSelect({
  label,
  description,
  value,
  presets,
  onChange,
  agentKind,
  catalog,
  catalogLoading,
  workloadHint,
  tile = false,
}: {
  label: string;
  description?: string;
  value: string;
  presets: Preset[];
  onChange: (modelId: string) => void;
  agentKind: PipelineAgentKind;
  catalog: OpenRouterModelCatalogEntry[] | null;
  catalogLoading: boolean;
  workloadHint?: string | null;
  /** Compact cell for pipeline agent grid. */
  tile?: boolean;
}) {
  const id = React.useId();
  const listId = React.useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const nameOnly = tile;

  const selectedLabel = useMemo(() => {
    const preset = presets.find((p) => p.value === value);
    return optionLabel(preset, value, catalogEntryById(catalog, value), agentKind, nameOnly);
  }, [agentKind, catalog, nameOnly, presets, value]);

  const rows = useMemo(() => {
    const presetIds = new Set(presets.map((p) => p.value));
    const q = query.trim();
    const out: ListRow[] = [];

    for (const p of presets) {
      const probe = { id: p.value, name: p.label };
      if (!modelMatchesOpenRouterQuery(probe, q)) continue;
      out.push({
        value: p.value,
        label: optionLabel(p, p.value, catalogEntryById(catalog, p.value), agentKind, nameOnly),
        group: "Recommended",
      });
    }

    if (!presets.some((p) => p.value === value) && value.trim()) {
      const probe = { id: value, name: value };
      if (modelMatchesOpenRouterQuery(probe, q)) {
        out.push({
          value,
          label: optionLabel(undefined, value, catalogEntryById(catalog, value), agentKind, nameOnly),
          group: "Recommended",
        });
      }
    }

    if (catalog?.length) {
      const forKind = filterCatalogForAgentKind(catalog, agentKind);
      let catalogRows = forKind.filter((m) => !presetIds.has(m.id));
      if (q) {
        catalogRows = catalogRows.filter((m) => modelMatchesOpenRouterQuery(m, q));
      }
      const catalogCap = q ? 250 : 80;
      for (const m of catalogRows.slice(0, catalogCap)) {
        out.push({
          value: m.id,
          label: optionLabel(undefined, m.id, m, agentKind, nameOnly),
          group: "All models",
        });
      }
    }

    return out;
  }, [agentKind, catalog, nameOnly, presets, query, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
    setQuery("");
  };

  const inputValue = open ? query : selectedLabel;
  const inputPlaceholder = catalogLoading
    ? "Loading OpenRouter models…"
    : "Type to filter models (e.g. deepseek v4.1)";

  let lastGroup: ListRow["group"] | null = null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        tile ? "items-start gap-1.5 bg-zinc-900 p-2 text-left" : "gap-2",
      )}
      ref={rootRef}
    >
      <Label htmlFor={id} className="self-start text-base font-semibold text-white">
        {label}
      </Label>
      {description?.trim() ? (
        <p className="text-base text-white/80">{description.trim()}</p>
      ) : null}
      <div className="relative w-full min-w-0 self-stretch">
        <Input
          id={id}
          variant={tile ? "neoPulseBlack" : "default"}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={inputValue}
          placeholder={inputPlaceholder}
          disabled={catalogLoading}
          className={cn(
            "w-full min-w-0 rounded-none border-0 shadow-none text-white",
            tile
              ? "h-9 bg-black px-2 text-left text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-0"
              : cn(DASHBOARD_SETTINGS_FIELD_CLASS, "h-12 tabular-nums"),
          )}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              return;
            }
            if (!open || rows.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const row = rows[activeIndex];
              if (row) pick(row.value);
            }
          }}
        />
        {open && rows.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-[min(24rem,70vh)] w-full overflow-y-auto border-0 bg-black py-1 text-base text-white shadow-lg"
          >
            {rows.map((row, index) => {
              const showHeading = row.group !== lastGroup;
              lastGroup = row.group;
              return (
                <React.Fragment key={row.value}>
                  {showHeading ? (
                    <p className="px-3 py-1.5 text-base text-white/70">{row.group}</p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={row.value === value}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-base tabular-nums hover:bg-white/10",
                      index === activeIndex && "bg-white/10",
                      row.value === value && "text-[#9eff00]",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(row.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {row.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ) : null}
        {open && !catalogLoading && rows.length === 0 && query.trim() ? (
          <div className="absolute z-50 mt-1 w-full border-0 bg-black px-3 py-2 text-base text-white/70">
            No models match “{query.trim()}”.
          </div>
        ) : null}
      </div>
      {!tile && workloadHint ? (
        <p className="min-h-8 text-base tabular-nums text-white/70">{workloadHint}</p>
      ) : null}
    </div>
  );
}

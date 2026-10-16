import { cn } from "@/lib/utils";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  recipeCategoryFrameClass,
} from "@/components/manager/pulse-forge/forge-recipe-styles";
import {
  FORGE_CLIENT_TILE_ACCENT_WIDTH_CLASS,
  forgeClientColorUnique,
} from "@/lib/pulse-forge/forge-client-colors";
import { resolveWorkflowClientSiteIds, workflowClientScope } from "@/lib/workflow/workflow-client-config";
import { findClientNode } from "@/lib/workflow/workflow-graph-utils";
import { getPropertyListRowIconButtonHoverGlowClass } from "@/components/integrations/wordpress/cyberpunk-theme";
import type { WorkflowClientConfig, WorkflowDefinition, WorkflowNodeKind, WorkflowStatus } from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind, isWorkflowTriggerKind } from "@/lib/workflow/workflow-types";

export const WORKFLOW_HEADER_BAND_CLASS =
  "flex h-11 w-full shrink-0 items-center gap-1.5 bg-black px-3 sm:px-3.5";

export const WORKFLOW_HEADER_NAME_CLASS = cn(
  BULK_HEADER_FIELD,
  "h-8 min-h-8 min-w-0 flex-1 px-2 font-normal",
);

export const WORKFLOW_HEADER_TOOL_BTN = BULK_HEADER_TOOL_BTN;

export const WORKFLOW_HEADER_RUN_BTN = BULK_HEADER_RUN_BTN;

export const WORKFLOW_INSPECTOR_RUN_BTN = cn(
  WORKFLOW_HEADER_RUN_BTN,
  "h-8 w-auto self-start shrink-0 gap-1.5 px-2.5",
);

export const WORKFLOW_STEP_TEST_GRID_CLASS =
  "grid w-full min-w-0 grid-cols-[auto_repeat(4,minmax(0,1fr))] grid-rows-1 gap-0.5 overflow-hidden";

export const WORKFLOW_STEP_TEST_CELL_CLASS =
  "flex h-8 min-w-0 items-center overflow-hidden rounded-none bg-black px-2 py-0";

/** Step card footer: utility actions only (trash left, duplicate right). */
export const WORKFLOW_STEP_ACTION_BAR_CLASS =
  "flex h-10 w-full shrink-0 items-center gap-0 bg-black px-1";

export const WORKFLOW_STEP_ACTION_SLOT_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground";

export const WORKFLOW_STEP_ACTION_BTN_CLASS = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-white focus-visible:outline-none focus:!ring-0 focus-visible:!ring-0",
);

export const WORKFLOW_STEP_UTILITY_ICON_CLASS = "h-6 w-6";

export const WORKFLOW_STEP_TYPE_ICON_SLOT_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center";

export const WORKFLOW_STEP_TYPE_ICON_CLASS = "h-6 w-6";

export const WORKFLOW_HEADER_SELECT_CLASS = cn(
  BULK_HEADER_SELECT,
  "h-8 min-w-[12rem] shrink-0 [color-scheme:dark]",
);

export const WORKFLOW_SIDEBAR_BG_CLASS = "bg-[#09090B]";

export const WORKFLOW_SIDEBAR_FIELD_CLASS = "bg-[#18181B]";

export const WORKFLOW_SIDEBAR_ROW_CLASS = cn(
  WORKFLOW_SIDEBAR_FIELD_CLASS,
  "transition-colors hover:brightness-110",
);

export const WORKFLOW_RIGHT_RAIL_WIDTH_CLASS = "w-[min(520px,36vw)] min-w-[360px] xl:min-w-[460px]";

export const WORKFLOW_BUILDER_CANVAS_CLASS = "h-full min-h-0 flex-1 overflow-y-auto bg-black";
export const WORKFLOW_COLUMN_CLASS = "mx-auto flex w-full max-w-[360px] flex-col items-center py-8";
export const WORKFLOW_CONNECTOR_CLASS = "h-8 w-px bg-primary/40";
export const WORKFLOW_RIGHT_RAIL_CLASS =
  `flex ${WORKFLOW_RIGHT_RAIL_WIDTH_CLASS} shrink-0 flex-col border-l border-white/10 shadow-tile ${WORKFLOW_SIDEBAR_BG_CLASS}`;

export const WORKFLOW_STEP_TILE_CLASS = cn(
  "rounded-none border-0 bg-[#18181B] text-white shadow-tile",
  getPropertyListRowIconButtonHoverGlowClass("powerOn"),
);

export const WORKFLOW_INSERT_BTN_CLASS = cn(
  WORKFLOW_STEP_TILE_CLASS,
  "inline-flex h-10 w-10 shrink-0 items-center justify-center",
);

export const WORKFLOW_ADD_STEP_ROW_CLASS = cn(
  WORKFLOW_STEP_TILE_CLASS,
  "mt-2 flex w-full items-center justify-center gap-2 px-4 py-3 text-base text-muted-foreground hover:text-white",
);

export function workflowStepCardClass(options: {
  kind: WorkflowNodeKind;
  selected?: boolean;
  recipeCategory?: string;
  clientSiteId?: string;
}): string {
  const { kind, selected, recipeCategory, clientSiteId } = options;
  const accent =
    recipeCategory != null
      ? recipeCategoryFrameClass(recipeCategory)
      : kind === "workflow_client"
        ? cn(
            FORGE_CLIENT_TILE_ACCENT_WIDTH_CLASS,
            forgeClientColorUnique(clientSiteId).borderClass,
          )
        : isWorkflowTriggerKind(kind)
          ? "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-warning))]"
          : kind === "path_rules"
            ? "border-l-[length:var(--tile-accent-width)] border-l-[hsl(280_65%_58%)]"
            : kind === "rag_archive"
              ? "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-data))]"
              : isWorkflowThenKind(kind)
                ? "border-l-[length:var(--tile-accent-width)] border-l-[hsl(160_55%_45%)]"
                : "border-l-[length:var(--tile-accent-width)] border-l-primary";

  return cn(
    WORKFLOW_STEP_TILE_CLASS,
    "w-full cursor-pointer p-4 text-left transition-shadow",
    accent,
    selected && "ring-1 ring-primary shadow-tile-pop",
  );
}

export function workflowKindBadgeClass(kind: WorkflowNodeKind, clientSiteId?: string): string {
  if (kind === "workflow_client") return forgeClientColorUnique(clientSiteId).textClass;
  if (isWorkflowTriggerKind(kind)) return "text-[hsl(var(--semantic-warning-foreground))]";
  if (kind === "rag_archive") return "text-[hsl(var(--semantic-data-foreground))]";
  if (kind === "path_rules") return "text-[hsl(280_65%_72%)]";
  if (isWorkflowThenKind(kind)) return "text-[hsl(160_55%_58%)]";
  return "text-primary";
}

export const WORKFLOW_RAIL_TAB_CLASS = cn(
  WORKFLOW_SIDEBAR_BG_CLASS,
  "flex-1 px-6 py-4 text-base font-normal text-muted-foreground hover:text-white data-[active=true]:bg-[#18181B] data-[active=true]:text-primary",
);

export const WORKFLOW_INSPECTOR_TILE_CLASS = cn(
  "flex h-full flex-col gap-1 overflow-y-auto",
  WORKFLOW_SIDEBAR_BG_CLASS,
);
export const WORKFLOW_INSPECTOR_GROUP_CLASS = cn(
  WORKFLOW_SIDEBAR_FIELD_CLASS,
  "flex flex-col gap-4 p-5",
);
export const WORKFLOW_INSPECTOR_GROUP_TITLE_CLASS = "text-base font-normal text-white";
export const WORKFLOW_INSPECTOR_FIELD_GRID_CLASS = "grid grid-cols-1 gap-4";
export const WORKFLOW_INSPECTOR_FIELD_CELL_CLASS =
  "flex min-h-12 min-w-0 flex-col justify-center rounded-none bg-transparent px-0 py-0";
export const WORKFLOW_INSPECTOR_TITLE_INPUT_CLASS = cn(
  BULK_HEADER_FIELD,
  "h-8 min-h-8 w-full px-2 font-normal",
);
export const WORKFLOW_INSPECTOR_INFIELD_CLASS = cn(
  WORKFLOW_SIDEBAR_FIELD_CLASS,
  "flex min-h-12 w-full items-center rounded-none px-4 py-3 text-base font-normal",
);
export const WORKFLOW_INSPECTOR_KIND_HEADER_CLASS = cn(
  WORKFLOW_SIDEBAR_FIELD_CLASS,
  "flex flex-col gap-4 p-5",
);
export const WORKFLOW_INSPECTOR_KIND_LABEL_CLASS = "text-base font-normal tracking-wide";

export const WORKFLOW_FORM_FLAT_CONTROL_CLASS =
  "h-8 min-h-8 w-full min-w-0 rounded-none border-0 bg-transparent p-0 text-base font-normal text-white shadow-none outline-none ring-0 focus-visible:ring-0";

export const WORKFLOW_FORM_SELECT_TRIGGER_CLASS =
  "h-8 min-h-8 rounded-none border-0 bg-transparent p-0 text-base font-normal text-white shadow-none focus:ring-0 focus:ring-offset-0";

export const WORKFLOW_FORM_SELECT_ITEM_CLASS =
  "text-base font-normal text-white focus:bg-[#09090B] focus:text-white";

export const WORKFLOW_FORM_SELECT_CONTENT_CLASS =
  "border-0 bg-[#000] text-base text-white shadow-lg";

function workflowAccentCategory(status: WorkflowStatus): string {
  return status === "published" ? "editorial" : "research";
}

export function workflowStatusLabel(status: WorkflowStatus): string {
  return status === "published" ? "Published" : "Draft";
}

/** Fixed workflow list tile: title + wrapping blurb beside stacked trash/count. */
export const WORKFLOW_CARD_FIXED_CLASS =
  "flex h-[8.5rem] w-full min-w-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-zinc-900 p-3 text-white shadow-tile transition-[box-shadow]";

function workflowAccentHoverGlowClass(status: WorkflowStatus): string {
  // Match left accent: draft = research blue, published = editorial primary green.
  return status === "published"
    ? "hover:shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
    : "hover:shadow-[0_0_18px_hsla(200,70%,52%,0.55)]";
}

export function workflowCardClassName(status: WorkflowStatus, selected = false): string {
  return cn(
    WORKFLOW_CARD_FIXED_CLASS,
    recipeCategoryFrameClass(workflowAccentCategory(status)),
    workflowAccentHoverGlowClass(status),
    selected && "ring-1 ring-primary shadow-tile-pop",
  );
}

/** Title Case; strip punctuation; keep acronym casing inside words (GSC, MoM). */
export function workflowCardTitleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const cleaned = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      if (!cleaned) return "";
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    })
    .filter(Boolean)
    .join(" ");
}

/** Join stored AI blurb lines into one wrapping body (exactly two display rows via CSS). */
export function workflowCardDescriptionText(description: string | undefined): string {
  const raw = description?.trim() ?? "";
  if (!raw) return "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

export function workflowClientSiteIds(
  workflow: Pick<WorkflowDefinition, "nodes" | "wordpressSiteId">,
  availableSiteIds: string[] = [],
): string[] {
  const client = findClientNode(workflow);
  if (client) {
    const config = client.config as WorkflowClientConfig;
    if (workflowClientScope(config) === "all" && availableSiteIds.length > 0) {
      return resolveWorkflowClientSiteIds(config, availableSiteIds);
    }
    const siteIds = config.siteIds;
    if (siteIds?.length) return siteIds;
  }
  return workflow.wordpressSiteId ? [workflow.wordpressSiteId] : [];
}

export function workflowMatchesClientFilter(
  workflow: Pick<WorkflowDefinition, "nodes" | "wordpressSiteId">,
  clientId: string,
): boolean {
  if (!clientId) return true;
  const siteIds = workflowClientSiteIds(workflow);
  if (siteIds.length === 0) return true;
  return siteIds.includes(clientId) || workflow.wordpressSiteId === clientId;
}

export type WorkflowListSection = {
  status: WorkflowStatus;
  label: string;
  workflows: WorkflowDefinition[];
};

export function groupWorkflowsByStatus(workflows: WorkflowDefinition[]): WorkflowListSection[] {
  const draft = workflows.filter((workflow) => workflow.status !== "published");
  const published = workflows.filter((workflow) => workflow.status === "published");
  const sections: WorkflowListSection[] = [];
  if (draft.length > 0) {
    sections.push({ status: "draft", label: "Draft", workflows: draft });
  }
  if (published.length > 0) {
    sections.push({ status: "published", label: "Published", workflows: published });
  }
  return sections;
}

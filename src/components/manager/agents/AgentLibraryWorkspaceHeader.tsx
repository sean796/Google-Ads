import { Bot, RotateCw, Search } from "lucide-react";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui";

import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
  BULK_TOOLBAR_GROUP_DIVIDER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type {
  AgentLibraryCategoryFilter,
  AgentLibraryDomainFilter,
  AgentLibrarySection,
} from "@/lib/agent-library/agent-library-api";
import { cn } from "@/lib/utils";

export interface AgentLibraryWorkspaceHeaderProps {
  activeSection: AgentLibrarySection;
  onSectionChange: (section: AgentLibrarySection) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  domainFilter: AgentLibraryDomainFilter;
  onDomainFilterChange: (domain: AgentLibraryDomainFilter) => void;
  categoryFilter: AgentLibraryCategoryFilter;
  onCategoryFilterChange: (category: AgentLibraryCategoryFilter) => void;
  totalCount: number;
  visibleCount: number;
  busy: boolean;
  onRefresh: () => void;
}

const DOMAIN_OPTIONS: { value: AgentLibraryDomainFilter; label: string }[] = [
  { value: "all", label: "All domains" },
  { value: "slack-hub", label: "Slack & Hub Agents" },
  { value: "aiseo", label: "AISEO Optimizer" },
  { value: "blog-generator", label: "Blog Generator" },
  { value: "entity-sap", label: "Entity & SAP" },
  { value: "sitemap-optimizer", label: "Sitemap Optimizer" },
  { value: "competitor-research", label: "Competitor Research" },
  { value: "reporting", label: "Reporting" },
  { value: "ppc-ads", label: "PPC & Ads" },
  { value: "video", label: "Video Studio" },
  { value: "wikipedia", label: "Wikipedia & Graph" },
  { value: "emcp", label: "Neo MCP Engine" },
];

const CATEGORY_OPTIONS: { value: AgentLibraryCategoryFilter; label: string }[] = [
  { value: "all", label: "All model categories" },
  { value: "research", label: "Research model" },
  { value: "blog", label: "Blog model" },
  { value: "meta", label: "Meta model" },
  { value: "report", label: "Report model" },
  { value: "ads", label: "Ads model" },
  { value: "image", label: "Image model" },
  { value: "video", label: "Video model" },
];

export function AgentLibraryWorkspaceHeader({
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchQueryChange,
  domainFilter,
  onDomainFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  totalCount,
  visibleCount,
  busy,
  onRefresh,
}: AgentLibraryWorkspaceHeaderProps) {
  return (
    <UnifiedWorkspaceChrome
      icon={Bot}
      title="Agent Library"
      titleRowEnd={
        <div className="flex items-center gap-1.5">
          <WorkspacePill
            label="Library"
            active={activeSection === "library"}
            square
            onClick={() => onSectionChange("library")}
          />
          <WorkspacePill
            label="Hub Settings"
            active={activeSection === "settings"}
            square
            onClick={() => onSectionChange("settings")}
          />
        </div>
      }
      toolbar={
        <>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search agents by name, id, or module"
              aria-label="Search agents by name, id, or module"
              className={cn(BULK_HEADER_FIELD, "w-64 pl-8 sm:w-80")}
            />
          </div>
          <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
          <Select
            value={domainFilter}
            onValueChange={(val) => onDomainFilterChange(val as AgentLibraryDomainFilter)}
          >
            <SelectTrigger
              aria-label="Filter agents by domain"
              className={cn(BULK_HEADER_SELECT_TRIGGER, "min-w-[11rem]")}
            >
              <SelectValue placeholder="Domain filter" />
            </SelectTrigger>
            <SelectContent>
              {DOMAIN_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryFilter}
            onValueChange={(val) => onCategoryFilterChange(val as AgentLibraryCategoryFilter)}
          >
            <SelectTrigger
              aria-label="Filter agents by model category"
              className={cn(BULK_HEADER_SELECT_TRIGGER, "min-w-[11.5rem]")}
            >
              <SelectValue placeholder="Model category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap font-sans text-base tabular-nums text-muted-foreground">
              {visibleCount} / {totalCount} agents
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className={cn(BULK_HEADER_TOOL_BTN, "inline-flex items-center gap-1.5")}
              aria-label="Refresh Agent Library"
            >
              <RotateCw className={cn("h-4 w-4", busy && "animate-pulse")} aria-hidden />
              Refresh
            </button>
          </div>
        </>
      }
      workspaceBusy={busy}
      progressBand="empty"
    />
  );
}

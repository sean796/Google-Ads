import { Trash2 } from "lucide-react";
import {
  ActionButton,
  Button,
  Field,
  FilterRow,
  FilterRowDivider,
  SelectField,
} from "@/ui";
import type { KnowledgeBaseSectionId, KnowledgeProfile } from "@/lib/knowledge-base/types";

export type KnowledgeBaseToolbarProps = {
  activeSection: KnowledgeBaseSectionId;
  disabled: boolean;
  profiles: KnowledgeProfile[];
  selectedProfile: string;
  onSelectedProfileChange: (id: string) => void;
  newProfileName: string;
  onNewProfileNameChange: (value: string) => void;
  onSaveNewProfile: () => void;
  onUpdateProfile: () => void;
  onClearContent: () => void;
  fileCount: number;
  totalSizeLabel: string;
  unstarredCount: number;
  onClearUnstarred: () => void;
  onClearAll: () => void;
  scraperUrl: string;
  onScraperUrlChange: (value: string) => void;
  scraperMaxPages: number;
  onScraperMaxPagesChange: (value: number) => void;
  scraperRunning: boolean;
  onStartScrape: () => void;
  onCancelScrape: () => void;
};

const SCRAPE_STATES = ["Start", "Scraping"] as const;

export function KnowledgeBaseToolbar({
  activeSection,
  disabled,
  profiles,
  selectedProfile,
  onSelectedProfileChange,
  newProfileName,
  onNewProfileNameChange,
  onSaveNewProfile,
  onUpdateProfile,
  onClearContent,
  fileCount,
  totalSizeLabel,
  unstarredCount,
  onClearUnstarred,
  onClearAll,
  scraperUrl,
  onScraperUrlChange,
  scraperMaxPages,
  onScraperMaxPagesChange,
  scraperRunning,
  onStartScrape,
  onCancelScrape,
}: KnowledgeBaseToolbarProps) {
  if (activeSection === "text") {
    return (
      <>
        <SelectField
          placeholder="Profile"
          value={selectedProfile}
          onValueChange={onSelectedProfileChange}
          options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
          disabled={disabled}
        />
        <Field
          placeholder="New profile name"
          value={newProfileName}
          onChange={(e) => onNewProfileNameChange(e.target.value)}
          disabled={disabled}
        />
        <Button variant="run" disabled={disabled} onClick={onSaveNewProfile}>
          Save New
        </Button>
        <Button disabled={disabled || !selectedProfile} onClick={onUpdateProfile}>
          Update
        </Button>
        <FilterRowDivider />
        <Button variant="danger" disabled={disabled} onClick={onClearContent}>
          Clear Content
        </Button>
      </>
    );
  }

  if (activeSection === "upload") {
    return (
      <span className="text-base text-muted-foreground">
        Drag and drop or click the zone below. Accepts .txt, .md, .pdf, .json, .csv
      </span>
    );
  }

  if (activeSection === "manager") {
    return (
      <>
        <span className="text-base text-muted-foreground">
          {fileCount} files · {totalSizeLabel}
        </span>
        <FilterRow align="end">
          <Button
            variant="danger"
            icon={Trash2}
            reserved={unstarredCount === 0}
            disabled={disabled}
            onClick={onClearUnstarred}
          >
            Clear temp ({unstarredCount})
          </Button>
          <Button variant="danger" disabled={disabled || fileCount === 0} onClick={onClearAll}>
            Clear all
          </Button>
        </FilterRow>
      </>
    );
  }

  if (activeSection === "scraper") {
    return (
      <>
        <Field
          placeholder="Site URL to scrape"
          value={scraperUrl}
          onChange={(e) => onScraperUrlChange(e.target.value)}
          disabled={disabled || scraperRunning}
        />
        <Field
          type="number"
          size="count"
          min={1}
          max={200}
          placeholder="Max pages"
          value={scraperMaxPages}
          disabled={disabled || scraperRunning}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            onScraperMaxPagesChange(
              Math.max(1, Math.min(200, Number.isNaN(parsed) ? 1 : parsed)),
            );
          }}
        />
        <ActionButton
          states={SCRAPE_STATES}
          state={scraperRunning ? "Scraping" : "Start"}
          disabled={disabled || scraperRunning}
          onClick={onStartScrape}
        />
        <Button variant="danger" reserved={!scraperRunning} onClick={onCancelScrape}>
          Cancel
        </Button>
      </>
    );
  }

  return null;
}

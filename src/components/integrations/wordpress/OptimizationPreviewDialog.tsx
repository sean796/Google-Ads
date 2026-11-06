import React, { useState } from "react";
import { CheckCircle2, Download, Sparkles, X } from "lucide-react";
import { Button, DialogShell, Pill } from "@/ui";
import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import type { AgentConfig } from "@/types/agent-config";
export interface OptimizationPreviewData {
  primaryKeyword: string;
  keywordData?: KeywordData;
  aiAnalysis?: KeywordAIAnalysis;
  selectedKeywords?: string[];
  selectedH2Sections?: string[];
  selectedPeopleAlsoAsk?: string[];
  selectedResearchLinks?: string[];
  blueprint?: {
    title?: string;
    purpose?: string;
    agents: AgentConfig[];
  };
  checklist?: string[];
  content?: string;
  fileCount?: number;
}

interface OptimizationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: OptimizationPreviewData | null;
  onApprove?: () => void;
  onCancel?: () => void;
  onDownloadFiles?: () => void;
  disabled?: boolean;
}

const TABS = ["keywords", "blueprint", "checklist", "content"] as const;
type PreviewTab = (typeof TABS)[number];
const TAB_LABEL: Record<PreviewTab, string> = {
  keywords: "Keywords",
  blueprint: "Blueprint",
  checklist: "Checklist",
  content: "Content",
};
const BLOCK = "flex flex-col gap-1.5 bg-ui-field p-3";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={BLOCK}>
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className={`${BLOCK} text-base text-muted-foreground`}>{text}</p>;
}

export const OptimizationPreviewDialog: React.FC<OptimizationPreviewDialogProps> = ({
  open,
  onOpenChange,
  data,
  onApprove,
  onCancel,
  onDownloadFiles,
  disabled = false,
}) => {
  const [tab, setTab] = useState<PreviewTab>("keywords");

  if (!data) {
    return null;
  }

  const handleApprove = () => {
    onApprove?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const metrics = data.keywordData
    ? [
        ["Search Volume", data.keywordData.searchVolume?.toLocaleString() || "N/A"],
        ["Competition", data.keywordData.competition || "N/A"],
        ["CPC", `$${data.keywordData.cpc || "N/A"}`],
        ["KD", data.keywordData.difficulty || "N/A"],
      ]
    : [];

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Optimization Preview
        </span>
      }
      description="Review the optimization results before uploading to WordPress"
      actions={
        <>
          {data.fileCount ? (
            <span className="mr-auto flex items-center gap-1.5 text-base text-muted-foreground">
              {data.fileCount} files generated
              {onDownloadFiles ? (
                <Button variant="tool" icon={Download} onClick={onDownloadFiles}>
                  Download
                </Button>
              ) : null}
            </span>
          ) : null}
          <Button variant="tool" icon={X} disabled={disabled} onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="run" icon={CheckCircle2} disabled={disabled} onClick={handleApprove}>
            Approve & Upload
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-1.5">
        {TABS.map((id) => (
          <Pill key={id} label={TAB_LABEL[id]} active={tab === id} onClick={() => setTab(id)} />
        ))}
      </div>

      {tab === "keywords" ? (
        <>
          <Section title="Primary Keyword">
            <p className="text-base font-semibold text-primary">{data.primaryKeyword}</p>
          </Section>
          {metrics.length > 0 ? (
            <Section title="Keyword Metrics">
              <div className="grid grid-cols-2 gap-1.5 text-base">
                {metrics.map(([label, value]) => (
                  <p key={label}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="ml-2 font-semibold">{value}</span>
                  </p>
                ))}
              </div>
            </Section>
          ) : null}
          {data.selectedKeywords?.length ? (
            <Section title={`Selected Keywords (${data.selectedKeywords.length})`}>
              <p className="text-base text-muted-foreground">{data.selectedKeywords.join(", ")}</p>
            </Section>
          ) : null}
          {data.selectedH2Sections?.length ? (
            <Section title={`Selected H2 Sections (${data.selectedH2Sections.length})`}>
              <ul className="list-inside list-disc text-base text-muted-foreground">
                {data.selectedH2Sections.map((section, idx) => (
                  <li key={idx}>{section}</li>
                ))}
              </ul>
            </Section>
          ) : null}
          {data.selectedPeopleAlsoAsk?.length ? (
            <Section title={`People Also Ask (${data.selectedPeopleAlsoAsk.length})`}>
              <ul className="list-inside list-disc text-base text-muted-foreground">
                {data.selectedPeopleAlsoAsk.slice(0, 10).map((question, idx) => (
                  <li key={idx}>{question}</li>
                ))}
                {data.selectedPeopleAlsoAsk.length > 10 ? (
                  <li className="text-foreground">and {data.selectedPeopleAlsoAsk.length - 10} more</li>
                ) : null}
              </ul>
            </Section>
          ) : null}
          {data.aiAnalysis ? (
            <Section title="AI Analysis">
              {data.aiAnalysis.contentGaps?.length ? (
                <p className="text-base text-muted-foreground">Content Gaps: {data.aiAnalysis.contentGaps.length} identified</p>
              ) : null}
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === "blueprint" ? (
        data.blueprint ? (
          <>
            {data.blueprint.title ? (
              <Section title="Title">
                <p className="text-base">{data.blueprint.title}</p>
              </Section>
            ) : null}
            {data.blueprint.purpose ? (
              <Section title="Purpose">
                <p className="text-base text-muted-foreground">{data.blueprint.purpose}</p>
              </Section>
            ) : null}
            <Section title={`Sections (${data.blueprint.agents.length})`}>
              {data.blueprint.agents.map((agent, idx) => (
                <div key={idx} className="bg-ui-field-hover p-2">
                  <p className="text-base font-semibold">{agent.title}</p>
                  {agent.description ? <p className="text-base text-muted-foreground">{agent.description}</p> : null}
                </div>
              ))}
            </Section>
            <Section title="JSON Structure">
              <pre className="max-h-[12.5rem] overflow-auto bg-ui-field-hover p-2 text-base">
                {JSON.stringify(data.blueprint, null, 2)}
              </pre>
            </Section>
          </>
        ) : (
          <Empty text="No blueprint data available" />
        )
      ) : null}

      {tab === "checklist" ? (
        data.checklist?.length ? (
          <Section title={`Checklist (${data.checklist.length} items)`}>
            <ol className="list-inside list-decimal text-base">
              {data.checklist.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ol>
          </Section>
        ) : (
          <Empty text="No checklist available" />
        )
      ) : null}

      {tab === "content" ? (
        data.content ? (
          <Section title={`Generated Content (${data.content.split("\n").length} lines)`}>
            <pre className="max-h-[25rem] overflow-auto whitespace-pre-wrap bg-ui-field-hover p-3 font-mono text-base">
              {data.content}
            </pre>
          </Section>
        ) : (
          <Empty text="No content preview available" />
        )
      ) : null}
    </DialogShell>
  );
};
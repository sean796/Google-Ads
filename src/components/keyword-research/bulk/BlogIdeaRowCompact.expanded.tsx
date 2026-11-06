import { ExternalLink, Sparkles } from "lucide-react";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  importRowLinkEditorUrls,
  serializeModifierLinksJson,
} from "@/lib/bulk/bulk-csv-parser";
import { BlogIdeaModifierLinksEditor } from "@/components/keyword-research/bulk/BlogIdeaModifierLinksEditor";
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import { parseDecisionAuditJson } from "@/components/keyword-research/bulk/decision-audit-json";
import { WorkspaceNestedInput } from "@/components/seo/WorkspaceNestedField";
import { SelectField } from "@/ui";
import { cn } from "@/lib/utils";
import {
  EXPANDED_FIELD_LABEL,
  featuredImageSelectValue,
  modifierFromBlur,
  modifierFromInput,
  previewPathLabel,
  publishDisplayValue,
  sapUrlPathFromRow,
  stopFieldBubble,
  type BlogIdeaRow,
} from "@/components/keyword-research/bulk/BlogIdeaRowCompact.helpers";

export function ExpandedFields({
  row,
  fieldId,
  isProcessing,
  publishDateLabel,
  draftOnly = false,
  onRowChange,
  previewUrl,
}: {
  row: BlogIdeaRow;
  fieldId: (name: string) => string;
  isProcessing: boolean;
  publishDateLabel?: string;
  draftOnly?: boolean;
  onRowChange: (patch: Partial<CSVRow>) => void;
  previewUrl?: string;
}) {
  const livePreview = previewUrl?.trim() || "";
  const slugDisplay =
    row.target_slug?.trim() ||
    sapUrlPathFromRow(row).replace(/^\/+|\/+$/g, "");
  const linkUrls = importRowLinkEditorUrls(row);

  const handleLinksChange = (urls: string[]) => {
    onRowChange({ modifier_links_json: serializeModifierLinksJson(urls) });
  };

  return (
    <div
      className="grid grid-cols-1 gap-1.5 px-2.5 pb-2 pt-1 sm:grid-cols-2 sm:px-3"
      role="group"
      aria-label="Blog idea details"
      onClick={stopFieldBubble}
    >
      <WorkspaceNestedInput
        id={fieldId("title")}
        layout="inline"
        label="Title"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.title ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ title: e.target.value })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("keyword")}
        layout="inline"
        label="Keyword"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.keyword ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ keyword: e.target.value })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("entity")}
        layout="inline"
        label="Entity"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.entity ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ entity: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      {livePreview ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(EXPANDED_FIELD_LABEL, "text-base text-muted-foreground")}>URL</span>
          <a
            href={livePreview}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-base text-primary underline hover:text-primary"
            onClick={stopFieldBubble}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{previewPathLabel(livePreview, row)}</span>
          </a>
        </div>
      ) : (
        <WorkspaceNestedInput
          id={fieldId("slug")}
          layout="inline"
          label="Slug"
          labelClassName={EXPANDED_FIELD_LABEL}
          value={slugDisplay}
          disabled={isProcessing}
          placeholder="post-slug"
          onChange={(e) => onRowChange({ target_slug: e.target.value.trim() || undefined })}
          onClick={stopFieldBubble}
        />
      )}
      {row.wikipedia_url?.trim() ? (
        <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
          <span className={cn(EXPANDED_FIELD_LABEL, "text-base text-muted-foreground")}>Wikipedia</span>
          <a
            href={row.wikipedia_url.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-base text-primary underline hover:text-primary"
            onClick={stopFieldBubble}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{row.wikipedia_url.trim()}</span>
          </a>
        </div>
      ) : null}
      <WorkspaceNestedInput
        id={fieldId("modifier")}
        layout="inline"
        label="Modifier"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.modifier ?? ""}
        disabled={isProcessing}
        placeholder="e.g. comprehensive guide"
        onChange={(e) => onRowChange({ modifier: modifierFromInput(e.target.value) })}
        onBlur={(e) => onRowChange({ modifier: modifierFromBlur(e.target.value) })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("meta")}
        layout="inline"
        label="Meta"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.meta_description ?? ""}
        disabled={isProcessing}
        placeholder="SEO meta description"
        onChange={(e) => onRowChange({ meta_description: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("publish")}
        layout="inline"
        label={draftOnly ? "Status" : "Publish"}
        labelClassName={EXPANDED_FIELD_LABEL}
        value={publishDisplayValue(row, publishDateLabel, draftOnly)}
        disabled={isProcessing || draftOnly}
        placeholder={draftOnly ? "Draft" : "Scheduled date"}
        onChange={(e) => onRowChange({ publish_date_gmt: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      <div
        className="flex min-h-9 min-w-0 flex-row items-stretch overflow-hidden rounded-md bg-ui-field-hover"
        onClick={stopFieldBubble}
      >
        <span className={`${EXPANDED_FIELD_LABEL} flex items-center self-stretch bg-black px-2.5 py-2 text-base`}>
          Image
        </span>
        <div className="flex min-w-0 flex-1 items-center px-2.5">
          <SelectField placeholder="Image" value={featuredImageSelectValue(row)} onValueChange={(v) => onRowChange({ featuredImage: v })} disabled={isProcessing} options={[{ value: "y", label: "AI image" }, { value: "google-maps", label: "Google Maps" }, { value: "n", label: "None" }]} width="full" />
        </div>
      </div>
      <BlogIdeaModifierLinksEditor
        idPrefix={fieldId("links")}
        links={linkUrls}
        disabled={isProcessing}
        onChange={handleLinksChange}
      />
      {row.decision_audit_json ? (
        <div className="sm:col-span-2 mt-1 rounded border border-white/10 bg-ui-field/90 p-2.5 text-xs">
          <div className="flex items-center justify-between font-mono text-base text-foreground pb-1 mb-1.5 border-b border-white/5">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span>Decision Agent Audit (Liquid d1.1)</span>
            </span>
            <DecisionAuditRowBadge auditJson={row.decision_audit_json} showScores />
          </div>
          {(() => {
            const audit = parseDecisionAuditJson(row.decision_audit_json);
            if (!audit) return null;
            return (
              <div className="flex flex-col gap-1.5 text-base">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">On-Brief</span>
                    <span className="text-primary font-bold">{(audit.onBriefProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">Intent Fit</span>
                    <span className="text-white font-bold">{audit.intentScore.toFixed(1)} / 3</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">CTR Appeal</span>
                    <span className="text-white font-bold">{audit.clickAppealScore.toFixed(1)} / 3</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">Policy Safe</span>
                    <span className="text-primary font-bold">{(audit.policySafeProbability * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {audit.reasoning && (
                  <p className="mt-0.5 text-foreground font-sans italic">{audit.reasoning}</p>
                )}
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

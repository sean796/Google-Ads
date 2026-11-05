/**
 * Shared title/keyword/modifier/featured-image fields for SAP CSV rows (SAP tab + CSV dialog).
 */

import React, { useState } from "react";
import { Bot } from "lucide-react";
import { ActionButton, Field, Pill } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY, notifyCopiedX } from "@/lib/notify-messages";
import { generateAITitleSuggestion } from "@/components/integrations/entity-generation/csv/titleSuggestion";
import { replaceTemplateVariables } from "@/components/integrations/entity-generation/csv/csvGenerator";
import type { WordPressSite } from "@/components/integrations/types";

export interface SapTemplateFieldsProps {
  pendingEntitySite: WordPressSite | null;
  entities: string[];
  titleFormat: string;
  onTitleFormatChange: (v: string) => void;
  keyword: string;
  onKeywordChange: (v: string) => void;
  modifier: string;
  onModifierChange: (v: string) => void;
  /** Optional: show table preview (SAP page uses bulk list instead) */
  showPreviewTable?: boolean;
}

const SUGGEST_STATES = ["AI Suggest", "Generating"] as const;
const TITLE_VARIABLES = ["{entity}", "{keyword}"];
const PREVIEW_ROW = "grid grid-cols-[1fr_2fr_6rem] gap-2 bg-ui-field px-3 py-2 text-base";

export const SapTemplateFields: React.FC<SapTemplateFieldsProps> = ({
  pendingEntitySite,
  entities,
  titleFormat,
  onTitleFormatChange,
  keyword,
  onKeywordChange,
  modifier,
  onModifierChange,
  showPreviewTable = true,
}) => {
  const [isGeneratingTitleSuggestion, setIsGeneratingTitleSuggestion] = useState(false);

  const totalEntities = entities?.length ?? 0;
  const handleGenerateAITitleSuggestion = async () => {
    if (!pendingEntitySite || !entities || entities.length === 0) return;
    setIsGeneratingTitleSuggestion(true);
    try {
      const suggestion = await generateAITitleSuggestion(entities, pendingEntitySite);
      if (suggestion) onTitleFormatChange(suggestion);
    } finally {
      setIsGeneratingTitleSuggestion(false);
    }
  };

  const copyVariable = (value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => notify.success(notifyCopiedX(value)))
      .catch(() => notify.error(NOTIFY_FAILED_TO_COPY));
  };

  const previewCount = Math.min(10, totalEntities);

  return (
    <div className="flex flex-col gap-1.5">
      {totalEntities > 0 ? (
        <p className="bg-ui-field px-3 py-2 text-base text-muted-foreground">
          Total entities: {totalEntities} · Featured image: Google Image only (no AI images) · Keyword:{" "}
          {keyword.trim() ? "Set" : "Not set"} · Modifier: {modifier.trim() ? "Set" : "Not set"}
        </p>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Field
          placeholder="Title format, e.g. {keyword} Near {entity}"
          value={titleFormat}
          onChange={(e) => onTitleFormatChange(e.target.value)}
        />
        <ActionButton
          variant="tool"
          states={SUGGEST_STATES}
          state={isGeneratingTitleSuggestion ? "Generating" : "AI Suggest"}
          icon={Bot}
          disabled={isGeneratingTitleSuggestion || totalEntities === 0}
          onClick={handleGenerateAITitleSuggestion}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-base text-muted-foreground">Use variables</span>
        {TITLE_VARIABLES.map((value) => (
          <Pill key={value} label={value} active={false} onClick={() => copyVariable(value)} />
        ))}
      </div>
      {titleFormat && entities[0] ? (
        <p className="bg-ui-field px-3 py-2 text-base text-primary">
          {replaceTemplateVariables(titleFormat, entities[0], keyword || "keyword")}
        </p>
      ) : null}

      <Field
        placeholder="Keyword (optional, leave empty to use a default in bulk rows)"
        aria-label="Keyword"
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
      />
      <p className="bg-ui-field px-3 py-2 text-base text-muted-foreground">
        Featured image: bulk posts use the Google Maps snapshot image for each service area. AI-generated featured images
        are not used in the SAP generator.
      </p>
      <Field
        placeholder="Modifier (optional), e.g. Focus on high-income neighborhoods"
        aria-label="Modifier"
        value={modifier}
        onChange={(e) => onModifierChange(e.target.value)}
      />

      {showPreviewTable && totalEntities > 0 ? (
        <>
          <p className="pt-1.5 text-base font-semibold">
            Preview: first {previewCount} of {totalEntities} entities
          </p>
          <div className="flex max-h-64 flex-col gap-px overflow-y-auto bg-ui-field-hover">
            <div className={`${PREVIEW_ROW} font-semibold`}>
              <span>Entity</span>
              <span>Title</span>
              <span>Featured</span>
            </div>
            {entities.slice(0, 10).map((entity, index) => (
              <div key={index} className={PREVIEW_ROW}>
                <span className="break-words">{entity}</span>
                <span className="break-words">
                  {titleFormat ? replaceTemplateVariables(titleFormat, entity, keyword || "") : entity}
                </span>
                <span className="text-muted-foreground">Google</span>
              </div>
            ))}
            {entities.length > 10 ? (
              <p className="bg-ui-field px-3 py-2 text-base text-muted-foreground">
                and {entities.length - 10} more entities
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
};

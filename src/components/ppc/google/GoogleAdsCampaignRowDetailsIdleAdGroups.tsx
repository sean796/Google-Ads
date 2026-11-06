import type { ReactNode } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { GoogleAdsRowEndRail } from "@/components/ppc/google/GoogleAdsRowEndRail";
import {
  PPC_DETAILS_ACCORDION_STACK,
  PPC_DETAILS_TRIGGER,
  PPC_ROW_CONTENT_SPAN_CLASS,
} from "@/components/ppc/google/google-ads-row-constants";
import type { PpcCampaignRow } from "@/lib/ppc/google-ads-types";
import { Field } from "@/ui";

export function GoogleAdsCampaignRowDetailsIdleAdGroups({
  row,
  adGroupKeywords,
  keywordReadOnly,
  onAdGroupKeywordChange,
  renderAdGroupGenerateButton,
  handleDeleteAdGroup,
  adGroupDeleteDisabled,
}: {
  row: PpcCampaignRow;
  adGroupKeywords: string[];
  keywordReadOnly: boolean;
  onAdGroupKeywordChange?: (index: number, keyword: string) => void;
  renderAdGroupGenerateButton: (agIndex: number) => ReactNode;
  handleDeleteAdGroup: (agIndex: number) => void;
  adGroupDeleteDisabled: boolean;
}) {
  return (
    <div className={PPC_DETAILS_ACCORDION_STACK} role="region" aria-label="Ad groups">
      {adGroupKeywords.map((keyword, agIndex) => (
        <div key={`${row.id}-idle-ag-${agIndex}`} className={PPC_DETAILS_TRIGGER}>
          <div className={PPC_ROW_CONTENT_SPAN_CLASS}>
            <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4">
              <LayoutGrid aria-hidden />
            </span>
            <span className="shrink-0 text-base font-medium text-white">{`Ad group ${agIndex + 1}:`}</span>
            <Field
              value={keyword}
              readOnly={keywordReadOnly}
              placeholder="Ad group title"
              aria-label={`Ad group ${agIndex + 1} title`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onAdGroupKeywordChange?.(agIndex, e.target.value)}
            />
          </div>
          <GoogleAdsRowEndRail
            generate={renderAdGroupGenerateButton(agIndex)}
            onDelete={() => handleDeleteAdGroup(agIndex)}
            deleteDisabled={adGroupDeleteDisabled}
            deleteLabel={`Delete ad group ${agIndex + 1}`}
            chevron={
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
                <ChevronDown className="h-4 w-4" aria-hidden />
              </span>
            }
          />
        </div>
      ))}
    </div>
  );
}

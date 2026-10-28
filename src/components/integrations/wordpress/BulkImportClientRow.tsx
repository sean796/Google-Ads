import React from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getCyberpunkCardClasses, getCyberpunkTextClasses } from "./cyberpunk-theme";
import {
  truncateWordpressSiteUrlLabel,
  wordpressSiteDomainLabel,
} from "./wordpress-site-domain-label";

export interface BulkImportClient {
  name: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  googleAdsCustomerId?: string;
  primaryLocalKeyword?: string;
}

interface BulkImportClientRowProps {
  client: BulkImportClient;
  approved: boolean;
  onToggleApproved: (approved: boolean) => void;
}

export const BulkImportClientRow: React.FC<BulkImportClientRowProps> = ({
  client,
  approved,
  onToggleApproved,
}) => {
  const siteUrlLabel = truncateWordpressSiteUrlLabel(
    wordpressSiteDomainLabel(client.siteUrl)
  );

  return (
    <Card
      className={`p-2 ${getCyberpunkCardClasses(false, true)} transition-all duration-200 hover:border-green-500/50 flex items-center gap-3 ${
        !approved ? "opacity-60" : ""
      }`}
    >
      <Checkbox
        checked={approved}
        onCheckedChange={(checked) => onToggleApproved(checked === true)}
        className="border-green-500/50 data-[state=checked]:bg-green-500/20 data-[state=checked]:border-green-500"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-bold ${getCyberpunkTextClasses("primary")} truncate`}>
            {client.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs ${getCyberpunkTextClasses("muted")} truncate`} title={client.siteUrl}>
            {siteUrlLabel}
          </span>
          <span className={`text-xs ${getCyberpunkTextClasses("secondary")}`}>•</span>
          <span className={`text-xs ${getCyberpunkTextClasses("muted")}`}>{client.username}</span>
        </div>
      </div>
    </Card>
  );
};

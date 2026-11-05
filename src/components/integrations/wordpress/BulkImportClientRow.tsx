import React from "react";
import { CheckField } from "@/ui";
import { wordpressSiteDomainLabel } from "./wordpress-site-domain-label";

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
}) => (
  <div className={`flex items-center gap-3 bg-ui-field px-2 py-1.5 ${approved ? "" : "opacity-60"}`}>
    <CheckField checked={approved} aria-label={`Approve ${client.name}`} onCheckedChange={onToggleApproved} />
    <span className="text-base font-semibold text-primary">{client.name}</span>
    <span className="text-base text-muted-foreground" title={client.siteUrl}>
      {wordpressSiteDomainLabel(client.siteUrl)}
    </span>
    <span className="text-base text-muted-foreground">{client.username}</span>
  </div>
);

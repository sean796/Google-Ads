import { BULK_HEADER_SELECT } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { PpcGoogleAdsCampaignStatusFilter } from "@/lib/ppc/ppc-google-ads-status-filter";
import { cn } from "@/lib/utils";
import { SelectField } from "@/ui";

export type GoogleAdsCampaignStatusFilterSelectProps = {
  value: PpcGoogleAdsCampaignStatusFilter;
  onChange: (value: PpcGoogleAdsCampaignStatusFilter) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function GoogleAdsCampaignStatusFilterSelect({
  value,
  onChange,
  disabled = false,
  id = "ppc-campaign-status-filter",
  className,
}: GoogleAdsCampaignStatusFilterSelectProps) {
  return (
    <SelectField placeholder="Campaign status" value={value} disabled={disabled} onValueChange={(v) => onChange(v as PpcGoogleAdsCampaignStatusFilter)} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "disabled", label: "Disabled" }, { value: "all", label: "All" }]} />
  );
}

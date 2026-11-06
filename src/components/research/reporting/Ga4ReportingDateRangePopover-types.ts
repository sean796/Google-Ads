import type { Ga4CompareBaselineId, Ga4PrimaryPresetId } from "@/lib/reporting/ga4-analytics-date-ranges";
import type { ReportingCompareRanges } from "@/lib/reporting/reporting-date-presets";

export type Ga4ReportingDateHarness = {
  primaryPreset: Ga4PrimaryPresetId;
  compareBaseline: Ga4CompareBaselineId;
  compareEnabled: boolean;
  compareRangeDraft: ReportingCompareRanges;
};

export type Ga4ReportingDateRangePopoverProps = {
  busy?: boolean;
  value: Ga4ReportingDateHarness;
  onApply: (next: Ga4ReportingDateHarness) => void;
  todayYmdMax: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

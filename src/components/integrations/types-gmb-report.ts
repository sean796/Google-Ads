export interface GMBReportData {
  locationCount: number;
  currentPeriod: {
    startDate: string;
    endDate: string;
    calls: number;
    directions: number;
    websiteClicks: number;
  };
  comparisonPeriod: {
    startDate: string;
    endDate: string;
    calls: number;
    directions: number;
    websiteClicks: number;
  };
}

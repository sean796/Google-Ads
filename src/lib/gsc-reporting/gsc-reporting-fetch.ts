/**
 * Fetch GSC reporting seed data from backend and return raw CSV text (no KB enrichment).
 * Uses POST /api/gsc/fetch-reporting-bundle: queries, page performance, sitemap list, indexed URL list.
 */
export {
  gscIsFullCalendarMonthRange,
  gscCompactPeriodLabelFromIsoRange,
  gscQueriesToCsv,
  gscQueriesMomComparisonCsv,
  gscPagesToCsv,
  gscPagesMomComparisonCsv,
  gscSiteTotalsPreviousMonthToCsv,
  gscSitePeriodTotalsToCsv,
  gscSiteTotalsPctChangeVsPrior,
  gscSiteTotalsMomComparisonCsv,
  gscIndexedPageUrlsFromCsv,
  gscIndexedUrlsCsvFromPages,
  gscSitemapsToCsv,
} from "./gsc-reporting-csv-serializers";
export type {
  GscSiteTotalsPreviousMonth,
  GscPagePerfRow,
  GscSitemapApiRow,
  GscQueryPerfRow,
} from "./gsc-reporting-csv-serializers";
export {
  GA_ORGANIC_TRAFFIC_ACQUISITION_MOM_FILENAME,
  GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME,
  bundleHasGaOrganicReportingFilename,
  isValidGaOrganicReportingFileContent,
  bundleHasValidGaOrganicTrafficData,
  seedHasGaTrafficAcquisitionFile,
  isGaTrafficReportingFile,
  removeGaOrganicReportingFiles,
  appendGaOrganicReportingFileToBundle,
  ensureGaOrganicTrafficInReportingBundle,
  gaOrganicSessionsFromTraffic,
  gaTrafficAcquisitionMomCsv,
  fetchGaOrganicTrafficAcquisitionMomFile,
  fetchGaOrganicTrafficAcquisitionByMonthFile,
} from "./gsc-reporting-ga-bundle";
export { fetchGscQueriesRawForReporting } from "./gsc-reporting-bundle-fetcher";
export type {
  GscReportingFetchResult,
  GscReportingFetchOptions,
} from "./gsc-reporting-bundle-fetcher";
export type { GscReportStructure } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";

import type { WordPressSite } from "./types";

export interface GSCFeatureRef {
  openDialog: (site: WordPressSite) => void;
  isFetchingGSC: string | null;
}


/** Row from GET /api/gsc/test-connection `sites` array */
export type GscTestSiteRow = {
  siteUrl: string;
  permissionLevel?: string;
  originalFormat?: string;
};

export interface GSCFeatureProps {
  onRef?: (ref: GSCFeatureRef) => void;
  /** When false, only dialogs + ref (card lives on Settings). Default true. */
  showConnectionCard?: boolean;
}

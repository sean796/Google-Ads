import { useCallback, useRef } from "react";
import { LocalGridMapCanvas } from "@/components/organic-dashboard/local-grid/LocalGridMapCanvas";
import "@/components/organic-dashboard/local-grid/local-grid-studio.css";
import type {
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridEvaluatedPin,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";

export type OrganicClientReportLocalGridMapSnapshotProps = {
  siteId: string;
  scanId: string;
  evaluatedPins: LocalGridEvaluatedPin[];
  previewNodes: LocalGridCoordinateNode[];
  reportGridMeta: {
    centerLat: number;
    centerLng: number;
    scanSize: LocalGridScanSize;
    shape: LocalGridShape;
    distance: number;
    distanceMeasure: LocalGridDistanceMeasure;
  };
};

export function OrganicClientReportLocalGridMapSnapshot({
  evaluatedPins,
  previewNodes,
  reportGridMeta,
}: OrganicClientReportLocalGridMapSnapshotProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const noopSelect = useCallback(() => {}, []);

  return (
    <div
      ref={shellRef}
      className="organic-client-report-export__local-grid-map organic-client-report-export__local-grid-map-live local-grid-leaflet-shell"
      aria-label="Local map rank grid snapshot"
    >
      <LocalGridMapCanvas
        evaluatedPins={evaluatedPins}
        previewNodes={previewNodes}
        scanning={false}
        selectedPointId={null}
        recenterSignal={0}
        onSelectPin={noopSelect}
        readOnly
        viewportProfile="report"
        reportGridMeta={reportGridMeta}
      />
    </div>
  );
}

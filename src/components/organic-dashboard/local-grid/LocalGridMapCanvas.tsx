import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import {
  computeGridBounds,
  computeLocalGridReportViewportBounds,
} from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridEvaluatedPin,
  LocalGridPinBucket,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import "./local-grid-studio.css";

const X_POLYGON_POINTS =
  "13,4 22,13 31,4 40,13 31,22 40,31 31,40 22,31 13,40 4,31 13,22 4,13";

function buildPinSvgHtml(
  rank: number | null,
  bucket: LocalGridPinBucket,
  selected: boolean,
  isPreviewNode = false,
  isBreathing = false,
): string {
  const selectedAttr = selected ? 'data-selected="true"' : "";
  const breathingAttr = isBreathing ? 'data-breathing="true"' : "";

  if (isPreviewNode) {
    return `<div class="local-grid-pin-wrapper" title="Drag X to move grid center" ${selectedAttr} ${breathingAttr}>
      <svg width="42" height="42" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
        <polygon
          points="${X_POLYGON_POINTS}"
          fill="${isBreathing ? "#d1d5db" : "#dce1e7"}"
          stroke="${selected ? "#84bc00" : isBreathing ? "#92cf00" : "#52525b"}"
          stroke-width="${selected ? "2.4" : "1.35"}"
          stroke-linejoin="round"
        />
      </svg>
    </div>`;
  }

  if (bucket === "rank1" || rank === 1) {
    return `<div class="local-grid-pin-wrapper" title="Drag to move grid center or click to inspect" ${selectedAttr}>
      <svg width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg">
        <polygon
          points="23,2.5 28.8,15.2 42.6,16.8 32.3,26.2 35.1,39.8 23,32.9 10.9,39.8 13.7,26.2 3.4,16.8 17.2,15.2"
          fill="#84bc00"
          stroke="${selected ? "#ffffff" : "#659100"}"
          stroke-width="${selected ? "2.4" : "1.4"}"
          stroke-linejoin="round"
        />
        <text x="23" y="27.5" text-anchor="middle" fill="#111827" class="local-grid-pin-label">1</text>
      </svg>
    </div>`;
  }

  if (bucket === "out" || rank == null) {
    return `<div class="local-grid-pin-wrapper" title="Drag X to move grid center or click to inspect" ${selectedAttr}>
      <svg width="42" height="42" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
        <polygon
          points="${X_POLYGON_POINTS}"
          fill="#d4d8dd"
          stroke="${selected ? "#84bc00" : "#4b5563"}"
          stroke-width="${selected ? "2.4" : "1.35"}"
          stroke-linejoin="round"
        />
        <line x1="16" y1="16" x2="28" y2="28" stroke="#6b7280" stroke-width="1.2" />
        <line x1="28" y1="16" x2="16" y2="28" stroke="#6b7280" stroke-width="1.2" />
        <text
          x="22"
          y="26.5"
          text-anchor="middle"
          fill="#111827"
          stroke="#f3f4f6"
          stroke-width="3.2"
          paint-order="stroke fill"
          class="local-grid-pin-label"
        >20+</text>
      </svg>
    </div>`;
  }

  // Modern Pulse color ramp:
  // 2-3: pale chartreuse Pulse green (dark text)
  // 4-6: bright golden yellow (dark text)
  // 7-10: vibrant warm orange (dark text)
  // 11-15: bright coral red (dark text)
  // 16-20: deep crimson red (white text)
  let fill = "#84bc00";
  let stroke = "#659100";
  let textFill = "#111827";

  if (rank >= 4 && rank <= 6) {
    fill = "#ffca1a";
    stroke = "#b88700";
    textFill = "#111827";
  } else if (rank >= 7 && rank <= 10) {
    fill = "#f28c18";
    stroke = "#a85904";
    textFill = "#111827";
  } else if (rank >= 11 && rank <= 15) {
    fill = "#f04848";
    stroke = "#a61c1c";
    textFill = "#111827";
  } else if (rank >= 16) {
    fill = "#d42020";
    stroke = "#821010";
    textFill = "#ffffff";
  }

  return `<div class="local-grid-pin-wrapper" title="Drag to move grid center or click to inspect" ${selectedAttr}>
    <svg width="40" height="45" viewBox="0 0 42 46" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21 2C11.3 2 3.5 9.8 3.5 19.5c0 11.4 17.5 24 17.5 24s17.5-12.6 17.5-24C38.5 9.8 30.7 2 21 2z"
        fill="${fill}"
        stroke="${selected ? "#111827" : stroke}"
        stroke-width="${selected ? "2.4" : "1.4"}"
        stroke-linejoin="round"
      />
      <text x="21" y="24" text-anchor="middle" fill="${textFill}" class="local-grid-pin-label">${rank}</text>
    </svg>
  </div>`;
}

function MapViewportSync({
  bounds,
  recenterSignal,
  viewportProfile,
}: {
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  recenterSignal: number;
  viewportProfile: "studio" | "report";
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    map.invalidateSize();
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const latLngBounds = L.latLngBounds(
      [minLat, minLng],
      [maxLat, maxLng],
    );
    const isReport = viewportProfile === "report";
    map.fitBounds(latLngBounds, {
      padding: isReport ? [18, 18] : [40, 40],
      animate: false,
      maxZoom: isReport ? 17 : 16,
    });
  }, [
    map,
    bounds.minLat,
    bounds.maxLat,
    bounds.minLng,
    bounds.maxLng,
    recenterSignal,
    viewportProfile,
  ]);

  return null;
}

export type LocalGridMapCanvasProps = {
  evaluatedPins: LocalGridEvaluatedPin[];
  previewNodes: LocalGridCoordinateNode[];
  scanning?: boolean;
  selectedPointId: string | null;
  recenterSignal?: number;
  onSelectPin: (pointId: string) => void;
  onDragPin?: (pointId: string, newLat: number, newLng: number) => void;
  /** Report/export: map is view-only (no scroll zoom). */
  readOnly?: boolean;
  /** Report/export only: disables pan/zoom; tighter bounds from scan grid definition. */
  viewportProfile?: "studio" | "report";
  reportGridMeta?: {
    centerLat: number;
    centerLng: number;
    scanSize: LocalGridScanSize;
    shape: LocalGridShape;
    distance: number;
    distanceMeasure: LocalGridDistanceMeasure;
  };
};

type RenderPinItem = LocalGridEvaluatedPin & {
  isPreview?: boolean;
  isBreathing?: boolean;
};

export function LocalGridMapCanvas({
  evaluatedPins,
  previewNodes,
  scanning = false,
  selectedPointId,
  recenterSignal = 0,
  onSelectPin,
  onDragPin,
  readOnly = false,
  viewportProfile = "studio",
  reportGridMeta,
}: LocalGridMapCanvasProps) {
  const displayPoints = useMemo<RenderPinItem[]>(() => {
    const evalById = new Map<string, LocalGridEvaluatedPin>();
    for (const ep of evaluatedPins) {
      evalById.set(ep.pointId, ep);
    }

    const isImportedCustomGrid =
      !scanning &&
      evaluatedPins.length > 0 &&
      !previewNodes.some((n) => evalById.has(n.pointId));

    if (isImportedCustomGrid) {
      return evaluatedPins.map((ep) => ({
        ...ep,
        isPreview: false,
        isBreathing: false,
      }));
    }

    return previewNodes.map((n) => {
      const done = evalById.get(n.pointId);
      if (done) {
        return {
          ...done,
          isPreview: false,
          isBreathing: false,
        };
      }
      return {
        ...n,
        items: [],
        targetRank: null,
        bucket: "out" as const,
        matchedItem: null,
        isPreview: true,
        isBreathing: scanning,
      };
    });
  }, [evaluatedPins, previewNodes, scanning]);

  const bounds = useMemo(() => {
    if (viewportProfile === "report" && reportGridMeta) {
      return computeLocalGridReportViewportBounds(reportGridMeta);
    }
    return computeGridBounds(displayPoints);
  }, [displayPoints, reportGridMeta, viewportProfile]);

  const iconsByKey = useMemo(() => {
    const out = new Map<string, L.DivIcon>();
    for (const pt of displayPoints) {
      const isPreview = Boolean(pt.isPreview);
      const isBreathing = Boolean(pt.isBreathing);
      const selected = pt.pointId === selectedPointId;
      out.set(
        pt.pointId,
        L.divIcon({
          className: "local-grid-pin-icon",
          html: buildPinSvgHtml(pt.targetRank, pt.bucket, selected, isPreview, isBreathing),
          iconSize: [46, 46],
          iconAnchor: [23, 23],
        }),
      );
    }
    return out;
  }, [displayPoints, selectedPointId]);

  return (
    <MapContainer
      center={[bounds.centerLat, bounds.centerLng]}
      zoom={bounds.recommendedZoom}
      scrollWheelZoom={!readOnly}
      dragging={!readOnly}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution="Map data &copy; Google"
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        maxZoom={20}
        crossOrigin={true}
      />
      <MapViewportSync
        bounds={bounds}
        recenterSignal={recenterSignal}
        viewportProfile={viewportProfile}
      />
      {displayPoints.map((pin) => {
        const icon = iconsByKey.get(pin.pointId);
        if (!icon) return null;
        return (
          <Marker
            key={pin.pointId}
            position={[pin.latitude, pin.longitude]}
            icon={icon}
            draggable={Boolean(onDragPin) && pin.row === 0 && pin.col === 0}
            eventHandlers={{
              click: () => onSelectPin(pin.pointId),
              dragend: (e) => {
                if (!onDragPin || pin.row !== 0 || pin.col !== 0) return;
                const marker = e.target as L.Marker;
                const pos = marker.getLatLng();
                onDragPin(pin.pointId, pos.lat, pos.lng);
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}

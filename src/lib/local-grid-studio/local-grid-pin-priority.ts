import type { LocalGridEvaluatedPin } from "./local-grid-types";

/** Highest rank position a grid pin can carry; weaker rank means higher priority. */
export const LOCAL_GRID_MAX_RANK = 20;

export type LocalGridPinPriority = {
  pin: LocalGridEvaluatedPin;
  /** Ranked pins fall in (0, 1]. Unranked pins fall in [1, 2] and always outrank ranked pins. */
  priority: number;
};

/**
 * Priority per scanned pin: weaker rank first; pins with no rank at all come first overall,
 * closest to the grid center (the business) ahead of far ones. Pins with no scan data are dropped.
 */
export function rankGridPinsByPriority(pins: readonly LocalGridEvaluatedPin[]): LocalGridPinPriority[] {
  const scanned = pins.filter((p) => !p.error && p.items.length > 0);
  if (scanned.length === 0) {
    throw new Error("Grid scan has no pins with results to weight.");
  }
  const maxDistance = Math.max(...scanned.map((p) => p.distanceFromCenter));
  return scanned
    .map((pin) => {
      if (pin.targetRank === null) {
        const proximity = maxDistance > 0 ? 1 - pin.distanceFromCenter / maxDistance : 1;
        return { pin, priority: 1 + proximity };
      }
      return { pin, priority: Math.min(pin.targetRank, LOCAL_GRID_MAX_RANK) / LOCAL_GRID_MAX_RANK };
    })
    .sort((a, b) => b.priority - a.priority || a.pin.pointId.localeCompare(b.pin.pointId));
}

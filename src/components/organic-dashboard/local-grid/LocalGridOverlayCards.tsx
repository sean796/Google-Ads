import { Star, X } from "lucide-react";
import type {
  LocalGridAggregatedView,
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
  LocalGridEvaluatedPin,
} from "@/lib/local-grid-studio/local-grid-types";
import { cn } from "@/lib/utils";

export type LocalGridOverlayCardsProps = {
  activeBusiness: LocalGridBusinessIdentity;
  distanceMeasure: LocalGridDistanceMeasure;
  view: LocalGridAggregatedView | null;
  selectedPin: LocalGridEvaluatedPin | null;
  onCloseSelectedPin: () => void;
  onSelectBusiness: (business: LocalGridBusinessIdentity) => void;
};

export function LocalGridOverlayCards({
  activeBusiness,
  distanceMeasure,
  view,
  selectedPin,
  onCloseSelectedPin,
  onSelectBusiness,
}: LocalGridOverlayCardsProps) {
  const displayBiz = view?.activeBusiness ?? activeBusiness;

  if (!selectedPin) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-20 flex max-h-[460px] w-96 flex-col rounded-none border border-zinc-800 bg-zinc-950/95 text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-base font-bold text-zinc-100">
            Pin SERP ({selectedPin.items.length} results)
          </div>
          <div className="text-base tabular-nums text-zinc-400">
            {selectedPin.latitude.toFixed(5)}, {selectedPin.longitude.toFixed(5)} (
            {selectedPin.distanceFromCenter} {distanceMeasure})
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseSelectedPin}
          className="rounded-none p-1 text-zinc-400 hover:text-white"
          aria-label="Close pin inspector"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
        {selectedPin.items.length === 0 ? (
          <div className="p-4 text-base text-zinc-400">
            Click <strong>Run Now</strong> to fetch live Google Maps rankings for this coordinate, or
            drag the <strong>X</strong> pin on the map to reposition.
          </div>
        ) : (
          selectedPin.items.map((item) => {
            const isTarget =
              item.business.toLowerCase() === displayBiz.business.toLowerCase();
            return (
              <button
                key={`${item.rank}-${item.placeId}-${item.business}`}
                type="button"
                onClick={() =>
                  onSelectBusiness({
                    key: item.placeId || item.business,
                    business: item.business,
                    address: item.address,
                    placeId: item.placeId,
                    cid: item.cid,
                    googlePlaceId: item.googlePlaceId,
                    websiteUrl: item.websiteUrl,
                    primaryCategory: item.primaryCategory,
                    secondaryCategories: item.secondaryCategories,
                    rating: item.rating,
                    reviews: item.reviews,
                    latitude: item.itemLat ?? null,
                    longitude: item.itemLng ?? null,
                  })
                }
                className={cn(
                  "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left rounded-none transition-colors hover:bg-zinc-850",
                  isTarget && "border-l-2 border-primary bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-base font-bold tabular-nums",
                    item.rank <= 3
                      ? "bg-primary text-black"
                      : item.rank <= 10
                        ? "bg-amber-400 text-black"
                        : "bg-red-500 text-white",
                  )}
                >
                  {item.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium text-zinc-100">
                    {item.business}
                  </div>
                  <div className="truncate text-base text-zinc-400">{item.address}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-base tabular-nums text-zinc-400">
                    {item.rating != null ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                        {item.rating} ({item.reviews ?? 0})
                      </span>
                    ) : null}
                    {item.primaryCategory ? (
                      <span className="truncate text-zinc-500">{item.primaryCategory}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

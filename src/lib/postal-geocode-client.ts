import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type PostalCentroidHint = {
  postalCode?: string;
  city?: string;
  region?: string;
  countryCode?: string;
};

export type PostalCentroidResult = {
  lat: number;
  lng: number;
  placeName: string;
  source: "postal" | "place";
};

export async function fetchPostalCentroid(
  hints: PostalCentroidHint,
): Promise<PostalCentroidResult | null> {
  try {
    const res = await fetch(`${BACKEND_API_BASE}/api/seo/postal-centroid`, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        postalCode: hints.postalCode?.trim() || "",
        city: hints.city?.trim() || "",
        region: hints.region?.trim() || "",
        countryCode: hints.countryCode?.trim() || "",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lat?: number | null;
      lng?: number | null;
      placeName?: string | null;
      source?: "postal" | "place" | null;
    };
    const lat = typeof data.lat === "number" ? data.lat : Number(data.lat);
    const lng = typeof data.lng === "number" ? data.lng : Number(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      placeName: typeof data.placeName === "string" ? data.placeName : "",
      source: data.source === "place" ? "place" : "postal",
    };
  } catch {
    return null;
  }
}

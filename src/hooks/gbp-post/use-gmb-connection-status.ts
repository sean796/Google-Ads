import { useEffect, useState } from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export function useGmbConnectionStatus(): { connected: boolean; loading: boolean } {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cacheBust = `_=${Date.now()}`;
    fetch(`${BACKEND_API_BASE}/api/gmb/status?${cacheBust}`, { credentials: "include", cache: "no-store", headers: neoPulseApiHeaders() })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!cancelled) setConnected(Boolean(data?.connected));
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { connected, loading };
}

import React from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/** Placeholder until `/api/gsc/service-account-email` loads (server derives real email from credential JSON). */
const GSC_EMAIL_FALLBACK = "neopulse@neopulse-505422.iam.gserviceaccount.com";

export type GscServiceAccountIdentity = {
  /** Service account email — must be added in Search Console for each property (matches server JWT). */
  email: string;
};

const GSC_IDENTITY_FALLBACK: GscServiceAccountIdentity = {
  email: GSC_EMAIL_FALLBACK,
};

export function useGscServiceAccountIdentity(): GscServiceAccountIdentity {
  const [identity, setIdentity] = React.useState<GscServiceAccountIdentity>(GSC_IDENTITY_FALLBACK);
  React.useEffect(() => {
    fetch(`${BACKEND_API_BASE}/api/gsc/service-account-email`, {
      credentials: "include",
      headers: neoPulseApiHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { email?: string } | null) => {
        if (!data?.email?.trim()) return;
        setIdentity({ email: data.email.trim() });
      })
      .catch(() => {});
  }, []);
  return identity;
}

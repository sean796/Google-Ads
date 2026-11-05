import { useCallback, useEffect, useState } from "react";
import { fetchResidentialProxyStatus } from "@/lib/browser-automation-api";
import { DASHBOARD_SETTINGS_GROUP_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { Button } from "@/ui";

export function ResidentialProxySettingsContent() {
  const [status, setStatus] = useState<{
    configured?: boolean;
    host?: string;
    port?: string;
    username?: string;
    ip?: string;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  const loadStatus = useCallback(async (probe = false) => {
    if (probe) setProbing(true);
    else setLoading(true);
    try {
      const next = await fetchResidentialProxyStatus(probe);
      setStatus(next);
    } catch (error) {
      setStatus({
        configured: false,
        error: error instanceof Error ? error.message : "Could not load proxy status.",
      });
    } finally {
      setLoading(false);
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  const configured = Boolean(status?.configured);

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <p className="font-semibold text-white">Oxylabs residential proxy</p>
      <p className="text-base text-white">
        Credentials live in <code className="text-white">.env.residential-proxy</code> on the browser worker.
      </p>
      <div className="mt-3 space-y-2 text-base text-white">
        {loading ? <p>Checking proxy configuration…</p> : null}
        {!loading && status ? (
          <>
            <p>{configured ? "Configured" : "Not configured"}</p>
            {status.host ? <p>Host: {status.host}:{status.port ?? "7777"}</p> : null}
            {status.username ? <p>Username: {status.username}</p> : null}
            {status.ip ? <p>Probe IP: {status.ip}</p> : null}
            {status.error ? <p>{status.error}</p> : null}
          </>
        ) : null}
      </div>
      <div className="mt-3">
        <Button
          type="button"
          disabled={loading || probing}
          onClick={() => void loadStatus(true)}
        >
          {probing ? "Testing…" : "Test connection"}
        </Button>
      </div>
    </div>
  );
}

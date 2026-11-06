import { useCallback, useEffect, useState } from "react";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type GoogleAdsConnectionStatus = {
  connected: boolean;
  loading: boolean;
  configured: boolean;
  hasDeveloperToken: boolean;
  hasMccId: boolean;
  mccId?: string;
  redirectUri?: string;
  authUrl?: string;
  connectionError?: string;
  refresh: () => void;
};

const GOOGLE_ADS_STATUS_EVENT = "google-ads-status-changed";
const GOOGLE_ADS_OAUTH_MESSAGE = "google-ads-oauth-complete";
const GOOGLE_ADS_OAUTH_ERROR_MESSAGE = "google-ads-oauth-error";

type GoogleAdsStatusSnapshot = {
  connected: boolean;
  configured: boolean;
  hasDeveloperToken: boolean;
  hasMccId: boolean;
  mccId?: string;
  redirectUri?: string;
  authUrl?: string;
  connectionError?: string;
};

function publishGoogleAdsStatus(snapshot: GoogleAdsStatusSnapshot): void {
  window.dispatchEvent(new CustomEvent(GOOGLE_ADS_STATUS_EVENT, { detail: snapshot }));
}

function clearAdsOAuthQueryParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("ads") !== "connected" && params.get("ads") !== "error") return;
  params.delete("ads");
  params.delete("message");
  const hash = window.location.hash || "";
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${hash}`;
  window.history.replaceState({}, "", next);
}

function notifyOpenerAndClose(payload: { type: string; message?: string }): void {
  if (!window.opener || window.opener === window || window.opener.closed) return;
  window.opener.postMessage(payload, window.location.origin);
  window.close();
}

async function fetchGoogleAdsStatus(): Promise<GoogleAdsStatusSnapshot> {
  const cacheBust = `_=${Date.now()}`;
  const [statusRes, configRes] = await Promise.all([
    fetch(`${backendApiUrl("/google-ads/status")}?${cacheBust}`, {
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders(),
    }),
    fetch(`${backendApiUrl("/google-ads/config-status")}?${cacheBust}`, {
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders(),
    }),
  ]);
  const statusData = await statusRes.json().catch(() => ({}));
  const configData = await configRes.json().catch(() => ({}));
  const statusError = typeof statusData?.error === "string" ? statusData.error.trim() : "";
  const uri = typeof configData?.redirectUri === "string" ? configData.redirectUri.trim() : "";
  const authUrl = typeof configData?.authUrl === "string" ? configData.authUrl.trim() : "";
  const mccId = typeof configData?.mccId === "string" ? configData.mccId.trim() : "";
  return {
    connected: Boolean(statusData?.connected),
    configured: Boolean(configData?.configured),
    hasDeveloperToken: Boolean(configData?.hasDeveloperToken),
    hasMccId: Boolean(configData?.hasMccId) || mccId.length === 10,
    mccId: mccId || undefined,
    redirectUri: uri || undefined,
    authUrl: authUrl || undefined,
    connectionError: statusError || undefined,
  };
}

export function useGoogleAdsConnectionStatus(): GoogleAdsConnectionStatus {
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [hasDeveloperToken, setHasDeveloperToken] = useState(false);
  const [hasMccId, setHasMccId] = useState(false);
  const [mccId, setMccId] = useState<string | undefined>();
  const [redirectUri, setRedirectUri] = useState<string | undefined>();
  const [authUrl, setAuthUrl] = useState<string | undefined>();
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const applySnapshot = useCallback((snapshot: GoogleAdsStatusSnapshot) => {
    setConnected(snapshot.connected);
    setConfigured(snapshot.configured);
    setHasDeveloperToken(snapshot.hasDeveloperToken);
    setHasMccId(snapshot.hasMccId);
    setMccId(snapshot.mccId);
    setRedirectUri(snapshot.redirectUri);
    setAuthUrl(snapshot.authUrl);
    setConnectionError(snapshot.connectionError);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchGoogleAdsStatus()
      .then((snapshot) => {
        applySnapshot(snapshot);
        publishGoogleAdsStatus(snapshot);
      })
      .catch(() => {
        const snapshot = {
          connected: false,
          configured: false,
          hasDeveloperToken: false,
          hasMccId: false,
          mccId: undefined,
          redirectUri: undefined,
          authUrl: undefined,
          connectionError: undefined,
        };
        applySnapshot(snapshot);
        publishGoogleAdsStatus(snapshot);
      })
      .finally(() => setLoading(false));
  }, [applySnapshot]);

  useEffect(() => {
    refresh();

    const params = new URLSearchParams(window.location.search);
    const adsState = params.get("ads");
    const adsMessage = params.get("message")?.trim() ?? "";

    if (adsState === "connected") {
      clearAdsOAuthQueryParam();
      refresh();
      notifyOpenerAndClose({ type: GOOGLE_ADS_OAUTH_MESSAGE });
    } else if (adsState === "error") {
      clearAdsOAuthQueryParam();
      setConnectionError(adsMessage || "Google Ads authorization failed.");
      refresh();
      notifyOpenerAndClose({
        type: GOOGLE_ADS_OAUTH_ERROR_MESSAGE,
        message: adsMessage || "Google Ads authorization failed.",
      });
    }

    const onExternalUpdate = (event: Event) => {
      const detail = (event as CustomEvent<GoogleAdsStatusSnapshot>).detail;
      if (!detail) return;
      applySnapshot(detail);
      setLoading(false);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (
        event.data?.type === GOOGLE_ADS_OAUTH_MESSAGE ||
        event.data?.type === GOOGLE_ADS_OAUTH_ERROR_MESSAGE
      ) {
        if (event.data?.type === GOOGLE_ADS_OAUTH_ERROR_MESSAGE && event.data?.message) {
          setConnectionError(String(event.data.message));
        }
        refresh();
      }
    };
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener(GOOGLE_ADS_STATUS_EVENT, onExternalUpdate);
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(GOOGLE_ADS_STATUS_EVENT, onExternalUpdate);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applySnapshot, refresh]);

  return {
    connected,
    loading,
    configured,
    hasDeveloperToken,
    hasMccId,
    mccId,
    redirectUri,
    authUrl,
    connectionError,
    refresh,
  };
}

export function openGoogleAdsAuthorize(authUrl?: string): void {
  const url = authUrl?.trim();
  if (!url) return;
  window.open(url, "google-ads-oauth", "width=520,height=720");
}

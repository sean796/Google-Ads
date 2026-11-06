import { useCallback, useEffect, useState } from "react";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type GoogleDriveConnectionStatus = {
  connected: boolean;
  loading: boolean;
  configured: boolean;
  email?: string;
  redirectUri?: string;
  connectionError?: string;
  refresh: () => void;
};

const GOOGLE_DRIVE_STATUS_EVENT = "google-drive-status-changed";
const GOOGLE_DRIVE_OAUTH_MESSAGE = "google-drive-oauth-complete";
const GOOGLE_DRIVE_OAUTH_ERROR_MESSAGE = "google-drive-oauth-error";

type GoogleDriveStatusSnapshot = {
  connected: boolean;
  configured: boolean;
  email?: string;
  redirectUri?: string;
  connectionError?: string;
};

function publishGoogleDriveStatus(snapshot: GoogleDriveStatusSnapshot): void {
  window.dispatchEvent(new CustomEvent(GOOGLE_DRIVE_STATUS_EVENT, { detail: snapshot }));
}

function clearDriveOAuthQueryParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("drive") !== "connected" && params.get("drive") !== "error") return;
  params.delete("drive");
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

async function fetchGoogleDriveStatus(): Promise<GoogleDriveStatusSnapshot> {
  const cacheBust = `_=${Date.now()}`;
  const [statusRes, configRes] = await Promise.all([
    fetch(`${backendApiUrl("/google-mcp/status")}?${cacheBust}`, {
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders(),
    }),
    fetch(`${backendApiUrl("/google-mcp/config-status")}?${cacheBust}`, {
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders(),
    }),
  ]);
  const statusData = await statusRes.json().catch(() => ({}));
  const configData = await configRes.json().catch(() => ({}));
  const statusEmail = typeof statusData?.email === "string" ? statusData.email.trim() : "";
  const statusError = typeof statusData?.error === "string" ? statusData.error.trim() : "";
  const uri = typeof configData?.redirectUri === "string" ? configData.redirectUri.trim() : "";
  return {
    connected: Boolean(statusData?.connected),
    configured: Boolean(configData?.configured),
    email: statusEmail || undefined,
    redirectUri: uri || undefined,
    connectionError: statusError || undefined,
  };
}

export function useGoogleDriveConnectionStatus(): GoogleDriveConnectionStatus {
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [email, setEmail] = useState<string | undefined>();
  const [redirectUri, setRedirectUri] = useState<string | undefined>();
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const applySnapshot = useCallback((snapshot: GoogleDriveStatusSnapshot) => {
    setConnected(snapshot.connected);
    setConfigured(snapshot.configured);
    setEmail(snapshot.email);
    setRedirectUri(snapshot.redirectUri);
    setConnectionError(snapshot.connectionError);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchGoogleDriveStatus()
      .then((snapshot) => {
        applySnapshot(snapshot);
        publishGoogleDriveStatus(snapshot);
      })
      .catch(() => {
        const snapshot = {
          connected: false,
          configured: false,
          email: undefined,
          redirectUri: undefined,
          connectionError: undefined,
        };
        applySnapshot(snapshot);
        publishGoogleDriveStatus(snapshot);
      })
      .finally(() => setLoading(false));
  }, [applySnapshot]);

  useEffect(() => {
    refresh();

    const params = new URLSearchParams(window.location.search);
    const driveState = params.get("drive");
    const driveMessage = params.get("message")?.trim() ?? "";

    if (driveState === "connected") {
      clearDriveOAuthQueryParam();
      refresh();
      notifyOpenerAndClose({ type: GOOGLE_DRIVE_OAUTH_MESSAGE });
    } else if (driveState === "error") {
      clearDriveOAuthQueryParam();
      setConnectionError(driveMessage || "Google Drive authorization failed.");
      refresh();
      notifyOpenerAndClose({
        type: GOOGLE_DRIVE_OAUTH_ERROR_MESSAGE,
        message: driveMessage || "Google Drive authorization failed.",
      });
    }

    const onExternalUpdate = (event: Event) => {
      const detail = (event as CustomEvent<GoogleDriveStatusSnapshot>).detail;
      if (!detail) return;
      applySnapshot(detail);
      setLoading(false);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (
        event.data?.type === GOOGLE_DRIVE_OAUTH_MESSAGE ||
        event.data?.type === GOOGLE_DRIVE_OAUTH_ERROR_MESSAGE
      ) {
        if (event.data?.type === GOOGLE_DRIVE_OAUTH_ERROR_MESSAGE && event.data?.message) {
          setConnectionError(String(event.data.message));
        }
        refresh();
      }
    };
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener(GOOGLE_DRIVE_STATUS_EVENT, onExternalUpdate);
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(GOOGLE_DRIVE_STATUS_EVENT, onExternalUpdate);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applySnapshot, refresh]);

  return { connected, loading, configured, email, redirectUri, connectionError, refresh };
}

export function openGoogleDriveAuthorize(): void {
  window.open(
    backendApiUrl("/google-mcp/authorize"),
    "google-drive-oauth",
    "width=520,height=720",
  );
}

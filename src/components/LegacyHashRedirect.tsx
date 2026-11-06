import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { legacyHashToPath } from "@/lib/manager-tab-routes";

/**
 * One-time URL compatibility: pre-Wave-4 links used hashes for workspaces
 * (`/#tasks`, `/#generator/opt/agent-run/42`, `/#m123`). Convert them to
 * routes once, with replace, so old bookmarks and stored links keep working.
 * Also redirects `/#register?invite=...` to `/register?invite=...`.
 */
export function LegacyHashRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) return;
    if (raw.startsWith("register")) {
      const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      navigate(`/register${query}`, { replace: true });
      return;
    }
    const path = legacyHashToPath(raw);
    if (path) {
      navigate(path, { replace: true });
    }
  }, [navigate, location.hash]);

  return null;
}

/** Mobile shell: only the register invite hash is converted; workspace hashes do not exist there. */
export function HashAuthRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw.startsWith("register")) return;
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    navigate(`/register${query}`, { replace: true });
  }, [navigate]);

  return null;
}

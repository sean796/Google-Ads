import { Shield } from "lucide-react";
import { DASHBOARD_SETTINGS_PANEL_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { authLabel } from "@/lib/api-docs";
import { cn } from "@/lib/utils";

export function ApiDocsCallout({ auth, method, path }: { auth?: string; method?: string; path?: string }) {
  const needsSession = auth === "session" || auth === "session-team" || auth === "team-rbac-communication";

  return (
    <div className={cn(DASHBOARD_SETTINGS_PANEL_CLASS, "mb-8")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-base font-normal text-white">
          <Shield className="h-5 w-5 text-primary" aria-hidden />
          Who can use this
        </div>
        <span
          className={cn(
            "px-3 py-1 text-base font-medium",
            needsSession ? "bg-primary text-black" : "bg-ui-field-hover text-white",
          )}
        >
          {authLabel(auth)}
        </span>
        {method && path ? (
          <span className="font-mono text-base text-white">
            {method} {path}
          </span>
        ) : null}
      </div>
    </div>
  );
}

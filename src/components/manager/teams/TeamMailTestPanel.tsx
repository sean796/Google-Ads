import { useCallback, useEffect, useState } from "react";
import { DASHBOARD_SETTINGS_GROUP_CLASS, DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { sendTeamMailTest } from "@/lib/teams-api";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { Button, Field } from "@/ui";

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export function TeamMailTestPanel() {
  const { user } = useAuth();
  const { activeTeam } = useTeam();
  const { isOwner } = useTeamPermission();
  const [email, setEmail] = useState(user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (user?.email) {
      setEmail((prev) => prev || user.email);
    }
  }, [user?.email]);

  const handleSend = useCallback(async () => {
    if (!activeTeam || !email.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const result = await sendTeamMailTest(activeTeam.id, email.trim());
      if (result.ok) {
        const via = result.transport ? ` via ${result.transport}` : "";
        setStatus({ ok: true, message: `Test email sent to ${email.trim()}${via}.` });
        return;
      }
      setStatus({ ok: false, message: result.error || "Mail test failed." });
    } finally {
      setSending(false);
    }
  }, [activeTeam, email]);

  if (!activeTeam || !isOwner) return null;

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <div className="space-y-2">
        <p className="font-semibold text-white">Mail test</p>
        <p className="text-base text-white">Owner only. Sends a test message through WordPress mail.</p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <Field
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Test email"
          placeholder="you@agency.com"
        />
        <Button
          variant="run"
          type="button"
          disabled={sending || !email.trim()}
          onClick={() => void handleSend()}
        >
          {sending ? "Sending…" : "Send test"}
        </Button>
      </div>
      {status ? (
        <p className={`text-base ${status.ok ? "text-white" : "text-ui-danger-hover"}`}>{status.message}</p>
      ) : null}
    </div>
  );
}

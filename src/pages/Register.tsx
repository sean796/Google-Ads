import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { registerWithInvite, validateInviteToken } from "@/lib/teams-api";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { Lock, Mail, User, UserPlus } from "lucide-react";
import {
  NEO_PULSE_BRAND_LOCKUP_SRC,
} from "@/lib/neo-pulse-branding-assets";
import { Button } from "@/ui";

async function bootstrapAccount(payload: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = (import.meta.env.VITE_MCP_API_BASE?.replace(/\/api\/mcp\/?$/, "") || BACKEND_API_BASE || "").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}/api/auth/bootstrap`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export default function Register() {
  const { user, loading, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteTeam, setInviteTeam] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_DISABLED) {
      navigate("/", { replace: true });
      return;
    }
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!inviteToken) return;
    void validateInviteToken(inviteToken).then((r) => {
      if (r.ok && r.email) {
        setEmail(r.email);
        setInviteTeam(r.team?.name ?? null);
      }
    });
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        displayName: displayName.trim() || email.trim(),
        inviteToken,
      };
      const result = inviteToken
        ? await registerWithInvite(payload)
        : await bootstrapAccount(payload);
      if (result.ok) {
        await checkAuth();
        navigate("/", { replace: true });
      } else {
        setError(result.error || "Registration failed");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="neo-pulse-panel-neon w-full max-w-sm space-y-8 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={NEO_PULSE_BRAND_LOCKUP_SRC}
            alt="NEO Pulse"
            className="h-10 w-auto"
          />
          <p className="text-muted-foreground">
            {inviteTeam ? `Join ${inviteTeam}` : "Create your account"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-dashboard">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <FloatingLabelInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-0 bg-black pl-10 focus-visible:ring-primary/55 focus-visible:ring-offset-0"
              labelClassName="pl-10"
              autoComplete="email"
              required
              readOnly={Boolean(inviteToken)}
            />
          </div>
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <FloatingLabelInput
              id="displayName"
              label="Display name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border-0 bg-black pl-10 focus-visible:ring-primary/55 focus-visible:ring-offset-0"
              labelClassName="pl-10"
              autoComplete="name"
            />
          </div>
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
            <FloatingLabelInput
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-0 bg-black pl-10 focus-visible:ring-primary/55 focus-visible:ring-offset-0"
              labelClassName="pl-10"
              autoComplete="new-password"
              required
            />
          </div>
          {error ? (
            <p className="text-base text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="run" type="submit" disabled={submitting}>
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-base text-muted-foreground">
          <a href="/terms-of-service" className="hover:underline">
            Terms of Service
          </a>
          {" · "}
          <a href="/privacy-policy" className="hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

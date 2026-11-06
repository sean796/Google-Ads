import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";


import { useAuth } from "@/contexts/AuthContext";
import { loadDeviceAuth } from "@/lib/auth-device";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { Lock, User, LogIn } from "lucide-react";
import {
  NEO_PULSE_BRAND_LOCKUP_SRC,
} from "@/lib/neo-pulse-branding-assets";
import { Button, Checkbox, FloatingLabelInput } from "@/ui";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = loadDeviceAuth();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
      setRememberDevice(true);
    }
  }, []);

  useEffect(() => {
    if (AUTH_DISABLED) {
      navigate("/", { replace: true });
      return;
    }
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password, rememberDevice);
      if (result.ok) {
        navigate("/", { replace: true });
      } else {
        setError(result.error || "Invalid credentials");
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
          <p className="text-muted-foreground">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-dashboard">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
              <User className="h-4 w-4 text-muted-foreground" />
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
              autoComplete="current-password"
              required
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-base text-muted-foreground">
            <Checkbox
              checked={rememberDevice}
              onCheckedChange={(checked) => setRememberDevice(checked === true)}
            />
            Remember me on this device
          </label>
          {error && (
            <p className="text-base text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button variant="run" type="submit" disabled={submitting}>
            <LogIn className="mr-2 h-4 w-4" />
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-base text-muted-foreground">
            <a href="/register" className="text-[hsl(var(--semantic-data-foreground))] hover:underline">
              Create account
            </a>
          </p>
          <p className="text-center text-base text-muted-foreground">
            <a href="/terms-of-service" className="hover:underline">
              Terms of Service
            </a>
            {" · "}
            <a href="/privacy-policy" className="hover:underline">
              Privacy Policy
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

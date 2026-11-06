import { beforeAll, describe, expect, it } from "vitest";
import { backendApiUrl, setPostCreatorWorkerApiBase } from "@/lib/wordpress-api/connection";
import { setSessionToken } from "@/lib/auth-device";
import { runFactualityJudge } from "@/lib/evals/factuality-evals";

// Live opt-in: runs the real decision-model judge against the local hub.
// Requires NEO_PULSE_SMOKE_EMAIL and NEO_PULSE_SMOKE_PASSWORD (hub login);
// without them it skips, so default suite runs stay green and offline.
const SMOKE_EMAIL = (process.env.NEO_PULSE_SMOKE_EMAIL ?? "").trim();
const SMOKE_PASSWORD = process.env.NEO_PULSE_SMOKE_PASSWORD ?? "";
const smokeConfigured = Boolean(SMOKE_EMAIL && SMOKE_PASSWORD);

describe.skipIf(!smokeConfigured)("factuality judge (live, opt-in)", () => {
  beforeAll(async () => {
    setPostCreatorWorkerApiBase(process.env.NEO_PULSE_SMOKE_API_BASE ?? "http://127.0.0.1:8080");
    const res = await fetch(backendApiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
    });
    const data = (await res.json().catch(() => ({}))) as { sessionToken?: string; error?: string };
    if (!res.ok || !data.sessionToken) {
      throw new Error(`Factuality live login failed (${res.status}): ${data.error ?? "no session token"}`);
    }
    setSessionToken(data.sessionToken);
  });

  it(
    "flags a planted unsupported claim against a small source pack",
    async () => {
      const report = await runFactualityJudge({
        articleText:
          "Acme Blinds has served Calgary since 1998. Acme Blinds offers free in-home consultations. Acme Blinds guarantees the lowest price in Canada on every product, forever.",
        sourceContext:
          "Acme Blinds has served Calgary since 1998. Acme Blinds offers free in-home consultations.",
        apiKey: (process.env.OPENROUTER_API_KEY ?? "").trim(),
      });

      expect(report.pass).toBe(false);
      expect(report.supportedCount).toBe(2);
      expect(report.issues.some((i) => i.detail.includes("lowest price in Canada"))).toBe(true);
    },
    180_000,
  );
});

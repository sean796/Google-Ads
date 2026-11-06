import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertServiceOrUserAuth, cronAuth } from "../lib/auth.mjs";

const TOKEN = "test-service-token";

function req(headers = {}) {
  return { headers };
}

describe("neo-host-api auth (Wave 0 token-only)", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.PULSE_HOST_API_TOKEN = TOKEN;
    delete process.env.NEO_HOST_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("rejects when no token is configured (fail closed)", () => {
    delete process.env.PULSE_HOST_API_TOKEN;
    const res = assertServiceOrUserAuth(
      req({ authorization: `Bearer ${TOKEN}`, "x-neo-pulse-team-id": "1", "x-neo-pulse-user-id": "2" }),
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("rejects spoofed identity headers without the bearer token", () => {
    const res = assertServiceOrUserAuth(
      req({ "x-neo-pulse-team-id": "1", "x-neo-pulse-user-id": "2", "x-neo-pulse-hosting-write": "1" }),
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer token", () => {
    const res = assertServiceOrUserAuth(
      req({ authorization: "Bearer wrong-token-value", "x-neo-pulse-team-id": "1", "x-neo-pulse-user-id": "2" }),
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("rejects bearer token without team and user headers", () => {
    const res = assertServiceOrUserAuth(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("accepts bearer plus identity headers with write off", () => {
    const res = assertServiceOrUserAuth(
      req({
        authorization: `Bearer ${TOKEN}`,
        "x-neo-pulse-team-id": "3",
        "x-neo-pulse-user-id": "7",
        "x-neo-pulse-hosting-write": "0",
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.teamId).toBe(3);
    expect(res.userId).toBe(7);
    expect(res.hostingWrite).toBe(false);
  });

  it("grants write only when the proxy write header is 1", () => {
    const res = assertServiceOrUserAuth(
      req({
        authorization: `Bearer ${TOKEN}`,
        "x-neo-pulse-team-id": "3",
        "x-neo-pulse-user-id": "7",
        "x-neo-pulse-hosting-write": "1",
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.hostingWrite).toBe(true);
  });

  it("cronAuth fails closed when the token is unset", () => {
    delete process.env.PULSE_HOST_API_TOKEN;
    expect(cronAuth(req({ authorization: `Bearer ${TOKEN}` })).ok).toBe(false);
    expect(cronAuth(req({})).ok).toBe(false);
  });

  it("cronAuth accepts the service token", () => {
    expect(cronAuth(req({ authorization: `Bearer ${TOKEN}` })).ok).toBe(true);
    expect(cronAuth(req({ authorization: "Bearer no" })).ok).toBe(false);
  });
});

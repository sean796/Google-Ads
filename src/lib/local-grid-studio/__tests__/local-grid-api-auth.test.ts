import { afterEach, describe, expect, it, vi } from "vitest";
import { setSessionToken } from "@/lib/auth-device";
import { fetchLocalGridHistory, fetchLocalGridWorkspace } from "../local-grid-api";

describe("local-grid api auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionToken(null);
  });

  it("sends the session Bearer token so hub routes do not 401", async () => {
    setSessionToken("test-bearer-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/local-grid/history")) {
        return new Response(JSON.stringify({ ok: true, scans: [] }), { status: 200 });
      }
      if (url.includes("/local-grid/workspace")) {
        return new Response(JSON.stringify({ ok: true, workspace: { sites: {} } }), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchLocalGridHistory("wp-1");
    await fetchLocalGridWorkspace("wp-1");

    expect(fetchMock.mock.calls.length).toBe(2);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-bearer-token");
    }
  });
});

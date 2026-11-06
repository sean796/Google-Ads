import { timingSafeEqual } from "node:crypto";

const TOKEN = () => (process.env.PULSE_HOST_API_TOKEN || process.env.NEO_HOST_API_TOKEN || "").trim();

function bearerMatches(req, token) {
  const auth = (req.headers.authorization || "").trim();
  const expected = `Bearer ${token}`;
  if (auth.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

// Wave 0: the only legitimate caller is the PHP hub proxy, which has already
// verified the user session, team membership, and hosting permissions.
// Identity headers are trusted only alongside that service token.
export function assertServiceOrUserAuth(req) {
  const token = TOKEN();
  if (!token || !bearerMatches(req, token)) {
    return { ok: false, error: "Unauthorized.", status: 401 };
  }
  const teamId = Number(req.headers["x-neo-pulse-team-id"] || 0);
  const userId = Number(req.headers["x-neo-pulse-user-id"] || 0);
  if (!Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(userId) || userId < 1) {
    return { ok: false, error: "Unauthorized.", status: 401 };
  }
  const write = (req.headers["x-neo-pulse-hosting-write"] || "") === "1";
  return { ok: true, mode: "service", teamId, userId, hostingWrite: write };
}

export function cronAuth(req) {
  const token = TOKEN();
  if (!token || !bearerMatches(req, token)) {
    return { ok: false, error: "Unauthorized.", status: 401 };
  }
  return { ok: true };
}

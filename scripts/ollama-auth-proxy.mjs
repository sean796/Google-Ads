#!/usr/bin/env node
/**
 * Bearer auth front door for Ollama on Render (listens on PORT, proxies to OLLAMA_HOST).
 */
import http from "node:http";
import { request as httpRequest } from "node:http";

const port = Number(process.env.PORT || 10000);
const token = (process.env.OLLAMA_AUTH_TOKEN || "").trim();
const upstream = (process.env.OLLAMA_HOST || "127.0.0.1:11434").replace(/^https?:\/\//, "");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function unauthorized(res) {
  sendJson(res, 401, { ok: false, error: "Unauthorized" });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (token) {
    const auth = String(req.headers.authorization || "");
    const expected = `Bearer ${token}`;
    if (auth !== expected) {
      unauthorized(res);
      return;
    }
  }

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;

  const proxyReq = httpRequest(
    {
      hostname: upstream.split(":")[0],
      port: Number(upstream.split(":")[1] || 11434),
      path: req.url || "/",
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    sendJson(res, 502, { ok: false, error: err.message || "Ollama upstream error" });
  });

  req.pipe(proxyReq);
});

server.listen(port, () => {
  console.log(`[ollama-auth-proxy] listening on ${port} -> ${upstream}`);
});

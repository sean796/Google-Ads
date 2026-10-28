import https from "node:https";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

function loadEnvOpenRouterKey() {
  const key = String(process.env.OPENROUTER_API_KEY ?? process.env.VITE_OPENROUTER_API_KEY ?? "").trim();
  return key || null;
}

function headerOpenRouterKey(req) {
  const raw = req.headers["x-openrouter-api-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const key = String(value ?? "").trim();
  return key || null;
}

export function isOpenRouterChatCompletionRequest(method, path) {
  const p = path.split("?")[0] ?? "";
  return method === "POST" && (p === "/api/openrouter/chat-completion" || p === "/api/openrouter/chat-completion/");
}

function extractTextContent(message) {
  if (!message || typeof message !== "object") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractReasoningText(message) {
  if (!message || typeof message !== "object") return "";
  if (typeof message.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning.trim();
  }
  if (Array.isArray(message.reasoning_details)) {
    return message.reasoning_details
      .map((d) => (typeof d?.text === "string" ? d.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    const val = JSON.parse(trimmed);
    if (val && typeof val === "object" && !Array.isArray(val)) return val;
  } catch {}

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const val = JSON.parse(match[0]);
      if (val && typeof val === "object" && !Array.isArray(val)) return val;
    } catch {}
  }
  return null;
}

/**
 * Handles POST /api/openrouter/chat-completion directly via OpenRouter HTTPS.
 * @param {import("node:http").IncomingMessage} req
 * @param {Buffer | undefined} bodyBuffer
 */
export async function handleOpenRouterChatCompletion(req, bodyBuffer) {
  const rawBody = bodyBuffer?.length ? JSON.parse(bodyBuffer.toString("utf8")) : {};
  const apiKey =
    headerOpenRouterKey(req) ??
    (rawBody.apiKey ? String(rawBody.apiKey).trim() : null) ??
    (rawBody.openRouterApiKey ? String(rawBody.openRouterApiKey).trim() : null) ??
    loadEnvOpenRouterKey();

  if (!apiKey) {
    return {
      status: 400,
      json: { ok: false, error: "OpenRouter API key is missing. Add it in Dashboard → API Keys." },
    };
  }

  const model = String(rawBody.model ?? "google/gemini-2.5-flash").trim();
  const messages = Array.isArray(rawBody.messages)
    ? rawBody.messages
    : rawBody.system || rawBody.user
      ? [
          ...(rawBody.system ? [{ role: "system", content: String(rawBody.system) }] : []),
          ...(rawBody.user ? [{ role: "user", content: String(rawBody.user) }] : []),
        ]
      : [];

  if (messages.length === 0) {
    return {
      status: 400,
      json: { ok: false, error: "messages are required" },
    };
  }

  const payload = {
    model,
    messages,
    temperature: typeof rawBody.temperature === "number" ? rawBody.temperature : 0.35,
    max_tokens: typeof rawBody.maxTokens === "number" ? rawBody.maxTokens : (typeof rawBody.max_tokens === "number" ? rawBody.max_tokens : 4096),
    stream: Boolean(rawBody.stream),
  };

  if (rawBody.responseFormat ?? rawBody.response_format) {
    payload.response_format = rawBody.responseFormat ?? rawBody.response_format;
  }
  if (rawBody.reasoning) {
    payload.reasoning = rawBody.reasoning;
  }

  const postData = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(CHAT_URL);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
        "X-Title": "NEO Pulse Web App",
      },
    };

    const outReq = https.request(options, (outRes) => {
      const chunks = [];
      outRes.on("data", (chunk) => chunks.push(chunk));
      outRes.on("end", () => {
        const statusCode = outRes.statusCode ?? 502;
        const resBody = Buffer.concat(chunks).toString("utf8");

        try {
          const raw = JSON.parse(resBody);
          if (statusCode < 200 || statusCode >= 300) {
            const err = raw?.error?.message ?? raw?.message ?? `OpenRouter error (${statusCode})`;
            resolve({
              status: statusCode,
              json: { ok: false, error: err, statusCode, raw },
            });
            return;
          }

          const message = raw?.choices?.[0]?.message ?? {};
          let content = extractTextContent(message);
          const reasoning = extractReasoningText(message);
          const parsed = payload.response_format ? parseJsonObject(content || reasoning) : null;

          if (parsed) {
            content = JSON.stringify(parsed);
          } else if (!content && reasoning) {
            content = reasoning;
          }

          resolve({
            status: 200,
            json: {
              ok: true,
              content,
              parsed,
              finishReason: raw?.choices?.[0]?.finish_reason ?? null,
              nativeFinishReason: raw?.choices?.[0]?.native_finish_reason ?? null,
              raw,
            },
          });
        } catch (e) {
          resolve({
            status: 502,
            json: { ok: false, error: `Invalid OpenRouter response: ${e.message}`, raw: resBody },
          });
        }
      });
    });

    outReq.on("error", (err) => {
      reject(err);
    });

    outReq.write(postData);
    outReq.end();
  });
}

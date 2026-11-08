import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function envOr(env, key, fallback = "") {
  const v = env[key];
  return typeof v === "string" ? v.trim() : fallback;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} argv
 * @param {(q: string) => Promise<string>} [ask]
 */
export async function collectArgs(env, argv, ask) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      flags.set(a.slice(2), argv[i + 1]);
      i += 1;
    }
  }

  let prompt = ask;
  if (!prompt && input.isTTY) {
    const rl = readline.createInterface({ input, output });
    prompt = async (q) => {
      const a = await rl.question(q);
      return a.trim();
    };
    prompt.close = () => rl.close();
  }

  async function need(flag, envKey, question) {
    const fromFlag = flags.get(flag);
    if (fromFlag) return fromFlag.trim();
    const fromEnv = envOr(env, envKey);
    if (fromEnv) return fromEnv;
    if (prompt) return (await prompt(question)).trim();
    throw new Error(`${envKey} is required`);
  }

  async function optional(flag, envKey, question) {
    const fromFlag = flags.get(flag);
    if (fromFlag !== undefined) return fromFlag.trim();
    const fromEnv = envOr(env, envKey);
    if (fromEnv) return fromEnv;
    if (prompt) return (await prompt(question)).trim();
    return "";
  }

  try {
    const templateSiteUrl = await need("template", "TEMPLATE_SITE_URL", "Template site URL: ");
    const clientSiteUrl = await need("client", "CLIENT_SITE_URL", "New client site URL: ");
    const emcpUrl = await need("REMOVED_emcp", "EMCP_URL", "EMCP URL: ");
    const sftpHost = await optional("sftp-host", "WPE_SFTP_HOST", "SFTP host (blank to skip apply): ");
    const sftpUser = await optional("sftp-user", "WPE_SFTP_USER", "SFTP user: ");
    const sftpPort = await optional("sftp-port", "WPE_SFTP_PORT", "SFTP port [2222]: ");
    const brandFolder = await optional(
      "brand-folder",
      "BRAND_FOLDER",
      "Brand folder path (blank = no media this run): ",
    );
    const leftoverPath = flags.get("leftover") || envOr(env, "LEFTOVER_IDENTITY_PATH");
    const mcpJsonPath =
      flags.get("mcp-json") ||
      envOr(env, "MCP_JSON_PATH") ||
      path.join(env.USERPROFILE || env.HOME || "", ".cursor", "mcp.json");

    if (!templateSiteUrl || !clientSiteUrl || !emcpUrl) {
      throw new Error("TEMPLATE_SITE_URL, CLIENT_SITE_URL, and EMCP_URL are required");
    }

    return {
      templateSiteUrl,
      clientSiteUrl,
      emcpUrl,
      sftpHost,
      sftpUser,
      sftpPort: sftpPort || "2222",
      brandFolder,
      leftoverPath,
      mcpJsonPath,
      sftpPassword: envOr(env, "WPE_SFTP_PASS"),
    };
  } finally {
    if (prompt?.close) prompt.close();
  }
}

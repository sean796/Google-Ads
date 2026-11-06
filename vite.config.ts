import { createRequire } from "module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { localDominatorDevExportPlugin } from "./scripts/vite-local-dominator-export-plugin.mjs";
import { localWpApiProxyPlugin } from "./scripts/vite-local-wp-api-proxy-plugin.mjs";
import { entityMapsPuppeteerDevPlugin } from "./scripts/vite-entity-maps-puppeteer-plugin.mjs";

const require = createRequire(import.meta.url);
const { resolveDevApiTarget, isLocalWpProxyTarget } = require("./scripts/resolve-dev-api-target.cjs");

const repoRoot = path.resolve(__dirname);

const deployGitSha =
  process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || "";
const isMobileApp = process.env.VITE_MOBILE_APP === "1";
// Wave 0: the OpenRouter key is never inlined into the client bundle.
// The server resolves its env key; the browser sends no key.

export default defineConfig(({ mode, command }) => {
  const isDevServer = command === "serve";
  const isDev = mode === "development";
  let localApiTarget: string | null = null;

  if (isDevServer) {
    if (process.env.NEO_PULSE_DEV_ORCHESTRATOR !== "1") {
      console.warn(
        "[vite] Start dev with npm run dev or start-neopulse-local.bat (not raw npx vite) so /api uses neopulse.local.",
      );
    }
    localApiTarget = resolveDevApiTarget({ strict: true });
    if (!isLocalWpProxyTarget(localApiTarget)) {
      throw new Error(
        "Local dev API target must be neopulse.local (or localhost). Run npm run setup:local-wp or start-neopulse-local.bat.",
      );
    }
  }

  return {
    base: process.env.VITE_BASE_PATH || "/",
    define: {
      "import.meta.env.VITE_DEPLOY_GIT_SHA": JSON.stringify(deployGitSha),
      "import.meta.env.VITE_MOBILE_APP": JSON.stringify(isMobileApp ? "1" : ""),
    },
    build: {
      rollupOptions: {
        input: isMobileApp
          ? { index: path.resolve(__dirname, "mobile.html") }
          : path.resolve(__dirname, "index.html"),
      },
    },
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      isDevServer && {
        name: "neo-pulse-dev-meta",
        configureServer(server) {
          server.httpServer?.once("listening", () => {
            console.log(`[vite] NEO Pulse dev root: ${repoRoot}`);
            if (localApiTarget) {
              console.log(`[vite] API proxy target: ${localApiTarget}`);
            }
          });
          server.middlewares.use((req, res, next) => {
            const url = req.url?.split("?")[0] ?? "";
            if (url === "/__neo-pulse/dev-meta.json") {
              res.statusCode = 200;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.setHeader("cache-control", "no-store");
              res.end(
                JSON.stringify({
                  repoRoot,
                  apiTarget: localApiTarget,
                  orchestrator: process.env.NEO_PULSE_DEV_ORCHESTRATOR === "1",
                }),
              );
              return;
            }
            if (url === "/__neo-pulse/dev-ui.json") {
              res.statusCode = 200;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.setHeader("cache-control", "no-store");
              res.end(JSON.stringify({ aiModelsPanel: "pipeline-agents-v3" }));
              return;
            }
            next();
          });
        },
      } satisfies Plugin,
      isDev && componentTagger(),
      isDevServer && entityMapsPuppeteerDevPlugin(),
      isDevServer && localDominatorDevExportPlugin(),
      isDevServer && localWpApiProxyPlugin(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
  };
});

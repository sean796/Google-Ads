import fs from "node:fs";
import path from "node:path";
import { SECTION_LABELS, SECTION_OVERVIEWS } from "./constants.mjs";
import { slugFromPath, titleFromPath, titleFromSegment } from "./path-utils.mjs";

/**
 * @param {Array<{method:string,path:string,auth:string,title?:string,stream?:boolean}>} routes
 * @param {string} docsDir
 */
export function buildManifest(routes, docsDir) {
  /** @type {Record<string, {slug:string,title:string,method?:string,path?:string,auth?:string,order:number}[]>} */
  const sections = {};

  for (const route of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    const slug = slugFromPath(route.path);
    const sectionKey = slug.split("/")[0];
    if (!sections[sectionKey]) sections[sectionKey] = [];
    sections[sectionKey].push({
      slug,
      title: route.title ?? titleFromPath(route.path, route.method),
      method: route.method,
      path: `/api/${route.path}`,
      auth: route.auth,
      order: sections[sectionKey].length * 10 + 10,
    });
  }

  for (const ov of SECTION_OVERVIEWS) {
    const overviewFile = path.join(docsDir, ...ov.slug.split("/")) + ".md";
    if (!fs.existsSync(overviewFile)) continue;
    if (!sections[ov.sectionId]) sections[ov.sectionId] = [];
    if (!sections[ov.sectionId].some((i) => i.slug === ov.slug)) {
      sections[ov.sectionId].unshift({
        slug: ov.slug,
        title: ov.title,
        order: ov.order,
      });
    }
  }

  const manualSections = [
    {
      id: "getting-started",
      label: "Getting started",
      items: [
        { slug: "getting-started", title: "Introduction", order: 0 },
        { slug: "getting-started/authentication", title: "Authentication", order: 10 },
        { slug: "getting-started/errors", title: "Errors", order: 20 },
        { slug: "getting-started/streaming", title: "Streaming responses", order: 30 },
        { slug: "getting-started/client-library", title: "Building a client library", order: 40 },
      ],
    },
    {
      id: "god-mode",
      label: "God Mode",
      items: [
        { slug: "god-mode/overview", title: "Overview", order: 0 },
        { slug: "god-mode/feature-index", title: "Feature index", order: 5 },
        { slug: "god-mode/ask-plan-build", title: "Ask / Plan / Build", order: 10 },
        { slug: "god-mode/tools", title: "Tools reference", order: 20 },
        { slug: "god-mode/body-ops", title: "Body operations", order: 30 },
        { slug: "god-mode/endpoints", title: "Endpoints", order: 40 },
      ],
    },
    {
      id: "aiseo",
      label: "AISEO & Details Contract",
      items: [
        { slug: "aiseo/overview", title: "Architecture & Contracts", order: 0 },
        { slug: "aiseo/element-library", title: "AISEO Element Library", order: 10 },
        { slug: "aiseo/generated-files", title: "Generated Files & Upload JSONs", order: 20 },
      ],
    },
    {
      id: "mastra",
      label: "Mastra",
      items: [
        { slug: "mastra/overview", title: "Mastra Overview & Architecture", order: 0 },
        { slug: "mastra/workflows-and-steps", title: "Workflows & Steps", order: 10 },
        { slug: "mastra/agents-and-models", title: "Agents & Category Models", order: 20 },
        { slug: "mastra/agent-registry", title: "Pulse Agent Registry", order: 30 },
        { slug: "mastra/agentic-study-guide", title: "Agentic Engineering Study Guide", order: 35 },
        { slug: "mastra/playbook-index", title: "Playbook: Complete Index", order: 40 },
        { slug: "mastra/playbook/agents-and-subagents", title: "Playbook: Agents & Subagents", order: 50 },
        { slug: "mastra/playbook/workflows", title: "Playbook: Workflows & Control Flow", order: 60 },
        { slug: "mastra/playbook/harness", title: "Playbook: Harness, Durable Agents & Signals", order: 70 },
        { slug: "mastra/playbook/memory", title: "Playbook: Memory & Context Recall", order: 80 },
        { slug: "mastra/playbook/guides-and-context", title: "Playbook: Guides, Context Engineering & Lifecycle", order: 90 },
        { slug: "mastra/playbook/evals-and-observability", title: "Playbook: Evals, Scorers & Observability", order: 100 },
        { slug: "mastra/playbook/connections-and-sandboxes", title: "Playbook: MCP, Connections, Sandboxes & Channels", order: 110 },
        { slug: "mastra/playbook/server-auth-and-deploy", title: "Playbook: Server, Storage, Studio, Auth & Deployment", order: 120 },
        { slug: "mastra/playbook/models-and-platform", title: "Playbook: Model Router, Providers & Platform", order: 130 },
        { slug: "mastra/playbook/reference-agents-and-tools", title: "Playbook: API Reference - Agents & Tools", order: 140 },
        { slug: "mastra/playbook/reference-workflows-core-and-memory", title: "Playbook: API Reference - Workflows, Core & Memory", order: 150 },
      ],
    },
  ];

  const apiSections = Object.keys(sections)
    .sort()
    .map((id) => ({
      id,
      label: SECTION_LABELS[id] ?? titleFromSegment(id),
      items: sections[id].sort((a, b) => a.order - b.order),
    }));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    sections: [...manualSections, ...apiSections],
  };

  fs.writeFileSync(path.join(docsDir, "_manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

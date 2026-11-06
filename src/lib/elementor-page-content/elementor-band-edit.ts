type ElementorNode = {
  id?: string;
  elType?: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: ElementorNode[];
};

export function cloneElementorData(data: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(data)) as unknown[];
}

function walkWidgets(nodes: ElementorNode[], visit: (node: ElementorNode) => void): void {
  for (const node of nodes) {
    if (node.elType === "widget") visit(node);
    walkWidgets(node.elements ?? [], visit);
  }
}

export function applyHeaderToBand(band: ElementorNode, title: string): boolean {
  const headings: ElementorNode[] = [];
  walkWidgets(band.elements ?? [], (node) => {
    if (node.widgetType === "heading") headings.push(node);
  });
  const preferred =
    headings.find((h) => h.settings?.header_size === "h2") ??
    headings.find((h) => h.settings?.header_size === "h1") ??
    headings[0];
  if (!preferred) return false;
  preferred.settings = { ...preferred.settings, title };
  return true;
}

type BodyWidgetTarget = {
  node: ElementorNode;
  field: "editor" | "html";
};

function collectBodyWidgetTargets(band: ElementorNode): BodyWidgetTarget[] {
  const targets: BodyWidgetTarget[] = [];
  walkWidgets(band.elements ?? [], (node) => {
    const settings = node.settings ?? {};
    if (node.widgetType === "text-editor") {
      targets.push({ node, field: "editor" });
      return;
    }
    if (node.widgetType === "html") {
      targets.push({ node, field: "html" });
      return;
    }
    if (typeof settings.editor === "string") {
      targets.push({ node, field: "editor" });
      return;
    }
    if (typeof settings.html === "string") {
      targets.push({ node, field: "html" });
    }
  });
  return targets;
}

export function applyBodyHtmlToBand(band: ElementorNode, bodyHtml: string): boolean {
  const targets = collectBodyWidgetTargets(band);
  if (!targets.length) {
    const widget: ElementorNode = {
      elType: "widget",
      widgetType: "text-editor",
      settings: { editor: bodyHtml },
    };
    band.elements = [...(band.elements ?? []), widget];
    return true;
  }
  const first = targets[0]!;
  first.node.settings = { ...first.node.settings, [first.field]: bodyHtml };
  for (let i = 1; i < targets.length; i += 1) {
    const target = targets[i]!;
    target.node.settings = { ...target.node.settings, [target.field]: "" };
  }
  return true;
}

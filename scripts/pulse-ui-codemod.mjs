/**
 * Pulse UI codemod. Deterministic, closed rules only.
 *   node scripts/pulse-ui-codemod.mjs [--classes-only] <files...>
 *
 * 1. Class tokens inside string literals: truncate, line-clamp, text-ellipsis, text-[Npx], numbered palette,
 *    animate-spin / animate-pulse (see PALETTE below).
 * 2. Spinners: JSX <Loader2 /> and <Loader /> are removed.
 * 3. <Label> becomes the lowercase inline <label>.
 * 4. shadcn Textarea, Input, Button and Select become TextareaField, Field, Button and SelectField.
 * 5. Raw <textarea>, <input> (text-like), <select> and <button> become kit parts when the class names
 *    classify cleanly. Anything ambiguous is left alone and listed in the report.
 * Import lines are repaired afterwards. Class names on converted controls are dropped on purpose
 * (the kit owns the look).
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const classesOnly = args.includes("--classes-only");
const files = args.filter((a) => !a.startsWith("--"));

/* ------------------------------ class tokens ------------------------------ */

const NEUTRAL = new Set(["zinc", "slate", "gray", "neutral", "stone"]);
const DANGER = new Set(["red", "rose"]);
const SUCCESS = new Set(["green", "emerald", "lime", "teal"]);
const WARNING = new Set(["amber", "yellow", "orange"]);
const ANALYSIS = new Set(["cyan", "sky"]);
const PUBLISH = new Set(["blue", "indigo", "violet", "purple", "fuchsia", "pink"]);

function paletteToken(prop, family, shadeStr, opacity) {
  const shade = Number(shadeStr);
  const op = opacity ?? "";
  const soft = (name) => `${prop}-${name}${op || "/20"}`;
  if (NEUTRAL.has(family)) {
    if (prop === "text") return `text-${shade <= 300 ? "foreground" : shade <= 600 ? "muted-foreground" : "black"}${op}`;
    if (prop === "bg") {
      const t = shade <= 300 ? "muted" : shade <= 800 ? "ui-field-hover" : shade === 900 ? "ui-field" : "black";
      return `bg-${t}${op}`;
    }
    if (["border", "ring", "divide", "outline"].includes(prop)) return `${prop}-border${op}`;
    return `${prop}-muted-foreground${op}`;
  }
  const role = DANGER.has(family) ? "danger" : SUCCESS.has(family) ? "success" : WARNING.has(family) ? "warning" : ANALYSIS.has(family) ? "analysis" : "publish";
  if (role === "danger") {
    if (prop === "text") return `text-${shade <= 400 ? "ui-danger-hover" : "ui-danger"}${op}`;
    if (prop === "bg") return shade >= 800 ? `bg-ui-danger-surface${op}` : `bg-ui-danger${op || "/20"}`;
    return `${prop}-ui-danger-edge${op}`;
  }
  const name = role === "success" ? "primary" : `semantic-${role}`;
  if (prop === "text") return role === "success" ? `text-primary${op}` : `text-${name}${shade <= 400 ? "-foreground" : ""}${op}`;
  if (prop === "bg") return shade >= 700 ? soft(name) : `bg-${name}${op || "/80"}`;
  return `${prop}-${name}${op}`;
}

const PALETTE_RE = new RegExp(
  "(?<![\\w-])((?:[a-z0-9\\[\\]&>_-]+:)*)(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow)-(zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\\d{2,3})(\\/\\d+|\\/\\[[^\\]]+\\])?(?![\\w-])",
  "g",
);

function swapClasses(slice, quoted) {
  let out = slice
    .replace(PALETTE_RE, (_m, variant, prop, family, shade, opacity) => variant + paletteToken(prop, family, shade, opacity))
    .replace(/(?<![\w-])(?:[a-z0-9\[\]&>_-]+:)*animate-(?:spin|pulse)(?![\w-])/g, "")
    .replace(/(?<![\w-])(?:[a-z0-9\[\]&>_-]+:)*(?:line-clamp-\d+|text-ellipsis)(?![\w-])/g, "")
    .replace(/(?<![\w-])truncate(?![\w-])/g, "break-words")
    .replace(/(?<![\w-])text-\[(?:length:)?[0-9.]+(?:px|rem|em|%)?\](?![\w-])/g, "text-base");
  if (out !== slice) {
    out = out.replace(/ {2,}/g, " ");
    if (quoted) out = out.replace(/^(["'`]) /, "$1").replace(/ (["'`])$/, "$1");
  }
  return out;
}

/* --------------------------------- helpers -------------------------------- */

const ICON_BUTTON_TOOL_FIELDS = new Set(["checkbox", "radio", "file", "hidden", "range", "color", "submit", "button", "reset", "image"]);

const attrOf = (el, name) => el.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === name);
const strOf = (attr) => {
  if (!attr?.initializer) return undefined;
  const i = attr.initializer;
  if (ts.isStringLiteral(i)) return i.text;
  if (ts.isJsxExpression(i) && i.expression && (ts.isStringLiteral(i.expression) || ts.isNoSubstitutionTemplateLiteral(i.expression))) return i.expression.text;
  return undefined;
};
const tagText = (el) => el.tagName.getText();
const isSelfClosing = (n) => ts.isJsxSelfClosingElement(n);
const openingOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n);

/** Edits that rename a tag (opening and closing). */
function renameTag(n, to, edits) {
  const open = openingOf(n);
  edits.push({ start: open.tagName.getStart(), end: open.tagName.end, text: to });
  if (ts.isJsxElement(n)) edits.push({ start: n.closingElement.tagName.getStart(), end: n.closingElement.tagName.end, text: to });
}

function dropAttrs(open, names, edits) {
  for (const p of open.attributes.properties) {
    if (ts.isJsxAttribute(p) && names.includes(p.name.text)) edits.push({ start: p.getFullStart(), end: p.end, text: "" });
  }
}

function addAttr(open, text, edits) {
  edits.push({ start: open.tagName.end, end: open.tagName.end, text: ` ${text}` });
}

/** Class text a className attribute can contribute: every string literal inside it, joined. */
function classUnion(open) {
  const a = attrOf(open, "className");
  if (!a?.initializer) return { text: "", dynamic: false };
  let text = "";
  let dynamic = false;
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text += ` ${n.text}`;
    if (ts.isConditionalExpression(n) || ts.isTemplateExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) dynamic = true;
    ts.forEachChild(n, visit);
  };
  visit(a.initializer);
  return { text, dynamic };
}

/** `<Button ...><Icon /></Button>` with a text label in aria-label or title becomes an icon button. */
function iconOnly(n, open, edits) {
  if (!ts.isJsxElement(n)) return false;
  const kids = n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
  if (kids.length !== 1 || !ts.isJsxSelfClosingElement(kids[0])) return false;
  const icon = tagText(kids[0]);
  if (!/^[A-Z]/.test(icon)) return false;
  const hasAria = Boolean(attrOf(open, "aria-label"));
  const title = strOf(attrOf(open, "title"));
  if (!hasAria && !title) return false;
  edits.push({ start: open.end, end: n.closingElement.getStart(), text: "" });
  addAttr(open, `size="icon" icon={${icon}}${hasAria ? "" : ` aria-label=${JSON.stringify(title)}`}`, edits);
  return true;
}

const report = [];

/* --------------------------------- per file -------------------------------- */

function transform(path) {
  const source = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const need = new Set();
  const skipped = [];

  const importedFrom = new Map(); // local name -> module
  const declared = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const mod = st.moduleSpecifier.text;
      const nb = st.importClause.namedBindings;
      if (st.importClause.name) importedFrom.set(st.importClause.name.text, mod);
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) importedFrom.set(e.name.text, mod);
    } else {
      ts.forEachChild(st, (c) => {
        if ((ts.isFunctionDeclaration(c) || ts.isClassDeclaration(c)) && c.name) declared.add(c.name.text);
      });
      if (ts.isFunctionDeclaration(st) && st.name) declared.add(st.name.text);
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) declared.add(d.name.text);
    }
  }
  const fromUi = (name, suffix) => importedFrom.get(name)?.endsWith(`/ui/vendor/${suffix}`);
  const canUse = (name) => !declared.has(name) && (!importedFrom.has(name) || importedFrom.get(name) === "@/ui");

  const hasButtonVariants = importedFrom.has("buttonVariants");

  const visit = (n) => {
    // 1. class tokens
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (!(n.parent && ts.isImportDeclaration(n.parent)) && !(n.parent && ts.isExternalModuleReference(n.parent))) {
        const slice = source.slice(n.getStart(), n.end);
        const quoted = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
        const out = swapClasses(slice, quoted);
        if (out !== slice) edits.push({ start: n.getStart(), end: n.end, text: out });
      }
    }
    if (classesOnly) {
      ts.forEachChild(n, visit);
      return;
    }

    // 2. spinners
    if (isSelfClosing(n) && ["Loader2", "Loader"].includes(tagText(n)) && importedFrom.get(tagText(n)) === "lucide-react") {
      const p = n.parent;
      if (ts.isJsxElement(p) || ts.isJsxFragment(p)) edits.push({ start: n.getFullStart(), end: n.end, text: "" });
      else edits.push({ start: n.getStart(), end: n.end, text: "null" });
    }

    if (ts.isJsxElement(n) || isSelfClosing(n)) {
      const open = openingOf(n);
      const tag = tagText(open);

      // 3. Label
      if (tag === "Label" && fromUi("Label", "label")) renameTag(n, "label", edits);

      // 4a. shadcn Textarea / raw textarea
      if ((tag === "Textarea" && fromUi("Textarea", "textarea")) || tag === "textarea") {
        const ph = attrOf(open, "placeholder") ? undefined : strOf(attrOf(open, "aria-label"));
        if (!attrOf(open, "placeholder") && ph === undefined) skipped.push(`${tag}@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} no placeholder`);
        else if (canUse("TextareaField")) {
          renameTag(n, "TextareaField", edits);
          dropAttrs(open, ["className", "style", "variant"], edits);
          if (ph !== undefined) addAttr(open, `placeholder=${JSON.stringify(ph)}`, edits);
          need.add("TextareaField");
        }
      }

      // 4b. shadcn Input / raw input (text-like)
      if ((tag === "Input" && fromUi("Input", "input")) || tag === "input") {
        const type = strOf(attrOf(open, "type"));
        const ph = attrOf(open, "placeholder") ? undefined : strOf(attrOf(open, "aria-label"));
        if (type && ICON_BUTTON_TOOL_FIELDS.has(type)) skipped.push(`${tag}[type=${type}]@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        else if (!attrOf(open, "placeholder") && ph === undefined) skipped.push(`${tag}@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} no placeholder`);
        else if (canUse("Field")) {
          renameTag(n, "Field", edits);
          dropAttrs(open, ["className", "style", "variant", "size"], edits);
          if (ph !== undefined) addAttr(open, `placeholder=${JSON.stringify(ph)}`, edits);
          need.add("Field");
        }
      }

      // 4c. shadcn Button / raw button
      if (tag === "Button" && fromUi("Button", "button")) {
        const variant = strOf(attrOf(open, "variant"));
        const dynamicVariant = attrOf(open, "variant") && variant === undefined;
        if (attrOf(open, "asChild") || dynamicVariant || attrOf(open, "size") && strOf(attrOf(open, "size")) === undefined) {
          skipped.push(`Button@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} asChild/dynamic`);
        } else if (variant === "link") {
          if (canUse("TextButton")) {
            renameTag(n, "TextButton", edits);
            dropAttrs(open, ["className", "style", "variant", "size"], edits);
            need.add("TextButton");
          }
        } else if (canUse("Button")) {
          const { text: cls } = classUnion(open);
          const inferred = !cls.trim()
            ? "run"
            : /bg-(primary|green|emerald)/.test(cls) ? "run"
            : /bg-(red|rose|ui-danger)|destructive/.test(cls) ? "danger"
            : /bg-|border/.test(cls) ? "tool"
            : "quiet";
          const kit = variant === "destructive" ? "danger" : variant === "ghost" ? "quiet" : variant === "default" ? "run" : variant === undefined ? inferred : "tool";
          const size = strOf(attrOf(open, "size"));
          dropAttrs(open, ["className", "style", "variant", "size"], edits);
          if (kit !== "tool") addAttr(open, `variant="${kit}"`, edits);
          if (size === "icon") iconOnly(n, open, edits);
          need.add("Button");
        }
      }
      if (tag === "button") {
        const { text, dynamic } = classUnion(open);
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const hasSpread = open.attributes.properties.some(ts.isJsxSpreadAttribute);
        const type = strOf(attrOf(open, "type"));
        if (dynamic || hasSpread || attrOf(open, "ref")) skipped.push(`button@${line} dynamic`);
        else if (/\b(w-full)\b/.test(text) && /\b(text-left|justify-between|items-center|gap-)/.test(text)) {
          if (canUse("RowButton")) {
            renameTag(n, "RowButton", edits);
            dropAttrs(open, ["className", "style"], edits);
            need.add("RowButton");
          }
        } else if (/\bunderline\b|hover:underline/.test(text) || (/\btext-primary\b/.test(text) && !/\b(bg-|px-|h-|w-)/.test(text))) {
          if (canUse("TextButton")) {
            renameTag(n, "TextButton", edits);
            dropAttrs(open, ["className", "style"], edits);
            need.add("TextButton");
          }
        } else if (canUse("Button")) {
          const kit = /bg-primary|bg-green|bg-emerald/.test(text) ? "run" : /ui-danger|red-|destructive/.test(text) && /bg-|border-/.test(text) ? "danger" : /bg-ui-field|border/.test(text) ? "tool" : "quiet";
          renameTag(n, "Button", edits);
          dropAttrs(open, ["className", "style", ...(type === "button" ? ["type"] : [])], edits);
          if (kit !== "tool") addAttr(open, `variant="${kit}"`, edits);
          iconOnly(n, open, edits);
          need.add("Button");
        }
      }

      // 4d. shadcn Select family / raw select
      if (tag === "Select" && fromUi("Select", "select") && ts.isJsxElement(n)) {
        const res = convertShadcnSelect(n, sf);
        if (res.error) skipped.push(`Select@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${res.error}`);
        else if (canUse("SelectField")) {
          edits.push({ start: n.getStart(), end: n.end, text: res.text });
          need.add("SelectField");
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  if (edits.length === 0) return { changed: false, skipped };

  // drop edits nested inside a removed or replaced range (dropped attributes, spinners, Select subtrees)
  const inside = (e, o) =>
    e !== o &&
    (e.start === e.end ? o.start < e.start && e.start < o.end : o.start <= e.start && e.end <= o.end && o.end - o.start > e.end - e.start);
  const kept = edits.filter((e) => !edits.some((o) => inside(e, o)));
  kept.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let lastStart = Infinity;
  for (const e of kept) {
    if (e.end > lastStart) continue; // overlapping, skip
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }

  out = fixImports(out, path, need);
  if (out !== source) writeFileSync(path, out);
  return { changed: out !== source, skipped };
}

/* ------------------------------ shadcn Select ------------------------------ */

function convertShadcnSelect(sel, sf) {
  const open = sel.openingElement;
  const kids = sel.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
  const trigger = kids.find((c) => ts.isJsxElement(c) && tagText(c.openingElement) === "SelectTrigger");
  const content = kids.find((c) => ts.isJsxElement(c) && tagText(c.openingElement) === "SelectContent");
  if (!trigger || !content || kids.length !== 2) return { error: "unexpected children" };
  const valueEl = trigger.children.find((c) => (ts.isJsxSelfClosingElement(c) || ts.isJsxElement(c)) && tagText(openingOf(c)) === "SelectValue");
  const placeholder = valueEl ? strOf(attrOf(openingOf(valueEl), "placeholder")) : undefined;
  const trigAria = strOf(attrOf(trigger.openingElement, "aria-label"));
  const label = placeholder ?? trigAria;
  if (!label) return { error: "no placeholder" };
  const items = content.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
  const options = [];
  let mapOptions = null;
  for (const it of items) {
    if (ts.isJsxElement(it) && tagText(it.openingElement) === "SelectItem") {
      const v = strOf(attrOf(it.openingElement, "value"));
      const dis = attrOf(it.openingElement, "disabled");
      const text = it.children.map((c) => c.getText()).join("").trim();
      if (v === undefined || v === "") return { error: "dynamic or empty item value" };
      if (!text || /[{<]/.test(text) && !/^\{[^{}]+\}$/.test(text)) return { error: "complex item label" };
      const labelExpr = /^\{[^{}]+\}$/.test(text) ? text.slice(1, -1) : JSON.stringify(text.replace(/\s+/g, " "));
      options.push(`{ value: ${JSON.stringify(v)}, label: ${labelExpr}${dis ? ", disabled: true" : ""} }`);
    } else if (ts.isJsxExpression(it) && it.expression && ts.isCallExpression(it.expression) && it.expression.expression.getText().endsWith(".map") && !mapOptions) {
      const cb = it.expression.arguments[0];
      if (!cb || !(ts.isArrowFunction(cb)) || cb.parameters.length < 1) return { error: "map callback" };
      let body = cb.body;
      if (ts.isParenthesizedExpression(body)) body = body.expression;
      if (!(ts.isJsxElement(body) && tagText(body.openingElement) === "SelectItem")) return { error: "map body" };
      const vAttr = attrOf(body.openingElement, "value");
      const vExpr = vAttr?.initializer && ts.isJsxExpression(vAttr.initializer) ? vAttr.initializer.expression?.getText() : strOf(vAttr) !== undefined ? JSON.stringify(strOf(vAttr)) : undefined;
      const kidsText = body.children.map((c) => c.getText()).join("").trim();
      if (!vExpr || !/^\{[^{}]+\}$|^[^{}<>]+$/.test(kidsText)) return { error: "map item" };
      const lExpr = kidsText.startsWith("{") ? kidsText.slice(1, -1) : JSON.stringify(kidsText);
      const params = cb.parameters.map((p) => p.getText()).join(", ");
      mapOptions = `${it.expression.expression.getText()}((${params}) => ({ value: ${vExpr}, label: ${lExpr} }))`;
    } else return { error: "unsupported child" };
  }
  const props = [];
  for (const p of open.attributes.properties) {
    if (!ts.isJsxAttribute(p)) return { error: "spread" };
    const name = p.name.text;
    if (["value", "onValueChange", "disabled"].includes(name)) props.push(p.getText());
    else if (name === "defaultValue" || name === "open" || name === "onOpenChange") return { error: `uses ${name}` };
  }
  if (!props.some((x) => x.startsWith("value"))) return { error: "no value" };
  const optsExpr = mapOptions ? (options.length ? `[${options.join(", ")}, ...${mapOptions}]` : mapOptions) : `[${options.join(", ")}]`;
  const tcls = classUnion(trigger.openingElement).text;
  const width = /\bw-full\b/.test(tcls) ? "full" : undefined;
  return { text: `<SelectField placeholder=${JSON.stringify(label)} ${props.join(" ")} options={${optsExpr}}${width ? ` width="${width}"` : ""} />` };
}

/* --------------------------------- imports -------------------------------- */

function identsUsed(sf) {
  const used = new Set();
  const visit = (n) => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isIdentifier(n)) used.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return used;
}

const SHADCN_MODULES = ["button", "input", "textarea", "label", "select"];

function fixImports(text, path, need) {
  let sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const used = identsUsed(sf);
  const edits = [];
  let uiImport = null;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const mod = st.moduleSpecifier.text;
    const nb = st.importClause.namedBindings;
    if (mod === "@/ui" && nb && ts.isNamedImports(nb) && !st.importClause.isTypeOnly) uiImport = st;
    const isShadcn = SHADCN_MODULES.some((m) => mod.endsWith(`/ui/vendor/${m}`));
    const isLucide = mod === "lucide-react";
    if ((isShadcn || isLucide) && nb && ts.isNamedImports(nb)) {
      const keep = nb.elements.filter((e) => used.has(e.name.text) || (isLucide && !["Loader2", "Loader"].includes(e.name.text)));
      if (keep.length === nb.elements.length) continue;
      if (keep.length === 0 && !st.importClause.name) edits.push({ start: st.getFullStart(), end: st.end, text: "" });
      else edits.push({ start: nb.getStart(), end: nb.end, text: `{ ${keep.map((e) => e.getText()).join(", ")} }` });
    }
  }
  const add = [...need].filter((n) => used.has(n));
  if (add.length) {
    if (uiImport) {
      const nb = uiImport.importClause.namedBindings;
      const have = new Set(nb.elements.map((e) => e.name.text));
      const names = [...nb.elements.map((e) => e.getText()), ...add.filter((n) => !have.has(n))];
      if (names.length !== nb.elements.length) edits.push({ start: nb.getStart(), end: nb.end, text: `{ ${names.join(", ")} }` });
    } else {
      const imports = sf.statements.filter(ts.isImportDeclaration);
      const last = imports[imports.length - 1];
      const line = `import { ${add.sort().join(", ")} } from "@/ui";`;
      edits.push({ start: last.end, end: last.end, text: `\n${line}` });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/* ---------------------------------- main ---------------------------------- */

let changed = 0;
for (const f of files) {
  try {
    const r = transform(f);
    if (r.changed) changed++;
    if (r.skipped.length) report.push({ file: f, skipped: r.skipped });
  } catch (e) {
    report.push({ file: f, error: String(e) });
  }
}
console.log(`changed ${changed} of ${files.length} files`);
if (report.length) console.log(JSON.stringify(report));

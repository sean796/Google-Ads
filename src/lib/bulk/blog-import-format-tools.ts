import { catalogFromBlocks, setBlockTag, wrapBlocksAsList, type FormatBlock } from "@/lib/bulk/blog-import-format-blocks";
import { parseJsonStrict } from "@/lib/model-json";

export type DirectFormatToolName = "set_block_tag" | "wrap_list";

export type DirectFormatOperation =
  | { name: "set_block_tag"; ids: number[]; tag: string }
  | { name: "wrap_list"; startId: number; endId: number; list: "ul" | "ol" };

export const DIRECT_FORMAT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_block_tag",
      description:
        "Change the outer tag of existing blocks. Inner HTML is unchanged. Use h2 for section titles, h3 for subsections, p for body. Never h1.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "number" },
            description: "Block ids to retag.",
          },
          tag: { type: "string", enum: ["p", "h2", "h3"] },
        },
        required: ["ids", "tag"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "wrap_list",
      description:
        "Turn a consecutive range of p blocks into one ul or ol. Each block inner HTML becomes an li. Does not change wording.",
      parameters: {
        type: "object",
        properties: {
          startId: { type: "number" },
          endId: { type: "number" },
          list: { type: "string", enum: ["ul", "ol"] },
        },
        required: ["startId", "endId", "list"],
      },
    },
  },
];

export type DirectFormatToolResult = {
  ok: boolean;
  error?: string;
  blocks?: ReturnType<typeof catalogFromBlocks>;
};

export function executeDirectFormatTool(
  blocks: FormatBlock[],
  name: string,
  args: Record<string, unknown>,
): DirectFormatToolResult {
  if (name === "set_block_tag") {
    const ids = Array.isArray(args.ids) ? args.ids.map((n) => Number(n)) : [];
    const tag = String(args.tag ?? "");
    if (ids.length === 0 || ids.some((n) => !Number.isFinite(n))) {
      return { ok: false, error: "ids must be a non-empty number array" };
    }
    const error = setBlockTag(blocks, ids, tag);
    if (error) return { ok: false, error };
    return { ok: true, blocks: catalogFromBlocks(blocks) };
  }

  if (name === "wrap_list") {
    const startId = Number(args.startId);
    const endId = Number(args.endId);
    const list = String(args.list ?? "") as "ul" | "ol";
    if (!Number.isFinite(startId) || !Number.isFinite(endId)) {
      return { ok: false, error: "startId and endId must be numbers" };
    }
    const error = wrapBlocksAsList(blocks, startId, endId, list);
    if (error) return { ok: false, error };
    return { ok: true, blocks: catalogFromBlocks(blocks) };
  }

  return { ok: false, error: `unknown tool ${name}` };
}

export function parseDirectFormatOperations(content: string): DirectFormatOperation[] {
  const parsed = parseJsonStrict<{ operations?: unknown }>(content);
  const raw = Array.isArray(parsed?.operations) ? parsed.operations : null;
  if (!raw) {
    throw new Error("OpenRouter format agent did not return operations");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Format operation ${index} is invalid`);
    }
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "");
    if (name === "set_block_tag") {
      const ids = Array.isArray(row.ids) ? row.ids.map((n) => Number(n)) : [];
      return { name, ids, tag: String(row.tag ?? "") };
    }
    if (name === "wrap_list") {
      return {
        name,
        startId: Number(row.startId),
        endId: Number(row.endId),
        list: String(row.list ?? "") as "ul" | "ol",
      };
    }
    throw new Error(`unknown format tool ${name}`);
  });
}

export function applyDirectFormatOperations(
  blocks: FormatBlock[],
  operations: DirectFormatOperation[],
): DirectFormatToolResult {
  for (const op of operations) {
    const result =
      op.name === "set_block_tag"
        ? executeDirectFormatTool(blocks, op.name, { ids: op.ids, tag: op.tag })
        : executeDirectFormatTool(blocks, op.name, {
            startId: op.startId,
            endId: op.endId,
            list: op.list,
          });
    if (!result.ok) return result;
  }
  return { ok: true, blocks: catalogFromBlocks(blocks) };
}

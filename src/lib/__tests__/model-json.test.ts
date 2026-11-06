import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonStrict, parseModelJson, unwrapJsonMarkdownFence } from "@/lib/model-json";

const rowsSchema = z.object({
  rows: z.array(z.object({ keyword: z.string().min(1), title: z.string().min(1) })).min(1),
});

describe("model-json strict parsing (Wave 2)", () => {
  it("parses valid JSON in one pass", () => {
    expect(parseJsonStrict('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('{"rows":[{"keyword":"k","title":"t"}]}', rowsSchema, "bulk rows")).toEqual({
      rows: [{ keyword: "k", title: "t" }],
    });
  });

  it("unwraps one markdown fence and parses", () => {
    expect(unwrapJsonMarkdownFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(parseJsonStrict('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('```\n{"rows":[{"keyword":"k","title":"t"}]}\n```', rowsSchema, "bulk rows")).toEqual({
      rows: [{ keyword: "k", title: "t" }],
    });
  });

  it("throws on invalid JSON instead of repairing it", () => {
    expect(() => parseJsonStrict('{"a":1,}')).toThrow();
    expect(() => parseJsonStrict('{"a":1')).toThrow();
    expect(() => parseModelJson('{"rows": [}', rowsSchema, "bulk rows")).toThrow(
      "Invalid bulk rows JSON: model did not return valid JSON.",
    );
  });

  it("throws on prose-prefixed JSON (no slicing)", () => {
    expect(() => parseJsonStrict('Here is the JSON: {"a":1}')).toThrow();
    expect(() => parseModelJson('Sure! {"rows":[{"keyword":"k","title":"t"}]}', rowsSchema, "bulk rows")).toThrow(
      "Invalid bulk rows JSON: model did not return valid JSON.",
    );
  });

  it("throws a labeled error on schema mismatch", () => {
    expect(() => parseModelJson('{"rows":[]}', rowsSchema, "bulk rows")).toThrow(/Invalid bulk rows JSON:/);
    expect(() => parseModelJson('{"rows":[{"keyword":"k"}]}', rowsSchema, "bulk rows")).toThrow(
      /Invalid bulk rows JSON:/,
    );
  });
});

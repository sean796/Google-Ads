import { describe, expect, it } from "vitest";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";

describe("isLeakedInstructionEntityLabel", () => {
  it("allows normal neighbourhood labels", () => {
    expect(isLeakedInstructionEntityLabel("Beltline, Calgary")).toBe(false);
    expect(isLeakedInstructionEntityLabel("Dalhousie, Calgary, AB")).toBe(false);
  });

  it("rejects instruction echoes and chain-of-thought", () => {
    expect(
      isLeakedInstructionEntityLabel(
        "We need answer only valid JSON. Need plan sub-ad neighbourhoods under parent city Calgary, AB",
      ),
    ).toBe(true);
    expect(isLeakedInstructionEntityLabel("a".repeat(121))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { maskStoredSecretForDisplay } from "@/lib/mask-stored-secret-display";

describe("maskStoredSecretForDisplay", () => {
  it("masks long secrets with head and tail", () => {
    const full = "unit-test-secret-9cd1234567890abcdef3de";
    const masked = maskStoredSecretForDisplay(full);
    expect(masked.startsWith("unit-test-se")).toBe(true);
    expect(masked.endsWith("3de")).toBe(true);
    expect(masked).toContain("•");
    expect(masked).not.toBe(full);
  });

  it("leaves short values unchanged", () => {
    expect(maskStoredSecretForDisplay("short")).toBe("short");
  });
});

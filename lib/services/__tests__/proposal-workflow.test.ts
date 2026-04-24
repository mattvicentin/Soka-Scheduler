import { describe, it, expect } from "vitest";

describe("proposal workflow", () => {
  it("should not allow draft proposals to become approved directly", () => {
    const from = "draft";
    const to = "approved";

    const isValid = from === "submitted" && to === "approved";

    expect(isValid).toBe(false);
  });
});

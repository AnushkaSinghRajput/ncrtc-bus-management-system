import { describe, expect, it } from "vitest";
import { ApiError } from "./api";

describe("ApiError", () => {
  it("carries status code", () => {
    const err = new ApiError(403, "Insufficient role");
    expect(err.status).toBe(403);
    expect(err.message).toContain("Insufficient");
  });
});

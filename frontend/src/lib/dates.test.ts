import { describe, expect, it } from "vitest";
import { toLocalDateString, weekDateStrings } from "./dates";

describe("dates", () => {
  it("formats local date without UTC shift", () => {
    const d = new Date(2026, 9, 23, 0, 30, 0); // Oct 23 local
    expect(toLocalDateString(d)).toBe("2026-10-23");
  });

  it("returns 7 monday-start days", () => {
    const week = weekDateStrings(new Date(2026, 9, 23)); // Friday
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-10-19"); // Monday
    expect(week[6]).toBe("2026-10-25"); // Sunday
  });
});

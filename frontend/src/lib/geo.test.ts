import { describe, expect, it } from "vitest";
import { formatDuration, haversineKm, pathLengthKm } from "./geo";

describe("geo helpers", () => {
  it("measures Delhi to Noida within a sensible range", () => {
    const km = haversineKm([28.6139, 77.209], [28.5355, 77.391]);
    expect(km).toBeGreaterThan(19);
    expect(km).toBeLessThan(21);
  });

  it("sums path segments and handles short paths", () => {
    expect(pathLengthKm([])).toBe(0);
    expect(pathLengthKm([[28.6, 77.2]])).toBe(0);
    const a: [number, number] = [28.6, 77.2];
    const b: [number, number] = [28.61, 77.2];
    expect(pathLengthKm([a, b, a])).toBeCloseTo(haversineKm(a, b) * 2, 6);
  });

  it("formats durations", () => {
    expect(formatDuration(5 * 60000)).toBe("5m");
    expect(formatDuration(125 * 60000)).toBe("2h 5m");
  });
});

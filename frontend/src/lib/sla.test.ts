import { describe, expect, it } from "vitest";
import { formatSpan, slaFor } from "./sla";

const NOW = new Date("2026-10-23T10:00:00Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

describe("incident SLA", () => {
  it("counts down the acknowledge target for open incidents", () => {
    const s = slaFor({ severity: "P1", status: "open", created_at: minsAgo(5), resolved_at: null }, NOW);
    expect(s.stage).toBe("acknowledge");
    expect(s.breached).toBe(false);
    expect(s.label).toBe("10m to ack");
  });

  it("flags breached P1 acknowledgement after 15 minutes", () => {
    const s = slaFor({ severity: "P1", status: "open", created_at: minsAgo(40), resolved_at: null }, NOW);
    expect(s.breached).toBe(true);
    expect(s.label).toBe("ack overdue 25m");
  });

  it("switches to the resolve target once acknowledged", () => {
    const s = slaFor({ severity: "P2", status: "in_progress", created_at: minsAgo(120), resolved_at: null }, NOW);
    expect(s.stage).toBe("resolve");
    expect(s.label).toBe("22h 0m to resolve");
  });

  it("reports late resolution for done incidents", () => {
    const s = slaFor(
      { severity: "P1", status: "resolved", created_at: minsAgo(300), resolved_at: minsAgo(0) },
      NOW,
    );
    expect(s.stage).toBe("done");
    expect(s.breached).toBe(true);
    expect(s.label).toBe("Resolved 1h 0m late");
  });

  it("formats multi-day spans", () => {
    expect(formatSpan(-(26 * 60 + 5) * 60000)).toBe("1d 2h");
  });
});

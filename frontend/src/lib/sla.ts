import type { Incident } from "../types";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Response targets per severity, measured from when the incident was raised. */
export const SLA_TARGETS: Record<string, { ackMs: number; resolveMs: number }> = {
  P1: { ackMs: 15 * MIN, resolveMs: 4 * HOUR },
  P2: { ackMs: 1 * HOUR, resolveMs: 24 * HOUR },
  P3: { ackMs: 4 * HOUR, resolveMs: 72 * HOUR },
};

export const NEXT_STATUSES: Record<string, string[]> = {
  open: ["acknowledged", "closed"],
  acknowledged: ["in_progress", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

export type SlaState = {
  stage: "acknowledge" | "resolve" | "done";
  breached: boolean;
  /** Positive = time left, negative = time over target. */
  remainingMs: number;
  label: string;
};

export function formatSpan(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * HOUR));
  const h = Math.floor((abs % (24 * HOUR)) / HOUR);
  const m = Math.floor((abs % HOUR) / MIN);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function slaFor(i: Pick<Incident, "severity" | "status" | "created_at" | "resolved_at">, now = Date.now()): SlaState {
  const target = SLA_TARGETS[i.severity] ?? SLA_TARGETS.P3;
  const created = new Date(i.created_at).getTime();

  if (i.status === "resolved" || i.status === "closed") {
    const end = i.resolved_at ? new Date(i.resolved_at).getTime() : now;
    const remainingMs = created + target.resolveMs - end;
    const breached = i.resolved_at ? remainingMs < 0 : false;
    return {
      stage: "done",
      breached,
      remainingMs,
      label: i.resolved_at ? (breached ? `Resolved ${formatSpan(remainingMs)} late` : "Resolved within SLA") : "Closed",
    };
  }

  const stage = i.status === "open" ? "acknowledge" : "resolve";
  const due = created + (stage === "acknowledge" ? target.ackMs : target.resolveMs);
  const remainingMs = due - now;
  const breached = remainingMs < 0;
  const verb = stage === "acknowledge" ? "ack" : "resolve";
  return {
    stage,
    breached,
    remainingMs,
    label: breached ? `${verb} overdue ${formatSpan(remainingMs)}` : `${formatSpan(remainingMs)} to ${verb}`,
  };
}

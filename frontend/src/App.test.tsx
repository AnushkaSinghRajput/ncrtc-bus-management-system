import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("role labels are defined", () => {
    const roles = ["driver", "conductor", "depot_manager", "control_room_operator", "admin"];
    expect(roles).toHaveLength(5);
  });
});

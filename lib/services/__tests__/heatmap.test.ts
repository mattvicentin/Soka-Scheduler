/**
 * Heatmap calculation unit tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduleSlot: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/scope", () => ({
  getAccessibleProgramIds: vi.fn().mockResolvedValue(null),
}));

function timeToDate(hour: number, minute: number): Date {
  return new Date(2000, 0, 1, hour, minute, 0);
}

describe("getHeatmapData", () => {
  it("returns empty cells when no slots", async () => {
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);

    const { getHeatmapData } = await import("../heatmap");
    const result = await getHeatmapData("t1", "v1", undefined, {
      accountId: "a1",
      role: "dean",
      isAdmin: false,
    });

    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.max_slot_count).toBe(0);
    expect(result.cells.every((c) => c.slot_count === 0)).toBe(true);
  });

  it("counts overlapping slots in same hour block", async () => {
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: timeToDate(10, 0), endTime: timeToDate(11, 30) },
      { dayOfWeek: 1, startTime: timeToDate(10, 30), endTime: timeToDate(11, 0) },
    ] as never);

    const { getHeatmapData } = await import("../heatmap");
    const result = await getHeatmapData("t1", "v1", undefined, {
      accountId: "a1",
      role: "dean",
      isAdmin: false,
    });

    const cell10 = result.cells.find((c) => c.day_of_week === 1 && c.hour === 10);
    const cell11 = result.cells.find((c) => c.day_of_week === 1 && c.hour === 11);
    expect(cell10?.slot_count).toBe(2);
    expect(cell11?.slot_count).toBe(2);
  });
});

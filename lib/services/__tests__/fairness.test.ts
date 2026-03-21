/**
 * Fairness calculation unit tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    historicalOffering: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/config", () => ({
  getConfigWithDefault: vi.fn().mockImplementation((_key: string, def: number) => Promise.resolve(def)),
}));

function timeToDate(hour: number, minute: number): Date {
  return new Date(2000, 0, 1, hour, minute, 0);
}

describe("getFairnessForFaculty", () => {
  it("returns zero when no historical offerings", async () => {
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.historicalOffering.findMany).mockResolvedValue([]);

    const { getFairnessForFaculty } = await import("../fairness");
    const result = await getFairnessForFaculty("f1");

    expect(result.faculty_id).toBe("f1");
    expect(result.busy_minutes).toBe(0);
    expect(result.instructional_minutes).toBe(0);
    expect(result.busy_slot_percentage).toBe(0);
  });

  it("sums instructional minutes from historical offerings", async () => {
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.historicalOffering.findMany).mockResolvedValue([
      {
        startTime: timeToDate(10, 0),
        endTime: timeToDate(11, 30),
      },
      {
        startTime: timeToDate(14, 0),
        endTime: timeToDate(15, 30),
      },
    ] as never);

    const { getFairnessForFaculty } = await import("../fairness");
    const result = await getFairnessForFaculty("f1");

    expect(result.instructional_minutes).toBe(90 + 90);
    expect(result.busy_minutes).toBeGreaterThan(0);
  });
});

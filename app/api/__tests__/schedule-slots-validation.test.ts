/**
 * Integration tests: slot validation failure (422).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    courseOffering: { findUnique: vi.fn() },
    courseTemplate: { findFirst: vi.fn() },
    scheduleVersion: { findUnique: vi.fn() },
    scheduleSlot: { findMany: vi.fn() },
    courseOfferingInstructor: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/scope", () => ({
  getAccessibleProgramIds: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/config", () => ({
  getMaxClassDurationMinutes: vi.fn().mockResolvedValue(180),
  getAllowedStartMinutes: vi.fn().mockResolvedValue([0, 15, 30, 45]),
  getCrowdedSlotThreshold: vi.fn().mockResolvedValue(3),
  getCrowdedPeriodPolicy: vi.fn().mockResolvedValue("warn"),
}));

describe("Slot validation failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 when slot validation fails (invalid start minute)", async () => {
    const { requireRole } = await import("@/lib/auth/middleware");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      payload: { accountId: "acc1", role: "dean", isAdmin: false },
    } as never);

    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    const offeringId = "11111111-1111-1111-1111-111111111111";
    const versionId = "22222222-2222-2222-2222-222222222222";
    const termId = "33333333-3333-3333-3333-333333333333";
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      id: offeringId,
      termId,
      participatesInScheduling: true,
      courseTemplate: { programs: [{ programId: "44444444-4444-4444-4444-444444444444" }] },
      term: { id: termId },
      instructors: [],
    } as never);
    vi.mocked(mockPrisma.courseTemplate.findFirst).mockResolvedValue({} as never);
    vi.mocked(mockPrisma.scheduleVersion.findUnique).mockResolvedValue({
      id: versionId,
      termId,
      mode: "draft",
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);

    const mod = await import("../schedule-slots/route");
    const req = new Request("http://x/api/schedule-slots", {
      method: "POST",
      body: JSON.stringify({
        course_offering_id: offeringId,
        schedule_version_id: versionId,
        day_of_week: 1,
        start_time: "10:17",
        end_time: "11:30",
      }),
    });
    const res = await mod.POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error).toBe("Validation failed");
    expect(json.details?.errors).toBeDefined();
    expect(json.details.errors.some((e: { code: string }) => e.code === "START_MINUTE")).toBe(true);
  });
});

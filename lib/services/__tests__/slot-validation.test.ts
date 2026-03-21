/**
 * Slot validation unit tests.
 * Uses mocked prisma and config.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    courseOffering: { findUnique: vi.fn() },
    courseOfferingInstructor: { findMany: vi.fn() },
    scheduleSlot: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/config", () => ({
  getMaxClassDurationMinutes: vi.fn().mockResolvedValue(180),
  getAllowedStartMinutes: vi.fn().mockResolvedValue([0, 15, 30, 45]),
  getCrowdedSlotThreshold: vi.fn().mockResolvedValue(3),
  getCrowdedPeriodPolicy: vi.fn().mockResolvedValue("warn"),
}));

const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
const mockConfig = await import("@/lib/config");

describe("validateSlotPlacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockConfig.getMaxClassDurationMinutes).mockResolvedValue(180);
    vi.mocked(mockConfig.getAllowedStartMinutes).mockResolvedValue([0, 15, 30, 45]);
    vi.mocked(mockConfig.getCrowdedSlotThreshold).mockResolvedValue(3);
    vi.mocked(mockConfig.getCrowdedPeriodPolicy).mockResolvedValue("warn");
  });

  it("rejects zero or negative duration", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 10, 0, 0);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([]);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CLASS_DURATION")).toBe(true);
  });

  it("rejects duration exceeding max", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 8, 0, 0);
    const end = new Date(2000, 0, 1, 12, 0, 0); // 240 min > 180
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([]);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CLASS_DURATION")).toBe(true);
  });

  it("rejects start minute not in allowed list", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 17, 0); // minute 17 not in [0,15,30,45]
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([]);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "START_MINUTE")).toBe(true);
  });

  it("always rejects same-instructor time overlap (not affected by crowded policy)", async () => {
    vi.mocked(mockConfig.getCrowdedPeriodPolicy).mockResolvedValue("warn");
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([
      { facultyId: "f1" },
    ] as never);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f1" }],
        },
      },
    ] as never);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "FACULTY_CONFLICT")).toBe(true);
  });

  it("rejects faculty time conflict", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([
      { facultyId: "f1" },
    ] as never);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f1" }],
        },
      },
    ] as never);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "FACULTY_CONFLICT")).toBe(true);
  });

  it("uses second-person message when viewer is the conflicting instructor", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([
      { facultyId: "f1" },
    ] as never);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f1" }],
        },
      },
    ] as never);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1", "f1");
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "FACULTY_CONFLICT");
    expect(err?.message).toContain("You are already scheduled");
  });

  it("warns on crowded slot when policy is warn (different instructors)", async () => {
    vi.mocked(mockConfig.getCrowdedPeriodPolicy).mockResolvedValue("warn");
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([
      { facultyId: "f9" },
    ] as never);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f1" }],
        },
      },
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f2" }],
        },
      },
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f3" }],
        },
      },
    ] as never);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off99");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((e) => e.code === "CROWDED_SLOT")).toBe(true);
  });

  it("blocks crowded slot when policy is block", async () => {
    vi.mocked(mockConfig.getCrowdedPeriodPolicy).mockResolvedValue("block");
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([
      { facultyId: "f9" },
    ] as never);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f1" }],
        },
      },
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f2" }],
        },
      },
      {
        dayOfWeek: 1,
        startTime: new Date(2000, 0, 1, 10, 0, 0),
        endTime: new Date(2000, 0, 1, 11, 30, 0),
        courseOffering: {
          participatesInScheduling: true,
          instructors: [{ facultyId: "f3" }],
        },
      },
    ] as never);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off99");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CROWDED_SLOT")).toBe(true);
  });

  it("accepts valid slot when no conflicts", async () => {
    const { validateSlotPlacement } = await import("../slot-validation");
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 30, 0);
    vi.mocked(mockPrisma.scheduleSlot.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.courseOffering.findUnique).mockResolvedValue({
      participatesInScheduling: true,
    } as never);
    vi.mocked(mockPrisma.courseOfferingInstructor.findMany).mockResolvedValue([]);

    const result = await validateSlotPlacement("v1", 1, start, end, undefined, "off1");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

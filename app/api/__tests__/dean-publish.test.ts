/**
 * Integration tests: dean publish.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduleVersion: { findUnique: vi.fn() },
    scheduleSlot: { deleteMany: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    historicalOffering: { deleteMany: vi.fn(), create: vi.fn() },
    scheduleProposal: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}));

describe("Dean publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes draft to official", async () => {
    const { requireRole } = await import("@/lib/auth/middleware");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      payload: { accountId: "acc1", role: "dean", isAdmin: false },
    } as never);

    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.scheduleVersion.findUnique)
      .mockResolvedValueOnce({
        id: "draft1",
        termId: "t1",
        mode: "draft",
        term: { id: "t1", name: "Fall 2024" },
      } as never)
      .mockResolvedValueOnce({
        id: "official1",
        termId: "t1",
        mode: "official",
      } as never);

    vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        scheduleSlot: {
          deleteMany: vi.fn(() => Promise.resolve()),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn((args: { data: { scheduleVersionId: string } }) =>
            Promise.resolve({ id: "slot1", ...args.data })
          ),
        },
        historicalOffering: {
          deleteMany: vi.fn(() => Promise.resolve()),
          create: vi.fn(() => Promise.resolve({})),
        },
        scheduleProposal: {
          findMany: vi.fn().mockResolvedValue([{ id: "p1", termId: "t1", status: "finalized" }]),
          update: vi.fn(() => Promise.resolve({})),
        },
      };
      return fn(tx as never) as never;
    });

    const mod = await import("../schedule-versions/[id]/publish/route");
    const req = new Request("http://x/api/schedule-versions/draft1/publish", {
      method: "POST",
    });
    const res = await mod.POST(req, { params: Promise.resolve({ id: "draft1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("Draft slots copied");
  });
});

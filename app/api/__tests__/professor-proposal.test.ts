/**
 * Integration tests: professor proposal submit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduleProposal: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    term: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireRole: vi.fn(),
}));

describe("Professor proposal submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates proposal when professor submits", async () => {
    const { requireRole } = await import("@/lib/auth/middleware");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      payload: {
        accountId: "acc1",
        role: "professor",
        facultyId: "f1",
        isAdmin: false,
      },
    } as never);

    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.term.findUnique).mockResolvedValue({
      id: "t1",
      name: "Fall 2024",
      semester: "fall",
      academicYear: 2024,
    } as never);
    vi.mocked(mockPrisma.scheduleProposal.findUnique).mockResolvedValue(null);
    vi.mocked(mockPrisma.scheduleProposal.create).mockResolvedValue({
      id: "prop1",
      facultyId: "f1",
      termId: "t1",
      status: "draft",
    } as never);

    const mod = await import("../schedule-proposals/route");
    const req = new Request("http://x/api/schedule-proposals", {
      method: "POST",
      body: JSON.stringify({ term_id: "t1" }),
    });
    const res = await mod.POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("prop1");
    expect(json.status).toBe("draft");
  });
});

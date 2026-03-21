/**
 * Schedule proposal API tests - director self-approval prevention.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduleProposal: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    account: { findUnique: vi.fn() },
    accountProgramAssociation: { findMany: vi.fn() },
    facultyProgramAffiliation: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/scope", () => ({
  getAccessibleProgramIds: vi.fn().mockResolvedValue(["p1"]),
}));

describe("Director self-approval prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when director approves own proposal", async () => {
    const { requireRole } = await import("@/lib/auth/middleware");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      payload: {
        accountId: "acc1",
        role: "director",
        facultyId: "f1",
        isAdmin: false,
      },
    } as never);

    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.scheduleProposal.findUnique).mockResolvedValue({
      id: "prop1",
      facultyId: "f1",
      termId: "t1",
      status: "under_review",
      faculty: { id: "f1", name: "Test", email: "t@t.com" },
    } as never);
    vi.mocked(mockPrisma.account.findUnique).mockResolvedValue({
      id: "acc1",
      facultyId: "f1",
    } as never);
    vi.mocked(mockPrisma.facultyProgramAffiliation.findFirst).mockResolvedValue({} as never);

    const mod = await import("../schedule-proposals/[id]/route");
    const PATCH = mod.PATCH;
    const req = new Request("http://x/api/schedule-proposals/prop1", {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prop1" }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("cannot approve own");
  });

  it("allows director to approve another faculty proposal", async () => {
    const { requireRole } = await import("@/lib/auth/middleware");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      payload: {
        accountId: "acc_director",
        role: "director",
        facultyId: "f_director",
        isAdmin: false,
      },
    } as never);

    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    vi.mocked(mockPrisma.scheduleProposal.findUnique).mockResolvedValue({
      id: "prop2",
      facultyId: "f_prof",
      termId: "t1",
      status: "under_review",
      faculty: { id: "f_prof", name: "Professor", email: "p@t.com", account: { role: "professor" } },
    } as never);
    vi.mocked(mockPrisma.account.findUnique).mockResolvedValue({
      id: "acc_director",
      facultyId: "f_director",
      faculty: { id: "f_director" },
    } as never);
    vi.mocked(mockPrisma.facultyProgramAffiliation.findFirst).mockResolvedValue({} as never);
    vi.mocked(mockPrisma.scheduleProposal.update).mockResolvedValue({
      id: "prop2",
      status: "approved",
    } as never);
    const proposalData = {
      id: "prop2",
      facultyId: "f_prof",
      termId: "t1",
      status: "under_review",
      faculty: { id: "f_prof", name: "Professor", email: "p@t.com", account: { role: "professor" } },
    };
    vi.mocked(mockPrisma.scheduleProposal.findUnique)
      .mockResolvedValueOnce(proposalData as never)
      .mockResolvedValueOnce(proposalData as never)
      .mockResolvedValueOnce({ ...proposalData, status: "approved", term: { id: "t1", name: "Fall 2024" } } as never);

    const mod = await import("../schedule-proposals/[id]/route");
    const req = new Request("http://x/api/schedule-proposals/prop2", {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
    const res = await mod.PATCH(req, { params: Promise.resolve({ id: "prop2" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("approved");
  });
});

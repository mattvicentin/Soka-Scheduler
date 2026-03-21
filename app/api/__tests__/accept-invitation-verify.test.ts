/**
 * Integration tests: invitation accept + verify flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    invitation: { findUnique: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/tokens", () => ({
  hashToken: vi.fn((t: string) => `hash_${t}`),
  generateSecureToken: vi.fn(() => "refresh_plain"),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(() => Promise.resolve("hashed")),
}));

vi.mock("@/lib/auth/verification", () => ({
  createVerificationCode: vi.fn(() => Promise.resolve("123456")),
  verifyCode: vi.fn(),
}));

vi.mock("@/lib/auth/jwt", () => ({
  signToken: vi.fn(() => Promise.resolve("access_token")),
}));

vi.mock("@/lib/auth/cookies", () => ({
  createAuthCookie: vi.fn(() => "auth=xxx"),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
}));

describe("Accept invitation + verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts invitation and creates account", async () => {
    const { hashToken } = await import("@/lib/auth/tokens");
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);

    vi.mocked(mockPrisma.invitation.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash: "hash_tok",
      facultyId: "f1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      faculty: { id: "f1", email: "prof@test.edu", name: "Professor" },
    } as never);
    vi.mocked(mockPrisma.account.findUnique).mockResolvedValue(null);
    vi.mocked(mockPrisma.account.create).mockImplementation(() =>
      Promise.resolve({
        id: "acc1",
        email: "prof@test.edu",
        facultyId: "f1",
        role: "professor",
      } as never)
    );
    vi.mocked(mockPrisma.invitation.update).mockResolvedValue({} as never);

    const { POST } = await import("../auth/accept-invitation/route");
    const req = new Request("http://x/api/auth/accept-invitation", {
      method: "POST",
      body: JSON.stringify({
        token: "tok",
        email: "prof@test.edu",
        password: "Secret123!",
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toContain("verification code");
    expect(json.account_id).toBe("acc1");
    expect(hashToken).toHaveBeenCalledWith("tok");
  });

  it("verify-code returns tokens on valid code", async () => {
    const mockPrisma = await import("@/lib/db/client").then((m) => m.prisma);
    const { verifyCode } = await import("@/lib/auth/verification");

    vi.mocked(mockPrisma.account.findUnique).mockResolvedValue({
      id: "acc1",
      email: "prof@test.edu",
      facultyId: "f1",
      role: "professor",
      faculty: { id: "f1", name: "Professor" },
    } as never);
    vi.mocked(verifyCode).mockResolvedValue({ ok: true });
    vi.mocked(mockPrisma.refreshToken.create).mockResolvedValue({} as never);

    const { POST } = await import("../auth/verify-code/route");
    const req = new Request("http://x/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({
        email: "prof@test.edu",
        code: "123456",
        purpose: "account_setup",
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.access_token).toBe("access_token");
    expect(json.refresh_token).toBe("refresh_plain");
  });
});

import * as jose from "jose";
import type { AccountRole } from "@prisma/client";

export interface JwtPayload {
  accountId: string;
  email: string;
  role: AccountRole;
  facultyId: string | null;
  isAdmin: boolean;
  exp: number;
  iat: number;
}

const ALG = "HS256";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: Omit<JwtPayload, "exp" | "iat">): Promise<string> {
  const secret = getSecret();
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const secret = getSecret();
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}

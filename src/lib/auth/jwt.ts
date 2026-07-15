import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';

export interface SessionPayload {
  userId: string;
  role: Role;
  organizationId: string;
  branchId: string | null;
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);
const ACCESS_TTL_MIN = Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 15);

export async function signAccessToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_MIN}m`)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as string,
      role: payload.role as Role,
      organizationId: payload.organizationId as string,
      branchId: (payload.branchId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

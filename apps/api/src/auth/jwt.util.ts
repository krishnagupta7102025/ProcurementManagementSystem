import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '../generated/prisma/enums.js';

const TOKEN_TTL = '12h';

export interface SessionClaims {
  sub: string;
  orgId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_JWT_SECRET is not set — required to sign/verify login sessions. Set it in .env (any long random string; rotating it invalidates every existing session).',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, getSecretKey());
  return {
    sub: payload.sub as string,
    orgId: payload.orgId as string,
    email: payload.email as string,
    displayName: payload.displayName as string,
    roles: payload.roles as Role[],
  };
}

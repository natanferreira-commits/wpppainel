// JWT helpers usando `jose` (edge-compatible, funciona em Vercel Functions
// e Edge Runtime). Substitui o @nestjs/jwt da versão NestJS.

import { SignJWT, jwtVerify } from 'jose';

export type JwtPayload = {
  sub: string; // user id
  email: string;
  role: string;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não configurado');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// Helper: extrai user do header Authorization de uma Request
export async function getUserFromRequest(req: Request): Promise<JwtPayload | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  return verifyToken(token);
}

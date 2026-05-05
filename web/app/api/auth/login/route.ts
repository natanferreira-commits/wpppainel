import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { fromZodError } from '../../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/auth/login
// Auth fake: aceita qualquer email + senha em dev.
// Cria user OPERATOR se não existe e retorna JWT.
// Round 3 vira auth real com bcrypt.

const LoginSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const { email, name } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name ?? normalizedEmail.split('@')[0],
        role: 'OPERATOR',
      },
    });
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

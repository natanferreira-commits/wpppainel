import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { errorResponse, fromZodError } from '../../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/auth/login
// Login real com username/email + senha (bcrypt).
//
// Aceita o "username" sendo username puro (TimeArena) OU email.
// Busca user por OR de ambos os campos pra ser flexível.

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const { username, password } = parsed.data;
  const normalized = username.trim();

  const user = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [
        { username: normalized },
        { email: normalized.toLowerCase() },
      ],
    },
  });

  // Resposta unificada pra evitar leak de "user existe vs senha errada"
  const invalid = () =>
    errorResponse('Usuário ou senha inválidos', 401);

  if (!user || !user.passwordHash) return invalid();

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return invalid();

  const token = await signToken({
    sub: user.id,
    email: user.email ?? user.username ?? '',
    role: user.role,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

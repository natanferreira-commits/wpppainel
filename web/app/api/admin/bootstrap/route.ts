import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/bootstrap?token=SEED_TOKEN&username=TimeArena&password=...
//
// Bootstrap pro setup inicial:
//   - Cria User principal com username + senha real (bcrypt)
//   - Apaga users antigos sem senha (legado dev mode)
//   - Cria 1 Instance vazia "Mateus Caumo Tips" id=inst_caumo_seed
//
// Idempotente: pode rodar várias vezes (upsert + reset de senha).
//
// Defaults se não passar query params:
//   username = TimeArena
//   password = Arena2026 (TROCA depois pelo painel ou re-rodando o bootstrap
//             com novo password)

const DEFAULT_USERNAME = 'TimeArena';
const DEFAULT_PASSWORD = 'Arena2026';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.SEED_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { message: 'SEED_TOKEN não configurado' },
      { status: 500 },
    );
  }
  if (token !== expected) {
    return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
  }

  const username =
    req.nextUrl.searchParams.get('username')?.trim() || DEFAULT_USERNAME;
  const password =
    req.nextUrl.searchParams.get('password') || DEFAULT_PASSWORD;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // Desativa users legacy (sem username + sem senha) sem deletar
    // — eles têm Message.createdById apontando, FK constraint
    // se tentar delete. Inactive=true bloqueia login.
    const cleanup = await prisma.user.updateMany({
      where: {
        username: null,
        passwordHash: null,
        active: true,
      },
      data: { active: false },
    });

    // Upsert do user principal (nome ADMIN sempre)
    const user = await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash,
        active: true,
        role: 'ADMIN',
      },
      create: {
        username,
        name: username,
        passwordHash,
        role: 'ADMIN',
        active: true,
      },
    });

    // Instance vazia (será preenchida pelo /sync com Z-API)
    const instance = await prisma.instance.upsert({
      where: { id: 'inst_caumo_seed' },
      update: {},
      create: {
        id: 'inst_caumo_seed',
        name: 'Mateus Caumo Tips',
        phoneNumber: null,
        status: 'PENDING_QR',
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Bootstrap pronto',
      created: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
        instance: { id: instance.id, name: instance.name },
        deactivatedLegacyUsers: cleanup.count,
      },
      credentials: {
        username,
        password,
        warning:
          'Guarde essa senha — não vai aparecer de novo em rodadas futuras (use ?password= pra trocar).',
      },
      nextStep: `POST /api/instances/${instance.id}/sync`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Erro no bootstrap',
      },
      { status: 500 },
    );
  }
}

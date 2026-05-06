import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/bootstrap?token=SEED_TOKEN
//
// Bootstrap minimalista pra primeira vez (ou após reset de banco):
//   - Cria 2 Users (natan admin, tipster operator)
//   - Cria 1 Instance vazia "Mateus Caumo Tips" com id=inst_caumo_seed
//
// NÃO cria Community/Group fake — esses vêm do /sync da Z-API depois.
//
// Idempotente: usa upsert, pode rodar várias vezes.

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

  try {
    const admin = await prisma.user.upsert({
      where: { email: 'natan@grupodupla.com.br' },
      update: {},
      create: {
        email: 'natan@grupodupla.com.br',
        name: 'Natan Puggian',
        role: 'ADMIN',
      },
    });

    const tipster = await prisma.user.upsert({
      where: { email: 'tipster@grupodupla.com.br' },
      update: {},
      create: {
        email: 'tipster@grupodupla.com.br',
        name: 'Tipster Caumo',
        role: 'OPERATOR',
      },
    });

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
      message: 'Bootstrap pronto. Agora rode /sync pra puxar dados reais da Z-API.',
      created: {
        users: [admin.email, tipster.email],
        instance: { id: instance.id, name: instance.name },
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

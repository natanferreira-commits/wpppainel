import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { seedDatabase } from '@/lib/seed';

export const dynamic = 'force-dynamic';

// GET /api/admin/seed?token=SEED_TOKEN
// Popula o banco com dados de demonstração. Idempotente — pode rodar
// várias vezes (upserts limpam métricas/eventos antes de recriar).
//
// Uso em prod: bater 1x na URL após primeiro deploy pra popular Postgres.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.SEED_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { message: 'SEED_TOKEN não configurado nas env vars do projeto' },
      { status: 500 },
    );
  }

  if (token !== expected) {
    return NextResponse.json(
      { message: 'Token inválido. Inclua ?token=... na URL com o valor da env var SEED_TOKEN.' },
      { status: 401 },
    );
  }

  try {
    const summary = await seedDatabase(prisma);
    return NextResponse.json({
      ok: true,
      message: 'Banco populado com sucesso',
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Erro desconhecido no seed',
      },
      { status: 500 },
    );
  }
}

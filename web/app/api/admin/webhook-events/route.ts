import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/webhook-events?token=SEED_TOKEN&limit=50&filter=JOIN|LEFT|IGNORED
//
// Lista os últimos webhook events brutos pra debug.
// Usar pra descobrir formato real dos eventos da Z-API quando o
// painel não tá detectando JOIN/LEFT direito.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
  const filter = req.nextUrl.searchParams.get('filter');

  const events = await prisma.webhookEvent.findMany({
    where: filter ? { processedAs: filter } : undefined,
    orderBy: { receivedAt: 'desc' },
    take: Math.min(limit, 200),
  });

  // Conta por classificação
  const groups = await prisma.webhookEvent.groupBy({
    by: ['processedAs'],
    _count: true,
  });

  const stats: Record<string, number> = {};
  for (const g of groups) {
    stats[g.processedAs ?? 'NULL'] = g._count;
  }

  return NextResponse.json({
    stats,
    events: events.map((e) => ({
      id: e.id,
      receivedAt: e.receivedAt,
      eventType: e.eventType,
      processedAs: e.processedAs,
      errorMsg: e.errorMsg,
      payload: tryParse(e.payload),
    })),
  });
}

function tryParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

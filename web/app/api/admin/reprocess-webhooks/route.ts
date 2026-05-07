import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tryHandleGroupNotification } from '../../webhooks/zapi/route';

export const dynamic = 'force-dynamic';

// GET /api/admin/reprocess-webhooks?token=SEED_TOKEN
//
// Reprocessa WebhookEvents antigos que foram classificados errado
// (STATUS quando eram JOIN/LEFT) — recupera entradas/saídas perdidas.
//
// Idempotente: tryHandleGroupNotification dedupe via janela de 5s.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
  }

  // Pega webhooks que possam ser group notifications mas foram
  // classificados como outra coisa
  const candidates = await prisma.webhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 500,
  });

  const stats = {
    inspected: 0,
    reclassifiedAsJoin: 0,
    reclassifiedAsLeft: 0,
    skipped: 0,
  };

  for (const event of candidates) {
    stats.inspected++;
    let body: any;
    try {
      body = JSON.parse(event.payload);
    } catch {
      stats.skipped++;
      continue;
    }

    const result = await tryHandleGroupNotification(body);
    if (result === 'JOIN') {
      stats.reclassifiedAsJoin++;
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAs: 'JOIN' },
      });
    } else if (result === 'LEFT') {
      stats.reclassifiedAsLeft++;
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAs: 'LEFT' },
      });
    } else {
      stats.skipped++;
    }
  }

  return NextResponse.json({ ok: true, stats });
}

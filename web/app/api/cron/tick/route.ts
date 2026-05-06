import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getZapiClient } from '@/lib/zapi';
import { dispatchMessage } from '@/lib/sender';

export const dynamic = 'force-dynamic';

// GET /api/cron/tick?token=CRON_TOKEN
// Worker que processa a fila de mensagens SCHEDULED.
//
// Configurar cron externo (cron-job.org ou GitHub Actions) batendo
// a cada 1-5min:
//   GET https://SEU-DOMINIO.vercel.app/api/cron/tick?token=CRON_TOKEN

const MAX_BATCH = 10;

export async function GET(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  const expected = process.env.CRON_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { message: 'CRON_TOKEN não configurado nas env vars' },
      { status: 500 },
    );
  }
  if (token !== expected) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const stats = { picked: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };

  const candidates = await prisma.message.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: now },
    },
    take: MAX_BATCH,
    orderBy: { scheduledFor: 'asc' },
    include: { targets: { include: { group: true } } },
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, processedAt: now.toISOString(), stats });
  }

  let zapi;
  try {
    zapi = getZapiClient();
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'Z-API não configurada' },
      { status: 500 },
    );
  }

  for (const msg of candidates) {
    const outcome = await dispatchMessage(prisma, zapi, msg);
    if (outcome.status === 'SKIPPED') stats.skipped++;
    else if (outcome.status === 'SENT') {
      stats.picked++;
      stats.sent++;
    } else {
      stats.picked++;
      // Re-busca status final pra distinguir FAILED vs retornou pra SCHEDULED (retry)
      const final = await prisma.message.findUnique({ where: { id: msg.id } });
      if (final?.status === 'FAILED') stats.failed++;
      else stats.retried++;
    }
  }

  return NextResponse.json({ ok: true, processedAt: now.toISOString(), stats });
}

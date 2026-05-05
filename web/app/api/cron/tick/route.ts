import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getZapiClient, ZapiError } from '@/lib/zapi';

export const dynamic = 'force-dynamic';

// GET /api/cron/tick?token=CRON_TOKEN
// Worker que processa a fila de mensagens SCHEDULED.
//
// Idempotência (CAS pattern):
//   1. Pega mensagens SCHEDULED com scheduledFor <= now
//   2. UPDATE WHERE id=? AND status='SCHEDULED' SET status='SENDING'
//      → se affectedRows = 0, outro worker pegou, skip
//   3. Chama Z-API send-text/send-image
//   4. Em sucesso: UPDATE SET status='SENT', sentAt=now, zapiMessageId=...
//   5. Em erro: incrementa attemptCount; se >= MAX, marca FAILED
//
// Configurar cron externo (cron-job.org gratuito) batendo a cada 1min:
//   GET https://SEU-DOMINIO.vercel.app/api/cron/tick?token=CRON_TOKEN

const MAX_BATCH = 10; // processa até 10 mensagens por tick
const MAX_ATTEMPTS = 3;

export async function GET(req: NextRequest) {
  // Auth via token (query string ou Authorization: Bearer)
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
  const stats = {
    picked: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
  };

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

  // Inicializa client Z-API uma vez (reuse pra todas mensagens do batch)
  let zapi;
  try {
    zapi = getZapiClient();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Z-API não configurada',
      },
      { status: 500 },
    );
  }

  for (const msg of candidates) {
    // CAS: tenta marcar como SENDING. Se outro worker já pegou, count=0
    const idempotencyKey = randomUUID();
    const claim = await prisma.message.updateMany({
      where: { id: msg.id, status: 'SCHEDULED' },
      data: {
        status: 'SENDING',
        idempotencyKey,
        attemptCount: { increment: 1 },
      },
    });

    if (claim.count === 0) {
      stats.skipped++;
      continue;
    }
    stats.picked++;

    try {
      const targetZapiIds: string[] = [];
      for (const target of msg.targets) {
        const phone = target.group.whatsappId;
        const resp = msg.imageUrl
          ? await zapi.sendImage(phone, msg.imageUrl, msg.content)
          : await zapi.sendText(phone, msg.content);

        const zapiId = resp.messageId ?? resp.zaapId ?? resp.id ?? null;

        await prisma.messageTarget.update({
          where: { id: target.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            zapiMessageId: zapiId,
          },
        });
        if (zapiId) targetZapiIds.push(zapiId);
      }

      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          zapiMessageId: targetZapiIds[0] ?? null,
          lastError: null,
        },
      });
      stats.sent++;
    } catch (err) {
      const errMsg =
        err instanceof ZapiError
          ? `Z-API ${err.status}: ${err.body}`
          : err instanceof Error
            ? err.message
            : String(err);

      const willGiveUp = msg.attemptCount + 1 >= MAX_ATTEMPTS;
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: willGiveUp ? 'FAILED' : 'SCHEDULED',
          lastError: errMsg.slice(0, 500),
        },
      });

      if (willGiveUp) stats.failed++;
      else stats.retried++;
    }
  }

  return NextResponse.json({ ok: true, processedAt: now.toISOString(), stats });
}

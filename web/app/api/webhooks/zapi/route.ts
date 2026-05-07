import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  tryHandleGroupNotification,
  handleMessageStatus,
  handleConnectionChange,
} from '@/lib/webhook-handlers';

export const dynamic = 'force-dynamic';

// POST /api/webhooks/zapi
// Recebe eventos da Z-API. SEMPRE retorna 200.

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  let logId: string | null = null;
  try {
    const log = await prisma.webhookEvent.create({
      data: {
        eventType: body.type ?? body.event ?? 'unknown',
        payload: JSON.stringify(body).slice(0, 5000),
      },
    });
    logId = log.id;
  } catch (err) {
    console.error('[zapi webhook] failed to log:', err);
  }

  let processedAs: string | null = null;
  let errorMsg: string | null = null;

  try {
    const eventType: string = body.type ?? body.event ?? '';
    const notification: string = (body.notification ?? '').toString();

    // 1ª: notification de grupo (entrada/saída)
    if (
      notification &&
      /GROUP_PARTICIPANT|JOIN|LEAVE|REMOVE|ADD|INVITE/i.test(notification)
    ) {
      const result = await tryHandleGroupNotification(body);
      processedAs = result ?? 'IGNORED';
    }
    // 2ª: connect/disconnect
    else if (eventType === 'DisconnectedCallback' || body.disconnected === true) {
      await handleConnectionChange(body, 'DISCONNECTED');
      processedAs = 'CONNECTION';
    } else if (eventType === 'ConnectedCallback' || body.connected === true) {
      await handleConnectionChange(body, 'CONNECTED');
      processedAs = 'CONNECTION';
    }
    // 3ª: status de mensagem
    else if (
      eventType === 'MessageStatusCallback' ||
      eventType === 'DeliveryCallback' ||
      (typeof body.status === 'string' && (body.ids || body.messageId))
    ) {
      await handleMessageStatus(body);
      processedAs = 'STATUS';
    } else {
      processedAs = 'IGNORED';
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[zapi webhook] error:', err);
  }

  if (logId) {
    try {
      await prisma.webhookEvent.update({
        where: { id: logId },
        data: { processedAs, errorMsg },
      });
    } catch {
      // não fatal
    }
  }

  return NextResponse.json({ ok: true, processedAs });
}

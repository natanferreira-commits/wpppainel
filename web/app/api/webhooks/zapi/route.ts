import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/webhooks/zapi
// Recebe eventos da Z-API. Configurar URL no painel Z-API → Webhooks.
//
// Eventos relevantes pro painel:
//  - MessageStatusCallback / status="delivered"|"read"  → atualiza target status
//  - DisconnectedCallback                                → marca instance DISCONNECTED
//  - ConnectedCallback                                   → marca instance CONNECTED
//  - ReceivedCallback com notification (group_notif)     → entrada/saída de membro
//
// IMPORTANTE: Z-API NÃO retenta se a gente devolver erro. Sempre 200,
// loga erros internamente.
//
// Schema dos eventos varia por versão da Z-API. Esse handler usa heurísticas
// defensivas — quando o webhook real chegar, calibramos com os dados reais.

const phoneHash = (phone: string) =>
  createHash('sha256').update(phone).digest('hex').slice(0, 16);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // Log estruturado pra investigar formato real assim que chegarem eventos
  console.log(
    '[zapi webhook]',
    body.type ?? body.event ?? 'unknown',
    JSON.stringify(body).slice(0, 400),
  );

  const eventType: string = body.type ?? body.event ?? '';

  try {
    if (
      eventType === 'MessageStatusCallback' ||
      (typeof body.status === 'string' && body.ids)
    ) {
      await handleMessageStatus(body);
    } else if (eventType === 'DisconnectedCallback' || body.disconnected === true) {
      await handleConnectionChange(body, 'DISCONNECTED');
    } else if (eventType === 'ConnectedCallback' || body.connected === true) {
      await handleConnectionChange(body, 'CONNECTED');
    } else if (body.isGroup && (body.notification || body.notificationParameters)) {
      await handleGroupNotification(body);
    }
  } catch (err) {
    console.error('[zapi webhook] error:', err);
    // não retorna erro pra Z-API não retentar
  }

  return NextResponse.json({ ok: true });
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleMessageStatus(body: any) {
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids
    : body.messageId
      ? [body.messageId]
      : body.zaapId
        ? [body.zaapId]
        : [];

  if (ids.length === 0) return;

  // Z-API status: SENT | DELIVERED | READ | PLAYED | FAILED
  const newStatus = body.status?.toUpperCase();

  // Atualiza os targets que tenham esse zapiMessageId. Por enquanto,
  // só registramos delivered/read não muda status do nosso modelo.
  // Em FAILED, marca target como FAILED.
  if (newStatus === 'FAILED') {
    await prisma.messageTarget.updateMany({
      where: { zapiMessageId: { in: ids } },
      data: { status: 'FAILED', lastError: 'Z-API: failed status callback' },
    });
  }
}

async function handleConnectionChange(body: any, status: 'CONNECTED' | 'DISCONNECTED') {
  const zapiInstanceId: string | undefined = body.instanceId;
  if (!zapiInstanceId) return;

  await prisma.instance.updateMany({
    where: { zapiInstanceId },
    data: {
      status,
      lastConnectedAt: status === 'CONNECTED' ? new Date() : undefined,
    },
  });
}

async function handleGroupNotification(body: any) {
  // Heurística — Z-API expõe notification types como subtype/text
  const notifText = (
    body.notification ??
    body.notificationParameters ??
    body.text ??
    ''
  ).toString();

  const isLeft = /removed|left|saiu|leave/i.test(notifText);
  const isJoin = /added|joined|entrou|join/i.test(notifText);
  if (!isLeft && !isJoin) return;

  const affectedPhone: string | undefined =
    body.participantPhone ??
    body.notificationPhone ??
    body.fromMe === false
      ? body.phone
      : undefined;
  if (!affectedPhone) return;

  const groupWhatsappId: string | undefined =
    body.chatId ?? body.groupId ?? body.phone;
  if (!groupWhatsappId) return;

  // Localiza grupo no DB
  const group = await prisma.group.findFirst({
    where: { whatsappId: groupWhatsappId },
    include: { community: true },
  });
  if (!group?.communityId) return;

  // Atribui última mensagem SENT da comunidade nas últimas 60min
  // (correlação tip ↔ saída → "queimadora")
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const lastMessage = await prisma.message.findFirst({
    where: {
      communityId: group.communityId,
      status: 'SENT',
      sentAt: { gte: oneHourAgo },
    },
    orderBy: { sentAt: 'desc' },
  });

  await prisma.memberEvent.create({
    data: {
      communityId: group.communityId,
      groupId: group.id,
      type: isLeft ? 'LEFT' : 'JOIN',
      phoneHash: phoneHash(affectedPhone),
      messageId: lastMessage?.id,
      occurredAt: new Date(),
    },
  });
}

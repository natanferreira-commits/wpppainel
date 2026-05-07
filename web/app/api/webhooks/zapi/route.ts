import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/webhooks/zapi
// Recebe eventos da Z-API. SEMPRE retorna 200 (Z-API não retenta).

const phoneHash = (phone: string) =>
  createHash('sha256').update(phone).digest('hex').slice(0, 16);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // 1) Salva log bruto SEMPRE
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

  // 2) Classifica e processa — ORDEM IMPORTA:
  //    notification de grupo PRIMEIRO (porque ReceivedCallback de
  //    notification tem body.status mas não é status de mensagem nossa)
  let processedAs: string | null = null;
  let errorMsg: string | null = null;

  try {
    const eventType: string = body.type ?? body.event ?? '';
    const notification: string = (body.notification ?? '').toString();

    // 1ª prioridade: notification de grupo (entrada/saída de membro)
    if (
      notification &&
      /GROUP_PARTICIPANT|notification|LEAVE|JOIN|REMOVE|ADD|INVITE/i.test(notification)
    ) {
      const result = await tryHandleGroupNotification(body);
      processedAs = result ?? 'IGNORED';
    }
    // 2ª: conexão / desconexão
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
  const newStatus = body.status?.toUpperCase();
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

/**
 * Tenta detectar e processar eventos de entrada/saída em grupo.
 * Z-API ReceivedCallback com notification do tipo GROUP_PARTICIPANT_*:
 *   - GROUP_PARTICIPANT_INVITE / ADD  → JOIN
 *   - GROUP_PARTICIPANT_LEAVE / REMOVE → LEFT
 *   - GROUP_PARTICIPANT_PROMOTE / DEMOTE → ignorados (admin role change)
 */
export async function tryHandleGroupNotification(body: any): Promise<string | null> {
  const notif = (body.notification ?? '').toString().toUpperCase();
  if (!notif) return null;

  const isJoin = /(GROUP_PARTICIPANT_INVITE|GROUP_PARTICIPANT_ADD|JOINED?|ENTROU|ADICIONADO|NEW_MEMBER)/i.test(
    notif,
  );
  const isLeft = /(GROUP_PARTICIPANT_LEAVE|GROUP_PARTICIPANT_REMOVE|REMOVED?|LEFT|SAIU|EXPULSO|KICKED)/i.test(
    notif,
  );

  if (!isJoin && !isLeft) return null;

  // Membro afetado vem em notificationParameters (array) na Z-API:
  //   "notificationParameters": ["5511999999999@c.us"]
  // ou em participantPhone, author, etc
  const params = body.notificationParameters;
  let affectedPhone: string | undefined;
  if (Array.isArray(params) && params.length > 0) {
    affectedPhone = String(params[0]).replace(/@c\.us$|@s\.whatsapp\.net$/i, '');
  }
  affectedPhone =
    affectedPhone ??
    body.participantPhone ??
    body.notificationPhone ??
    body.author;

  if (!affectedPhone) return null;

  // Identificação do grupo
  const groupWhatsappId: string | undefined =
    body.chatId ?? body.groupId ?? body.groupPhone ?? body.phone;
  if (!groupWhatsappId) return null;

  const group = await prisma.group.findFirst({
    where: { whatsappId: groupWhatsappId },
    include: { community: true },
  });
  if (!group?.communityId) return null;

  // Atribui última mensagem SENT da comunidade nas últimas 60min
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const lastMessage = await prisma.message.findFirst({
    where: {
      communityId: group.communityId,
      status: 'SENT',
      sentAt: { gte: oneHourAgo },
    },
    orderBy: { sentAt: 'desc' },
  });

  // Idempotência: evita duplicar se reprocessar o mesmo webhook
  const occurredAt = body.momment
    ? new Date(body.momment)
    : body.timestamp
      ? new Date(typeof body.timestamp === 'number' ? body.timestamp * 1000 : body.timestamp)
      : new Date();

  const phash = phoneHash(affectedPhone);
  const existing = await prisma.memberEvent.findFirst({
    where: {
      communityId: group.communityId,
      groupId: group.id,
      type: isLeft ? 'LEFT' : 'JOIN',
      phoneHash: phash,
      occurredAt: {
        gte: new Date(occurredAt.getTime() - 5000),
        lte: new Date(occurredAt.getTime() + 5000),
      },
    },
  });

  if (!existing) {
    await prisma.memberEvent.create({
      data: {
        communityId: group.communityId,
        groupId: group.id,
        type: isLeft ? 'LEFT' : 'JOIN',
        phoneHash: phash,
        messageId: lastMessage?.id,
        occurredAt,
      },
    });
  }

  return isLeft ? 'LEFT' : 'JOIN';
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/webhooks/zapi
// Recebe eventos da Z-API. SEMPRE retorna 200 (Z-API não retenta).
//
// Estratégia:
//   1. Loga TUDO em WebhookEvent (debug + audit)
//   2. Tenta classificar e processar
//   3. Marca processedAs no WebhookEvent

const phoneHash = (phone: string) =>
  createHash('sha256').update(phone).digest('hex').slice(0, 16);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // 1) Salva log bruto SEMPRE (mesmo se errar processamento)
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

  // 2) Classifica e processa
  let processedAs: string | null = null;
  let errorMsg: string | null = null;

  try {
    const eventType: string = body.type ?? body.event ?? '';

    // Eventos de status de mensagem (delivered/read/failed)
    if (
      eventType === 'MessageStatusCallback' ||
      eventType === 'DeliveryCallback' ||
      (typeof body.status === 'string' && (body.ids || body.messageId))
    ) {
      await handleMessageStatus(body);
      processedAs = 'STATUS';
    }
    // Conexão / desconexão
    else if (eventType === 'DisconnectedCallback' || body.disconnected === true) {
      await handleConnectionChange(body, 'DISCONNECTED');
      processedAs = 'CONNECTION';
    } else if (eventType === 'ConnectedCallback' || body.connected === true) {
      await handleConnectionChange(body, 'CONNECTED');
      processedAs = 'CONNECTION';
    }
    // Notification de grupo (entrada/saída de membro)
    else {
      const result = await tryHandleGroupNotification(body);
      if (result) processedAs = result;
      else processedAs = 'IGNORED';
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[zapi webhook] error:', err);
  }

  // 3) Atualiza log com resultado
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
 * Retorna 'JOIN' | 'LEFT' | null se não conseguir classificar.
 */
async function tryHandleGroupNotification(body: any): Promise<string | null> {
  // Junta todos os campos textuais que podem indicar tipo do evento
  const candidates = [
    body.notification,
    body.notificationType,
    body.notificationParameters,
    body.subtype,
    body.messageType,
    body.event,
    body.type,
    body.text,
    body.message?.text,
    body.text?.message,
  ];

  const combined = candidates
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();

  if (!combined && !body.isGroup) return null;

  // Regex bem permissivo — cobre variações de nomenclatura da Z-API e do
  // próprio WhatsApp (pt/en, system messages, group_notif types)
  const leftPatterns = /\b(removed?|left|leave|saiu|removido|exit|kicked|expulsou|expelled|left_group|removed_from_group)\b/;
  const joinPatterns = /\b(added?|join(ed)?|entrou|adicionado|added_to_group|invited|invite|joined_group|new_member)\b/;

  const isLeft = leftPatterns.test(combined);
  const isJoin = joinPatterns.test(combined);

  if (!isLeft && !isJoin) return null;

  // Identificação do membro afetado — varia muito entre versões
  const affectedPhone: string | undefined =
    body.participantPhone ??
    body.notificationPhone ??
    body.author ??
    (body.fromMe === false ? body.phone : undefined);

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

  return isLeft ? 'LEFT' : 'JOIN';
}

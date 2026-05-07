// Handlers extraídos do webhook route pra serem reutilizáveis
// (ex: pelo endpoint de reprocess). Route handlers do Next.js não
// permitem exports arbitrários, então separamos aqui.

import { createHash } from 'crypto';
import { prisma } from './prisma';

const phoneHash = (phone: string) =>
  createHash('sha256').update(phone).digest('hex').slice(0, 16);

/**
 * Tenta detectar e processar evento de entrada/saída em grupo.
 * Z-API ReceivedCallback com notification do tipo GROUP_PARTICIPANT_*:
 *   - GROUP_PARTICIPANT_INVITE / ADD  → JOIN
 *   - GROUP_PARTICIPANT_LEAVE / REMOVE → LEFT
 *   - GROUP_PARTICIPANT_PROMOTE / DEMOTE → ignorados
 *
 * Retorna 'JOIN' | 'LEFT' | null se não conseguir classificar.
 */
export async function tryHandleGroupNotification(
  body: any,
): Promise<'JOIN' | 'LEFT' | null> {
  const notif = (body.notification ?? '').toString().toUpperCase();
  if (!notif) return null;

  const isJoin = /(GROUP_PARTICIPANT_INVITE|GROUP_PARTICIPANT_ADD|JOINED?|ENTROU|ADICIONADO|NEW_MEMBER)/i.test(
    notif,
  );
  const isLeft = /(GROUP_PARTICIPANT_LEAVE|GROUP_PARTICIPANT_REMOVE|REMOVED?|LEFT|SAIU|EXPULSO|KICKED)/i.test(
    notif,
  );
  if (!isJoin && !isLeft) return null;

  // Membro afetado vem em notificationParameters (array Z-API):
  //   ["5511999999999@c.us"]  ou  ["5511999999999@s.whatsapp.net"]
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

  const groupWhatsappId: string | undefined =
    body.chatId ?? body.groupId ?? body.groupPhone ?? body.phone;
  if (!groupWhatsappId) return null;

  const group = await prisma.group.findFirst({
    where: { whatsappId: groupWhatsappId },
    include: { community: true },
  });
  if (!group?.communityId) return null;

  // Atribui última msg SENT da comunidade nas últimas 60min
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const lastMessage = await prisma.message.findFirst({
    where: {
      communityId: group.communityId,
      status: 'SENT',
      sentAt: { gte: oneHourAgo },
    },
    orderBy: { sentAt: 'desc' },
  });

  // Timestamp do evento (usa o que vier no body, fallback now)
  const occurredAt = body.momment
    ? new Date(body.momment)
    : body.timestamp
      ? new Date(
          typeof body.timestamp === 'number' ? body.timestamp * 1000 : body.timestamp,
        )
      : new Date();

  const phash = phoneHash(affectedPhone);

  // Idempotência: dedupe por janela de 5s + (community,group,type,phoneHash)
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

    // Bump membersCount em tempo real. Sem isso o card de Insights só
    // atualiza no daily-snapshot (1x/dia) ou no sync manual.
    // Reconcile periódico (/api/cron/reconcile-members) corrige drift
    // caso algum webhook tenha falhado.
    const delta = isLeft ? -1 : 1;
    try {
      await prisma.community.update({
        where: { id: group.communityId },
        data: { membersCount: { increment: delta } },
      });
      // Também atualiza o canal de anúncios (que é a fonte de verdade
      // do número de membros — comunidade WhatsApp = canal de anúncios)
      if (group.isAnnouncementChannel) {
        await prisma.group.update({
          where: { id: group.id },
          data: { membersCount: { increment: delta } },
        });
      }
    } catch (err) {
      // Se falhar (community.membersCount null, p.ex.), não derruba o
      // webhook. Reconcile vai consertar na próxima janela.
      console.error('[webhook] failed to bump membersCount:', err);
    }
  }

  return isLeft ? 'LEFT' : 'JOIN';
}

export async function handleMessageStatus(body: any) {
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

export async function handleConnectionChange(
  body: any,
  status: 'CONNECTED' | 'DISCONNECTED',
) {
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

// Lógica de envio de mensagem via Z-API.
// Reutilizável por:
//  - POST /api/messages (envio "agora" = síncrono na request do user)
//  - GET /api/cron/tick (worker que processa fila SCHEDULED)
//
// Idempotência: claim CAS-pattern antes de chamar Z-API (UPDATE WHERE
// status IN allowedFromStatuses SET status='SENDING'). Se 0 linhas
// afetadas, outro worker já pegou.

import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ZapiClient, ZapiError } from './zapi';

export type DispatchOutcome =
  | { status: 'SENT'; zapiMessageId: string | null }
  | { status: 'FAILED'; error: string }
  | { status: 'SKIPPED'; reason: 'already_claimed' };

type MessageWithTargets = Prisma.MessageGetPayload<{
  include: { targets: { include: { group: true } } };
}>;

const MAX_ATTEMPTS = 3;

/**
 * Tenta despachar UMA mensagem.
 *
 * @param fromStatus Status atual esperado pra claim. Pra worker = 'SCHEDULED'.
 *                   Pra envio direto = 'SCHEDULED' também (o POST /messages
 *                   sempre cria SCHEDULED primeiro pra unificar fluxo).
 */
export async function dispatchMessage(
  prisma: PrismaClient,
  zapi: ZapiClient,
  message: MessageWithTargets,
  fromStatus: 'SCHEDULED' = 'SCHEDULED',
): Promise<DispatchOutcome> {
  // CAS: tenta marcar como SENDING. Se 0 linhas afetadas, outro worker
  // pegou (ou o status mudou).
  const idempotencyKey = randomUUID();
  const claim = await prisma.message.updateMany({
    where: { id: message.id, status: fromStatus },
    data: {
      status: 'SENDING',
      idempotencyKey,
      attemptCount: { increment: 1 },
    },
  });

  if (claim.count === 0) {
    return { status: 'SKIPPED', reason: 'already_claimed' };
  }

  // Tenta enviar pra cada target via Z-API
  try {
    const targetZapiIds: string[] = [];
    for (const target of message.targets) {
      const phone = target.group.whatsappId;
      const resp = message.imageUrl
        ? await zapi.sendImage(phone, message.imageUrl, message.content)
        : await zapi.sendText(phone, message.content);

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
      where: { id: message.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        zapiMessageId: targetZapiIds[0] ?? null,
        lastError: null,
      },
    });

    return { status: 'SENT', zapiMessageId: targetZapiIds[0] ?? null };
  } catch (err) {
    const errMsg =
      err instanceof ZapiError
        ? `Z-API ${err.status}: ${err.body}`
        : err instanceof Error
          ? err.message
          : String(err);

    // Re-lê a mensagem pra pegar attemptCount atualizado (foi incrementado no claim)
    const current = await prisma.message.findUnique({ where: { id: message.id } });
    const attemptCount = current?.attemptCount ?? message.attemptCount + 1;

    const willGiveUp = attemptCount >= MAX_ATTEMPTS;

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: willGiveUp ? 'FAILED' : 'SCHEDULED',
        lastError: errMsg.slice(0, 500),
      },
    });

    return { status: 'FAILED', error: errMsg };
  }
}

/**
 * Versão "envio agora" que cria UM message já marcando SENDING e tentando
 * mandar imediatamente. Diferente do fluxo padrão que cria SCHEDULED e
 * espera worker, esse é síncrono na request do usuário.
 *
 * Retorna a mensagem atualizada (com status SENT/FAILED).
 */
export async function createAndDispatchNow(
  prisma: PrismaClient,
  zapi: ZapiClient,
  data: {
    instanceId: string;
    communityId: string | null;
    destinationType: string;
    content: string;
    imageUrl: string | null;
    createdById: string;
    targetGroupIds: string[];
  },
): Promise<MessageWithTargets> {
  // Cria já como SCHEDULED (vamos claim em seguida)
  const created = await prisma.message.create({
    data: {
      instanceId: data.instanceId,
      communityId: data.communityId,
      destinationType: data.destinationType,
      content: data.content,
      imageUrl: data.imageUrl,
      scheduledFor: new Date(),
      status: 'SCHEDULED',
      createdById: data.createdById,
      targets: {
        create: data.targetGroupIds.map((groupId) => ({
          groupId,
          status: 'SCHEDULED',
        })),
      },
    },
    include: { targets: { include: { group: true } } },
  });

  await dispatchMessage(prisma, zapi, created);

  // Re-busca pra pegar status atualizado
  const final = await prisma.message.findUnique({
    where: { id: created.id },
    include: {
      targets: { include: { group: true } },
      instance: true,
      community: true,
    },
  });
  return final!;
}

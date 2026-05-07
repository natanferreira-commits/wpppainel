import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getZapiClient } from '@/lib/zapi';
import { dispatchMessage } from '@/lib/sender';
import { errorResponse, fromZodError, notFound } from '../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/messages — cria mensagem (imediata ou agendada)
// GET  /api/messages — lista com filtros opcionais
//
// Lógica de "enviar agora":
//   Se scheduledFor for omitido OU já passou (ou está nos próximos 30s),
//   tenta despachar SÍNCRONO na mesma request (chama Z-API direto).
//   Frontend recebe a mensagem já com status SENT/FAILED.
//
//   Se scheduledFor for futuro (>30s à frente), cria SCHEDULED e o
//   worker (cron-job.org / GitHub Actions) despacha quando chegar a hora.

const DestinationType = z.enum(['ANNOUNCEMENT_CHANNEL', 'GROUP', 'MULTI_GROUP']);

const CreateMessageSchema = z
  .object({
    instanceId: z.string(),
    destinationType: DestinationType,
    communityId: z.string().optional(),
    groupId: z.string().optional(),
    groupIds: z.array(z.string()).optional(),
    content: z.string().min(1).max(4096),
    imageUrl: z.string().url().optional(),
    // Apelido é obrigatório a partir da v2 — sem ele o histórico fica
    // ilegível e impossível marcar resultado depois.
    nickname: z.string().min(1, 'Apelido é obrigatório').max(80),
    mentionAll: z.boolean().optional(),
    scheduledFor: z.string().datetime().optional(),
    createdById: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.destinationType === 'ANNOUNCEMENT_CHANNEL' && !data.communityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'communityId obrigatório para ANNOUNCEMENT_CHANNEL',
        path: ['communityId'],
      });
    }
    if (data.destinationType === 'GROUP' && !data.groupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'groupId obrigatório para GROUP',
        path: ['groupId'],
      });
    }
    if (data.destinationType === 'MULTI_GROUP' && !data.groupIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'groupIds obrigatório (pelo menos 1) para MULTI_GROUP',
        path: ['groupIds'],
      });
    }
  });

const IMMEDIATE_THRESHOLD_MS = 30_000; // <30s no futuro = "agora"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateMessageSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const dto = parsed.data;
  const now = new Date();
  const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : now;

  // RN-03: agendamento não pode ser no passado (com tolerância de 30s)
  if (dto.scheduledFor && scheduledFor.getTime() < now.getTime() - IMMEDIATE_THRESHOLD_MS) {
    return errorResponse('Data de agendamento não pode ser no passado');
  }

  // Resolve grupos alvo
  let targetGroupIds: string[] = [];
  if (dto.destinationType === 'ANNOUNCEMENT_CHANNEL') {
    const channel = await prisma.group.findFirst({
      where: { communityId: dto.communityId, isAnnouncementChannel: true },
    });
    if (!channel) return notFound('Canal de anúncios da comunidade');
    targetGroupIds = [channel.id];
  } else if (dto.destinationType === 'GROUP') {
    targetGroupIds = [dto.groupId!];
  } else {
    targetGroupIds = dto.groupIds!;
  }

  // Cria mensagem em SCHEDULED
  const message = await prisma.message.create({
    data: {
      instanceId: dto.instanceId,
      communityId: dto.communityId ?? null,
      destinationType: dto.destinationType,
      content: dto.content,
      imageUrl: dto.imageUrl ?? null,
      nickname: dto.nickname?.trim() || null,
      mentionAll: dto.mentionAll ?? false,
      scheduledFor,
      status: 'SCHEDULED',
      createdById: dto.createdById,
      targets: {
        create: targetGroupIds.map((groupId) => ({ groupId, status: 'SCHEDULED' })),
      },
    },
    include: {
      targets: { include: { group: true } },
      instance: true,
      community: true,
    },
  });

  // Decide se dispara síncrono ou deixa pro worker
  const isImmediate =
    !dto.scheduledFor ||
    scheduledFor.getTime() <= now.getTime() + IMMEDIATE_THRESHOLD_MS;

  if (isImmediate) {
    let zapi;
    try {
      zapi = getZapiClient();
    } catch {
      // Z-API não configurada — devolve a mensagem em SCHEDULED com erro,
      // worker pode despachar depois se Z-API for setada
      return NextResponse.json(
        {
          ...message,
          _warning: 'Z-API não configurada — mensagem ficou agendada (status SCHEDULED)',
        },
        { status: 201 },
      );
    }

    const outcome = await dispatchMessage(prisma, zapi, message);

    // Re-busca a mensagem com status final pra retornar pro frontend
    const updated = await prisma.message.findUnique({
      where: { id: message.id },
      include: {
        targets: { include: { group: true } },
        instance: true,
        community: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(updated, {
      status: outcome.status === 'FAILED' ? 502 : 201,
    });
  }

  // Caso contrário: agendado pro futuro, vai pro cron-job/GitHub Actions
  return NextResponse.json(message, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? undefined;
  const instanceId = searchParams.get('instanceId') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  const messages = await prisma.message.findMany({
    where: { status, instanceId },
    orderBy: [{ scheduledFor: 'desc' }],
    take: limit,
    include: {
      instance: { select: { id: true, name: true } },
      community: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      targets: {
        include: {
          group: { select: { id: true, name: true, isAnnouncementChannel: true } },
        },
      },
    },
  });

  return NextResponse.json(messages);
}

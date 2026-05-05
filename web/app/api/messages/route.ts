import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { errorResponse, fromZodError, notFound } from '../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/messages — cria mensagem (imediata ou agendada)
// GET  /api/messages — lista com filtros opcionais

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateMessageSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const dto = parsed.data;
  const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : new Date();
  if (dto.scheduledFor && scheduledFor < new Date()) {
    return errorResponse('Data de agendamento não pode ser no passado');
  }

  // Resolve grupos alvo (canal de anúncios busca o group isAnnouncementChannel da comunidade)
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

  const message = await prisma.message.create({
    data: {
      instanceId: dto.instanceId,
      communityId: dto.communityId ?? null,
      destinationType: dto.destinationType,
      content: dto.content,
      imageUrl: dto.imageUrl ?? null,
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

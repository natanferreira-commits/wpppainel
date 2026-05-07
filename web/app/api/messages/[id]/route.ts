import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { errorResponse, fromZodError, notFound } from '../../_helpers/errors';

export const dynamic = 'force-dynamic';

// GET /api/messages/[id]

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const message = await prisma.message.findUnique({
    where: { id: ctx.params.id },
    include: {
      instance: true,
      community: true,
      createdBy: true,
      targets: { include: { group: true } },
    },
  });
  if (!message) return notFound('Mensagem');
  return NextResponse.json(message);
}

// PATCH /api/messages/[id]
// Atualiza mensagem agendada. Round 1: aceita só { status: "CANCELLED" }
// e edição de content/scheduledFor. Round 3 valida ownership via JWT.
//
// RN-05: mensagem SENT é imutável → 400 se tentar editar.

const PatchSchema = z.object({
  status: z.literal('CANCELLED').optional(),
  content: z.string().min(1).max(4096).optional(),
  scheduledFor: z.string().datetime().optional(),
  // null remove a imagem; string troca; undefined mantém
  imageUrl: z.string().url().nullable().optional(),
  mentionAll: z.boolean().optional(),
  nickname: z.string().max(80).nullable().optional(),
  // resultado da tip — só faz sentido editar APÓS o jogo
  result: z.enum(['GREEN', 'RED', 'VOID']).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const message = await prisma.message.findUnique({
    where: { id: ctx.params.id },
  });
  if (!message) return notFound('Mensagem');

  // RN-05: SENT/FAILED é imutável
  if (message.status === 'SENT' || message.status === 'FAILED') {
    return errorResponse(`Mensagem já está em ${message.status}, não pode ser editada`, 400);
  }

  // RN-04: editar conteúdo só até 1 minuto antes do envio.
  // Apelido e resultado podem ser editados a qualquer momento
  // (mesmo após SENT — resultado SEMPRE é pós-jogo).
  const isEditingContent =
    parsed.data.scheduledFor !== undefined ||
    parsed.data.content !== undefined ||
    parsed.data.imageUrl !== undefined;

  if (isEditingContent) {
    if (message.status === 'SENT' || message.status === 'FAILED') {
      return errorResponse(
        `Mensagem já está em ${message.status}, não pode ter conteúdo editado`,
        400,
      );
    }
    const minutesUntilSend = (message.scheduledFor.getTime() - Date.now()) / 60000;
    if (minutesUntilSend < 1) {
      return errorResponse(
        'Conteúdo só pode ser editado até 1 minuto antes do envio',
        400,
      );
    }
  }

  const updated = await prisma.message.update({
    where: { id: ctx.params.id },
    data: {
      status: parsed.data.status,
      content: parsed.data.content,
      scheduledFor: parsed.data.scheduledFor
        ? new Date(parsed.data.scheduledFor)
        : undefined,
      // imageUrl: null = remove imagem; string = troca; undefined = mantém
      imageUrl: parsed.data.imageUrl === undefined ? undefined : parsed.data.imageUrl,
      mentionAll: parsed.data.mentionAll,
      nickname:
        parsed.data.nickname === undefined
          ? undefined
          : parsed.data.nickname?.trim() || null,
      result: parsed.data.result === undefined ? undefined : parsed.data.result,
    },
    include: {
      targets: { include: { group: true } },
    },
  });

  // RN-05 (relaxada pra apelido/resultado):
  if (
    (message.status === 'SENT' || message.status === 'FAILED') &&
    parsed.data.status === 'CANCELLED'
  ) {
    return errorResponse('Mensagem já enviada não pode ser cancelada', 400);
  }

  // Se cancelou, propaga pros targets
  if (parsed.data.status === 'CANCELLED') {
    await prisma.messageTarget.updateMany({
      where: { messageId: ctx.params.id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
  }

  return NextResponse.json(updated);
}

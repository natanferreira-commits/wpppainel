import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { BETTING_HOUSES } from '@/lib/houses';
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
//
// Permissões por campo (não por mensagem inteira):
//
//   Categoria A — CONTEÚDO (content, scheduledFor, imageUrl, mentionAll)
//     · Só pode ser editado quando status = SCHEDULED
//     · Adicionalmente, só até 1min antes do horário de envio (RN-04)
//
//   Categoria B — CANCELAMENTO (status: CANCELLED)
//     · Só pode em SCHEDULED. Em SENT/FAILED/CANCELLED não faz sentido.
//
//   Categoria C — METADADOS (nickname, result, house)
//     · SEMPRE permitido, em QUALQUER status. Resultado é por definição
//       pós-jogo, marcar Green/Red/Void numa tip SENT é o caso de uso
//       principal. Apelido e casa também podem ser ajustados depois
//       (ex: descobrir que tip antiga foi de Stake, não Novibet).

const PatchSchema = z.object({
  status: z.literal('CANCELLED').optional(),
  content: z.string().min(1).max(4096).optional(),
  scheduledFor: z.string().datetime().optional(),
  // null remove a imagem; string troca; undefined mantém
  imageUrl: z.string().url().nullable().optional(),
  mentionAll: z.boolean().optional(),
  nickname: z.string().max(80).nullable().optional(),
  result: z.enum(['GREEN', 'RED', 'VOID']).nullable().optional(),
  // Casa de aposta — null pra remover, undefined pra manter.
  house: z.enum(BETTING_HOUSES).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const message = await prisma.message.findUnique({
    where: { id: ctx.params.id },
  });
  if (!message) return notFound('Mensagem');

  const isEditingContent =
    parsed.data.content !== undefined ||
    parsed.data.scheduledFor !== undefined ||
    parsed.data.imageUrl !== undefined ||
    parsed.data.mentionAll !== undefined;

  const isCancelling = parsed.data.status === 'CANCELLED';

  // Categoria A — conteúdo só em SCHEDULED + 1min antes (RN-04)
  if (isEditingContent) {
    if (message.status !== 'SCHEDULED') {
      return errorResponse(
        `Conteúdo de mensagem ${message.status} não pode ser editado`,
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

  // Categoria B — cancelar só em SCHEDULED
  if (isCancelling && message.status !== 'SCHEDULED') {
    return errorResponse(
      `Mensagem ${message.status} não pode ser cancelada`,
      400,
    );
  }

  // Categoria C (nickname, result, house) — sem restrição de status

  const updated = await prisma.message.update({
    where: { id: ctx.params.id },
    data: {
      status: parsed.data.status,
      content: parsed.data.content,
      scheduledFor: parsed.data.scheduledFor
        ? new Date(parsed.data.scheduledFor)
        : undefined,
      imageUrl: parsed.data.imageUrl === undefined ? undefined : parsed.data.imageUrl,
      mentionAll: parsed.data.mentionAll,
      nickname:
        parsed.data.nickname === undefined
          ? undefined
          : parsed.data.nickname?.trim() || null,
      result: parsed.data.result === undefined ? undefined : parsed.data.result,
      house: parsed.data.house === undefined ? undefined : parsed.data.house,
    },
    include: {
      targets: { include: { group: true } },
    },
  });

  // Se cancelou, propaga pros targets ainda agendados
  if (isCancelling) {
    await prisma.messageTarget.updateMany({
      where: { messageId: ctx.params.id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
  }

  return NextResponse.json(updated);
}

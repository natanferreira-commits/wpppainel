import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../_helpers/errors';

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

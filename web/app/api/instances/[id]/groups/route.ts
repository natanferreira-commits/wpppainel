import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../../_helpers/errors';

export const dynamic = 'force-dynamic';

// GET /api/instances/[id]/groups
// Lista os grupos de uma instância (canal de anúncios primeiro).

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const instance = await prisma.instance.findUnique({ where: { id: ctx.params.id } });
  if (!instance) return notFound('Instância');

  const groups = await prisma.group.findMany({
    where: { instanceId: ctx.params.id },
    orderBy: [{ isAnnouncementChannel: 'desc' }, { name: 'asc' }],
    include: {
      community: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(groups);
}

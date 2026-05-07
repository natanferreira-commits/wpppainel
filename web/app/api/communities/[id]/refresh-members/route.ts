import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getZapiClient, ZapiError } from '@/lib/zapi';
import { errorResponse, notFound } from '../../../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/communities/[id]/refresh-members
//
// Refresh manual sob demanda — usado pelo botão "Atualizar agora"
// no card de Insights. Puxa a contagem real do canal de anúncios
// via Z-API e atualiza Community.membersCount.

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const community = await prisma.community.findUnique({
    where: { id: ctx.params.id },
    include: {
      groups: { where: { isAnnouncementChannel: true }, take: 1 },
    },
  });
  if (!community) return notFound('Comunidade');

  const channel = community.groups[0];
  if (!channel) {
    return errorResponse(
      'Comunidade não tem canal de anúncios — não dá pra contar membros',
      400,
    );
  }

  let zapi;
  try {
    zapi = getZapiClient();
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Z-API não configurada',
      500,
    );
  }

  try {
    const meta = await zapi.getGroupMetadata(channel.whatsappId);
    const realCount = meta?.participants?.length ?? null;
    if (realCount === null) {
      return errorResponse('Z-API não retornou lista de participantes', 502);
    }

    const before = community.membersCount;

    await prisma.community.update({
      where: { id: community.id },
      data: { membersCount: realCount },
    });
    await prisma.group.update({
      where: { id: channel.id },
      data: { membersCount: realCount, cachedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      community: { id: community.id, name: community.name },
      before,
      after: realCount,
      delta: before === null ? null : realCount - before,
    });
  } catch (err) {
    if (err instanceof ZapiError) {
      return errorResponse(`Z-API ${err.status}: ${err.body.slice(0, 200)}`, 502);
    }
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
}

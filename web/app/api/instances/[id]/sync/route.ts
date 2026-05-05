import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getZapiClient, ZapiError } from '@/lib/zapi';
import { errorResponse, notFound } from '../../../_helpers/errors';

export const dynamic = 'force-dynamic';

// POST /api/instances/[id]/sync
// Sincroniza os grupos/comunidades reais da Z-API pro nosso DB.
// Substitui os dados de seed pelos verdadeiros.

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const instanceId = ctx.params.id;

  const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
  if (!instance) return notFound('Instância');

  let zapi;
  try {
    zapi = getZapiClient();
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Z-API não configurada',
      500,
    );
  }

  // 1. Verifica status da conexão
  let status;
  try {
    status = await zapi.getStatus();
  } catch (err) {
    if (err instanceof ZapiError) {
      return errorResponse(`Z-API ${err.status}: ${err.body}`, 502);
    }
    throw err;
  }

  if (!status.connected) {
    await prisma.instance.update({
      where: { id: instanceId },
      data: { status: 'DISCONNECTED' },
    });
    return errorResponse(
      'Instância Z-API não está conectada (escaneie o QR no painel da Z-API primeiro)',
      400,
    );
  }

  // 2. Marca como conectada no nosso DB
  await prisma.instance.update({
    where: { id: instanceId },
    data: {
      status: 'CONNECTED',
      lastConnectedAt: new Date(),
      zapiInstanceId: process.env.ZAPI_INSTANCE_ID ?? null,
    },
  });

  // 3. Lista grupos (paginação com pageSize 100 cobre nosso caso)
  let groups;
  try {
    groups = await zapi.getGroups();
  } catch (err) {
    if (err instanceof ZapiError) {
      return errorResponse(`Erro ao listar grupos: ${err.body}`, 502);
    }
    throw err;
  }

  // 4. Pra cada grupo: cria/atualiza Community se vier communityId, e
  // upsert do Group ligado a ela. Detecta canal de anúncios pelo flag.
  const synced: Array<{
    id: string;
    name: string;
    isAnnouncement: boolean;
    communityId: string | null;
  }> = [];

  for (const g of groups) {
    const isAnnouncement =
      g.isGroupAnnouncement === true ||
      g.isAnnouncement === true ||
      g.announcement === true ||
      /anúncio|announcement|broadcast/i.test(g.name);

    // Se a Z-API retornou communityId, garantir que a Community existe no DB
    let dbCommunityId: string | null = null;
    if (g.communityId) {
      const community = await prisma.community.upsert({
        where: {
          instanceId_whatsappId: { instanceId, whatsappId: g.communityId },
        },
        update: {},
        create: {
          instanceId,
          whatsappId: g.communityId,
          // Pra canal de anúncios, o nome do grupo é praticamente o nome
          // da comunidade (ex: "✅ MATEUS CAUMO #1")
          name: isAnnouncement ? g.name : `Comunidade ${g.communityId.slice(-6)}`,
          membersCount: g.participantsCount ?? null,
        },
      });
      dbCommunityId = community.id;
    }

    const group = await prisma.group.upsert({
      where: {
        instanceId_whatsappId: { instanceId, whatsappId: g.phone },
      },
      update: {
        name: g.name,
        membersCount: g.participantsCount ?? null,
        isAnnouncementChannel: isAnnouncement,
        communityId: dbCommunityId,
        cachedAt: new Date(),
      },
      create: {
        instanceId,
        communityId: dbCommunityId,
        whatsappId: g.phone,
        name: g.name,
        membersCount: g.participantsCount ?? null,
        isAnnouncementChannel: isAnnouncement,
      },
    });

    synced.push({
      id: group.id,
      name: group.name,
      isAnnouncement,
      communityId: dbCommunityId,
    });
  }

  return NextResponse.json({
    ok: true,
    instance: {
      status: 'CONNECTED',
      session: status.session,
    },
    syncedGroups: synced.length,
    groups: synced,
  });
}

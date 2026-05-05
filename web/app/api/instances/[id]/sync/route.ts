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

  // 2. Pega info do device (número/nome reais da conta WhatsApp conectada)
  let device;
  try {
    device = await zapi.getDevice();
  } catch {
    // não fatal — segue sem atualizar nome/phone
  }

  // 3. Marca como conectada + atualiza nome/phone com dados reais da Z-API
  await prisma.instance.update({
    where: { id: instanceId },
    data: {
      status: 'CONNECTED',
      lastConnectedAt: new Date(),
      zapiInstanceId: process.env.ZAPI_INSTANCE_ID ?? null,
      name: device?.name ?? instance.name,
      phoneNumber: device?.phone ? formatPhoneBR(device.phone) : instance.phoneNumber,
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

    // Pega contagem REAL de participantes via group-metadata (mais confiável
    // que o /groups que pode não retornar count). Best-effort: se falhar,
    // segue sem o count.
    let realMembersCount: number | null = g.participantsCount ?? null;
    try {
      const meta = await zapi.getGroupMetadata(g.phone);
      if (meta?.participants?.length) {
        realMembersCount = meta.participants.length;
      }
    } catch {
      // ignore — não fatal
    }

    // Se a Z-API retornou communityId, garantir que a Community existe no DB
    let dbCommunityId: string | null = null;
    if (g.communityId) {
      const community = await prisma.community.upsert({
        where: {
          instanceId_whatsappId: { instanceId, whatsappId: g.communityId },
        },
        update: {
          // Pra canal de anúncios, atualiza membersCount com o real
          ...(isAnnouncement && realMembersCount !== null
            ? { membersCount: realMembersCount }
            : {}),
        },
        create: {
          instanceId,
          whatsappId: g.communityId,
          // Pra canal de anúncios, o nome do grupo é praticamente o nome
          // da comunidade (ex: "✅ MATEUS CAUMO #1")
          name: isAnnouncement ? g.name : `Comunidade ${g.communityId.slice(-6)}`,
          membersCount: realMembersCount,
        },
      });
      dbCommunityId = community.id;

      // Pro canal de anúncios, cria/atualiza snapshot de hoje no
      // CommunityMetric (alimenta o gráfico de Insights)
      if (isAnnouncement && realMembersCount !== null) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await prisma.communityMetric.upsert({
          where: { communityId_date: { communityId: community.id, date: today } },
          update: { membersCount: realMembersCount },
          create: {
            communityId: community.id,
            date: today,
            membersCount: realMembersCount,
          },
        });
      }
    }

    const group = await prisma.group.upsert({
      where: {
        instanceId_whatsappId: { instanceId, whatsappId: g.phone },
      },
      update: {
        name: g.name,
        membersCount: realMembersCount,
        isAnnouncementChannel: isAnnouncement,
        communityId: dbCommunityId,
        cachedAt: new Date(),
      },
      create: {
        instanceId,
        communityId: dbCommunityId,
        whatsappId: g.phone,
        name: g.name,
        membersCount: realMembersCount,
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
      name: device?.name ?? instance.name,
      phone: device?.phone ? formatPhoneBR(device.phone) : null,
      session: status.session,
    },
    syncedGroups: synced.length,
    groups: synced,
  });
}

// Formata número internacional brasileiro vindo da Z-API.
// Ex: "552123425243" → "+55 21 2342-5243"
//     "5521988887777" → "+55 21 98888-7777"
function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 13) return `+${digits}`;
  const country = digits.slice(0, 2);
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  if (rest.length === 9) {
    return `+${country} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return `+${country} ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getZapiClient, ZapiError } from '@/lib/zapi';

export const dynamic = 'force-dynamic';

// GET /api/cron/daily-snapshot?token=CRON_TOKEN
//
// Job diário (1x/dia) que cria um snapshot do membersCount de cada
// comunidade no CommunityMetric. Alimenta o gráfico de crescimento
// e o cálculo de churn % por dia.
//
// Lógica:
//   1. Pega todas as Communities ativas
//   2. Pra cada: pega o canal de anúncios → group-metadata → participants.length
//   3. Cria/atualiza CommunityMetric do dia (00:00:00)
//
// Configurar GitHub Actions ou cron-job.org pra bater nessa URL
// 1x/dia, idealmente entre 23:50 e 00:10 BRT.

export async function GET(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  const expected = process.env.CRON_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { message: 'CRON_TOKEN não configurado' },
      { status: 500 },
    );
  }
  if (token !== expected) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let zapi;
  try {
    zapi = getZapiClient();
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'Z-API não configurada' },
      { status: 500 },
    );
  }

  // Pega comunidades que têm canal de anúncios
  const communities = await prisma.community.findMany({
    include: {
      groups: {
        where: { isAnnouncementChannel: true },
        take: 1,
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = {
    snapshots: 0,
    skipped: 0,
    errors: 0,
  };
  const results: Array<{
    community: string;
    status: string;
    membersCount?: number;
    error?: string;
  }> = [];

  for (const community of communities) {
    const channel = community.groups[0];
    if (!channel) {
      stats.skipped++;
      results.push({
        community: community.name,
        status: 'skipped',
        error: 'sem canal de anúncios',
      });
      continue;
    }

    try {
      const meta = await zapi.getGroupMetadata(channel.whatsappId);
      const membersCount = meta?.participants?.length ?? null;
      if (membersCount === null) {
        stats.skipped++;
        results.push({
          community: community.name,
          status: 'skipped',
          error: 'group-metadata sem participants',
        });
        continue;
      }

      await prisma.communityMetric.upsert({
        where: { communityId_date: { communityId: community.id, date: today } },
        update: { membersCount },
        create: {
          communityId: community.id,
          date: today,
          membersCount,
        },
      });

      // Atualiza membersCount na própria Community (e no Group canal)
      await prisma.community.update({
        where: { id: community.id },
        data: { membersCount },
      });
      await prisma.group.update({
        where: { id: channel.id },
        data: { membersCount, cachedAt: new Date() },
      });

      stats.snapshots++;
      results.push({
        community: community.name,
        status: 'ok',
        membersCount,
      });
    } catch (err) {
      stats.errors++;
      results.push({
        community: community.name,
        status: 'error',
        error:
          err instanceof ZapiError
            ? `Z-API ${err.status}: ${err.body.slice(0, 100)}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    stats,
    results,
  });
}

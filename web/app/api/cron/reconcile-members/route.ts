import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getZapiClient, ZapiError } from '@/lib/zapi';

export const dynamic = 'force-dynamic';

// GET /api/cron/reconcile-members?token=CRON_TOKEN
//
// Reconcile periódico do contador de membros das comunidades.
// Diferente do daily-snapshot:
//   - NÃO cria CommunityMetric (snapshot do dia continua sendo 1x/dia)
//   - Só atualiza Community.membersCount + Group.membersCount com a
//     contagem real da Z-API
//
// Por que existir:
//   - Webhook bumpa ±1 em tempo real, mas pode perder eventos
//     (Z-API com problema, instância caída, race condition)
//   - Drift acumula com o tempo. Reconcile a cada 30min mantém o
//     número alinhado com a realidade do WhatsApp.
//
// Setup: GitHub Actions bate aqui a cada 30min.

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

  // Comunidades com canal de anúncios (a contagem real vem do canal)
  const communities = await prisma.community.findMany({
    include: {
      groups: { where: { isAnnouncementChannel: true }, take: 1 },
    },
  });

  const stats = { reconciled: 0, skipped: 0, errors: 0 };
  const results: Array<{
    community: string;
    status: string;
    before?: number | null;
    after?: number | null;
    delta?: number;
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
      const realCount = meta?.participants?.length ?? null;
      if (realCount === null) {
        stats.skipped++;
        results.push({
          community: community.name,
          status: 'skipped',
          error: 'group-metadata sem participants',
        });
        continue;
      }

      const before = community.membersCount;
      const delta = before === null ? null : realCount - before;

      await prisma.community.update({
        where: { id: community.id },
        data: { membersCount: realCount },
      });
      await prisma.group.update({
        where: { id: channel.id },
        data: { membersCount: realCount, cachedAt: new Date() },
      });

      stats.reconciled++;
      results.push({
        community: community.name,
        status: 'ok',
        before,
        after: realCount,
        delta: delta ?? undefined,
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
    at: new Date().toISOString(),
    stats,
    results,
  });
}

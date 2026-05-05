import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../../_helpers/errors';

// GET /api/communities/[id]/insights
// Agregação de métricas: membros, crescimento 7d, churn estimado,
// top mensagens "queimadoras" (mais saídas atribuídas) e série de 30d.

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const communityId = ctx.params.id;
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community) return notFound('Comunidade');

  const now = new Date();
  const days7 = subDays(now, 7);
  const days30 = subDays(now, 30);

  const [metrics, recentEvents, sentMessages] = await Promise.all([
    prisma.communityMetric.findMany({
      where: { communityId, date: { gte: days30 } },
      orderBy: { date: 'asc' },
    }),
    prisma.memberEvent.findMany({
      where: { communityId, occurredAt: { gte: days7 } },
      select: { type: true, occurredAt: true },
    }),
    prisma.message.findMany({
      where: {
        communityId,
        status: 'SENT',
        sentAt: { gte: days7 },
      },
      include: {
        memberEvents: {
          where: { type: 'LEFT' },
          select: { id: true, occurredAt: true },
        },
      },
    }),
  ]);

  const joins7d = recentEvents.filter((e) => e.type === 'JOIN').length;
  const lefts7d = recentEvents.filter((e) => e.type === 'LEFT').length;

  const latest = metrics[metrics.length - 1];
  const sevenDaysAgo = metrics.find((m) => m.date >= days7);
  const membersNow = latest?.membersCount ?? community.membersCount ?? 0;
  const members7dAgo = sevenDaysAgo?.membersCount ?? membersNow;
  const growth7d = membersNow - members7dAgo;
  const growth7dPct = members7dAgo > 0 ? (growth7d / members7dAgo) * 100 : 0;

  const avgMembers7d = sevenDaysAgo
    ? Math.round((membersNow + members7dAgo) / 2)
    : membersNow;
  const churn7dPct = avgMembers7d > 0 ? (lefts7d / avgMembers7d) * 100 : 0;

  const topBurners = sentMessages
    .map((m) => {
      const window = m.sentAt ? new Date(m.sentAt.getTime() + 60 * 60 * 1000) : null;
      const leftsIn60min = window
        ? m.memberEvents.filter((e) => e.occurredAt <= window).length
        : 0;
      const leftsTotal = m.memberEvents.length;
      return {
        id: m.id,
        content: m.content,
        sentAt: m.sentAt,
        leftsIn60min,
        leftsTotal,
      };
    })
    .filter((m) => m.leftsTotal > 0)
    .sort((a, b) => b.leftsTotal - a.leftsTotal)
    .slice(0, 5);

  return NextResponse.json({
    community: { id: community.id, name: community.name },
    summary: {
      membersNow,
      growth7d,
      growth7dPct,
      churn7dPct,
      joins7d,
      lefts7d,
    },
    growthSeries: metrics.map((m) => ({
      date: m.date,
      membersCount: m.membersCount,
      channelViews: m.channelViews,
    })),
    topBurners,
  });
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

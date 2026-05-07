import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../../_helpers/errors';

export const dynamic = 'force-dynamic';

// GET /api/communities/[id]/insights
//
// Agregação completa de métricas:
//   - summary: membros agora, crescimento 7d, churn 7d, joins/lefts 7d
//   - realtime: últimas 24h (joins, lefts, churn médio)
//   - growthSeries: 30 dias de snapshots pro gráfico
//   - daily: breakdown diário dos últimos 7 dias (data + entradas + saídas + líquido + churn)
//   - topBurners: top 5 mensagens com mais saídas atribuídas
//   - comparison: opcional (?compareDays=7) — compara últimos N dias com N dias anteriores

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const communityId = ctx.params.id;
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community) return notFound('Comunidade');

  const compareDays = parseInt(req.nextUrl.searchParams.get('compareDays') ?? '7', 10);

  const now = new Date();
  const days1 = subDays(now, 1);
  const days7 = subDays(now, 7);
  const days14 = subDays(now, 14);
  const days30 = subDays(now, 30);

  const [metrics, eventsLast14d, sentMessages] = await Promise.all([
    prisma.communityMetric.findMany({
      where: { communityId, date: { gte: days30 } },
      orderBy: { date: 'asc' },
    }),
    prisma.memberEvent.findMany({
      where: { communityId, occurredAt: { gte: days14 } },
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

  // ── helpers de filtro por janela ─────────────────────────────────────
  const eventsInWindow = (from: Date, to: Date) =>
    eventsLast14d.filter((e) => e.occurredAt >= from && e.occurredAt < to);

  const countByType = (events: typeof eventsLast14d) => ({
    joins: events.filter((e) => e.type === 'JOIN').length,
    lefts: events.filter((e) => e.type === 'LEFT').length,
  });

  // ── summary 7d ───────────────────────────────────────────────────────
  const recent7d = countByType(eventsInWindow(days7, now));
  const latest = metrics[metrics.length - 1];
  const sevenDaysAgoMetric = metrics.find((m) => m.date >= days7);
  // Prioridade: community.membersCount (tempo real, atualizado por
  // webhook bump + reconcile) > snapshot diário (atrasado, só pra fallback).
  // Antes estava invertido — snapshot ganhava e o card ficava parado.
  const membersNow = community.membersCount ?? latest?.membersCount ?? 0;
  const members7dAgo = sevenDaysAgoMetric?.membersCount ?? membersNow;
  const growth7d = membersNow - members7dAgo;
  const growth7dPct = members7dAgo > 0 ? (growth7d / members7dAgo) * 100 : 0;
  const avgMembers7d = sevenDaysAgoMetric
    ? Math.round((membersNow + members7dAgo) / 2)
    : membersNow;
  const churn7dPct = avgMembers7d > 0 ? (recent7d.lefts / avgMembers7d) * 100 : 0;

  // ── realtime 24h ─────────────────────────────────────────────────────
  const realtime24h = countByType(eventsInWindow(days1, now));
  const churn24hPct =
    membersNow > 0 ? (realtime24h.lefts / membersNow) * 100 : 0;

  // ── daily breakdown últimos 7 dias ──────────────────────────────────
  const daily: Array<{
    date: string;
    joins: number;
    lefts: number;
    net: number;
    membersCount: number | null;
    churnPct: number;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDay(subDays(now, i));
    const dayEnd = startOfDay(subDays(now, i - 1));
    const dayEvents = eventsInWindow(dayStart, dayEnd);
    const counts = countByType(dayEvents);
    const dayMetric = metrics.find(
      (m) => m.date.toDateString() === dayStart.toDateString(),
    );
    const dayMembers = dayMetric?.membersCount ?? null;
    const churnPct =
      dayMembers && dayMembers > 0 ? (counts.lefts / dayMembers) * 100 : 0;
    daily.push({
      date: dayStart.toISOString(),
      joins: counts.joins,
      lefts: counts.lefts,
      net: counts.joins - counts.lefts,
      membersCount: dayMembers,
      churnPct,
    });
  }

  // ── comparison: últimos N dias vs N dias anteriores ─────────────────
  const compareFrom = subDays(now, compareDays);
  const compareFromBefore = subDays(now, compareDays * 2);

  const periodA = countByType(eventsInWindow(compareFrom, now));
  const periodB = countByType(eventsInWindow(compareFromBefore, compareFrom));

  const comparison = {
    days: compareDays,
    periodA: {
      label: `últimos ${compareDays}d`,
      joins: periodA.joins,
      lefts: periodA.lefts,
      net: periodA.joins - periodA.lefts,
    },
    periodB: {
      label: `${compareDays}d anteriores`,
      joins: periodB.joins,
      lefts: periodB.lefts,
      net: periodB.joins - periodB.lefts,
    },
    diff: {
      joins: periodA.joins - periodB.joins,
      lefts: periodA.lefts - periodB.lefts,
      net: periodA.joins - periodA.lefts - (periodB.joins - periodB.lefts),
      joinsPct:
        periodB.joins > 0 ? ((periodA.joins - periodB.joins) / periodB.joins) * 100 : 0,
      leftsPct:
        periodB.lefts > 0 ? ((periodA.lefts - periodB.lefts) / periodB.lefts) * 100 : 0,
    },
  };

  // ── top burners ──────────────────────────────────────────────────────
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
      joins7d: recent7d.joins,
      lefts7d: recent7d.lefts,
    },
    realtime: {
      hours: 24,
      joins: realtime24h.joins,
      lefts: realtime24h.lefts,
      net: realtime24h.joins - realtime24h.lefts,
      churnPct: churn24hPct,
    },
    growthSeries: metrics.map((m) => ({
      date: m.date,
      membersCount: m.membersCount,
      channelViews: m.channelViews,
    })),
    daily,
    comparison,
    topBurners,
  });
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  // Retorna o agregado de Insights de uma comunidade.
  // Round 2: dados vêm de cron real (Z-API). Por enquanto, vêm do seed.
  async getCommunityInsights(communityId: string) {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) throw new NotFoundException('Comunidade não encontrada');

    const now = new Date();
    const days7 = subDays(now, 7);
    const days30 = subDays(now, 30);

    // ── 30 dias de snapshot pra gráfico de crescimento ──
    const metrics = await this.prisma.communityMetric.findMany({
      where: { communityId, date: { gte: days30 } },
      orderBy: { date: 'asc' },
    });

    // ── Eventos JOIN/LEFT últimos 7 dias ──
    const recentEvents = await this.prisma.memberEvent.findMany({
      where: { communityId, occurredAt: { gte: days7 } },
      select: { type: true, occurredAt: true },
    });
    const joins7d = recentEvents.filter((e) => e.type === 'JOIN').length;
    const lefts7d = recentEvents.filter((e) => e.type === 'LEFT').length;

    // ── Stats de membros agora vs 7d atrás ──
    const latest = metrics[metrics.length - 1];
    const sevenDaysAgo = metrics.find((m) => m.date >= days7);
    const membersNow = latest?.membersCount ?? community.membersCount ?? 0;
    const members7dAgo = sevenDaysAgo?.membersCount ?? membersNow;
    const growth7d = membersNow - members7dAgo;
    const growth7dPct = members7dAgo > 0 ? (growth7d / members7dAgo) * 100 : 0;

    // Churn = LEFTs / membros médio do período
    const avgMembers7d = sevenDaysAgo
      ? Math.round((membersNow + members7dAgo) / 2)
      : membersNow;
    const churn7dPct = avgMembers7d > 0 ? (lefts7d / avgMembers7d) * 100 : 0;

    // ── Top mensagens queimadoras (mais LEFTs nos 60min após envio) ──
    // Pega mensagens SENT últimos 7 dias com pelo menos 1 LEFT atribuído.
    const sentMessages = await this.prisma.message.findMany({
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
    });

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

    return {
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
    };
  }
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

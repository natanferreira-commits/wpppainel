// Função de seed reusable. Chamada por:
//  - prisma/seed.ts (CLI, npm run db:seed em dev local)
//  - app/api/admin/seed/route.ts (endpoint protegido em prod)
//
// Popula: 1 instância (Caumo Tips), 1 comunidade (Caumo Free),
// canal de anúncios + 3 grupos, 30 dias de CommunityMetric, ~170
// MemberEvents (incluindo clusters de LEFT após mensagens "queimadoras"),
// e 4 mensagens passadas (3 queimadoras + 1 boa).

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function fakePhoneHash(): string {
  return createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 16);
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type SeedSummary = {
  users: string[];
  instance: string;
  community: string;
  groups: number;
  metrics: number;
  events: number;
  messages: number;
};

export async function seedDatabase(prisma: PrismaClient): Promise<SeedSummary> {
  const admin = await prisma.user.upsert({
    where: { email: 'natan@grupodupla.com.br' },
    update: {},
    create: {
      email: 'natan@grupodupla.com.br',
      name: 'Natan Puggian',
      role: 'ADMIN',
    },
  });

  const tipster = await prisma.user.upsert({
    where: { email: 'tipster@grupodupla.com.br' },
    update: {},
    create: {
      email: 'tipster@grupodupla.com.br',
      name: 'Tipster Caumo',
      role: 'OPERATOR',
    },
  });

  const instance = await prisma.instance.upsert({
    where: { id: 'inst_caumo_seed' },
    update: { status: 'CONNECTED', lastConnectedAt: new Date() },
    create: {
      id: 'inst_caumo_seed',
      name: 'Mateus Caumo Tips',
      phoneNumber: '+55 11 9XXXX-1234',
      status: 'CONNECTED',
      lastConnectedAt: new Date(),
    },
  });

  const community = await prisma.community.upsert({
    where: {
      instanceId_whatsappId: {
        instanceId: instance.id,
        whatsappId: 'wa_community_caumo_free',
      },
    },
    update: { membersCount: 4213 },
    create: {
      instanceId: instance.id,
      whatsappId: 'wa_community_caumo_free',
      name: 'Caumo Free',
      membersCount: 4213,
    },
  });

  const groupSpecs = [
    { whatsappId: 'wa_channel_caumo', name: '📢 Anúncios Caumo Free', isAnnouncementChannel: true, membersCount: 4213 },
    { whatsappId: 'wa_group_futebol', name: 'Tips Futebol', isAnnouncementChannel: false, membersCount: 982 },
    { whatsappId: 'wa_group_basquete', name: 'Tips Basquete', isAnnouncementChannel: false, membersCount: 412 },
    { whatsappId: 'wa_group_vips', name: 'Sala VIPs', isAnnouncementChannel: false, membersCount: 87 },
  ];

  const groups = await Promise.all(
    groupSpecs.map((g) =>
      prisma.group.upsert({
        where: {
          instanceId_whatsappId: { instanceId: instance.id, whatsappId: g.whatsappId },
        },
        update: { membersCount: g.membersCount },
        create: { ...g, instanceId: instance.id, communityId: community.id },
      }),
    ),
  );

  const announcementChannel = groups.find((g) => g.isAnnouncementChannel)!;

  // Limpa métricas e eventos antigos pra reseed limpo
  await prisma.memberEvent.deleteMany({ where: { communityId: community.id } });
  await prisma.communityMetric.deleteMany({ where: { communityId: community.id } });

  // 30 dias de CommunityMetric
  const baseStart = 4090;
  const baseEnd = 4213;
  const metricsData: { date: Date; membersCount: number; channelViews: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const t = (30 - i) / 30;
    const trend = Math.round(baseStart + (baseEnd - baseStart) * t);
    const noise = rand(-15, 25);
    metricsData.push({
      date: daysAgo(i),
      membersCount: trend + noise,
      channelViews: rand(2800, 3900),
    });
  }
  await prisma.communityMetric.createMany({
    data: metricsData.map((m) => ({
      communityId: community.id,
      date: m.date,
      membersCount: m.membersCount,
      channelViews: m.channelViews,
    })),
  });

  // Mensagens passadas — algumas "queimadoras"
  const msgPromo = await prisma.message.create({
    data: {
      instanceId: instance.id,
      communityId: community.id,
      destinationType: 'ANNOUNCEMENT_CHANNEL',
      content: '🎁 *PROMOÇÃO BÔNUS 100%* na BetX! Cadastre agora e ganhe até R$500 no primeiro depósito → https://betx.com.br/?ref=caumo',
      scheduledFor: daysAgo(5),
      status: 'SENT',
      sentAt: daysAgo(5),
      createdById: tipster.id,
      targets: { create: [{ groupId: announcementChannel.id, status: 'SENT', sentAt: daysAgo(5) }] },
    },
  });

  const tipBasquete = await prisma.message.create({
    data: {
      instanceId: instance.id,
      communityId: community.id,
      destinationType: 'ANNOUNCEMENT_CHANNEL',
      content: '🏀 *Lakers x Warriors* — over 220.5 pontos · odd 1.95 na Bet365',
      scheduledFor: daysAgo(3),
      status: 'SENT',
      sentAt: daysAgo(3),
      createdById: tipster.id,
      targets: { create: [{ groupId: announcementChannel.id, status: 'SENT', sentAt: daysAgo(3) }] },
    },
  });

  const tipBrasilArg = await prisma.message.create({
    data: {
      instanceId: instance.id,
      communityId: community.id,
      destinationType: 'ANNOUNCEMENT_CHANNEL',
      content: '🎯 *PALPITE DA NOITE — Brasil x Argentina*\n\nMais de 2.5 gols → odd 1.85 na BetX',
      scheduledFor: hoursAgo(20),
      status: 'SENT',
      sentAt: hoursAgo(20),
      createdById: tipster.id,
      targets: { create: [{ groupId: announcementChannel.id, status: 'SENT', sentAt: hoursAgo(20) }] },
    },
  });

  const tipManha = await prisma.message.create({
    data: {
      instanceId: instance.id,
      communityId: community.id,
      destinationType: 'ANNOUNCEMENT_CHANNEL',
      content: '☕ *Bom dia!* Hoje tem Premier League às 12h.\nDestaque: Liverpool x Arsenal · ambas marcam · odd 1.65',
      scheduledFor: hoursAgo(8),
      status: 'SENT',
      sentAt: hoursAgo(8),
      createdById: tipster.id,
      targets: { create: [{ groupId: announcementChannel.id, status: 'SENT', sentAt: hoursAgo(8) }] },
    },
  });

  // MemberEvents — baseline + clusters
  const events: Array<{ type: 'JOIN' | 'LEFT'; occurredAt: Date; messageId?: string }> = [];

  for (let day = 7; day >= 1; day--) {
    const joins = rand(8, 14);
    const lefts = rand(3, 7);
    for (let i = 0; i < joins; i++) {
      events.push({
        type: 'JOIN',
        occurredAt: new Date(daysAgo(day).getTime() + rand(0, 23 * 60 * 60 * 1000)),
      });
    }
    for (let i = 0; i < lefts; i++) {
      events.push({
        type: 'LEFT',
        occurredAt: new Date(daysAgo(day).getTime() + rand(0, 23 * 60 * 60 * 1000)),
      });
    }
  }

  // Cluster: 23 LEFTs após msgPromo
  for (let i = 0; i < 23; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(msgPromo.sentAt!.getTime() + rand(2, 60) * 60 * 1000),
      messageId: msgPromo.id,
    });
  }
  // Cluster: 18 LEFTs após tipBrasilArg
  for (let i = 0; i < 18; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(tipBrasilArg.sentAt!.getTime() + rand(2, 120) * 60 * 1000),
      messageId: tipBrasilArg.id,
    });
  }
  // Cluster: 12 LEFTs após tipBasquete
  for (let i = 0; i < 12; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(tipBasquete.sentAt!.getTime() + rand(2, 60) * 60 * 1000),
      messageId: tipBasquete.id,
    });
  }
  // Bonus: 4 JOINs após tipManha
  for (let i = 0; i < 4; i++) {
    events.push({
      type: 'JOIN',
      occurredAt: new Date(tipManha.sentAt!.getTime() + rand(5, 180) * 60 * 1000),
      messageId: tipManha.id,
    });
  }

  await prisma.memberEvent.createMany({
    data: events.map((e) => ({
      communityId: community.id,
      groupId: announcementChannel.id,
      type: e.type,
      phoneHash: fakePhoneHash(),
      messageId: e.messageId,
      occurredAt: e.occurredAt,
    })),
  });

  return {
    users: [admin.email, tipster.email],
    instance: instance.name,
    community: community.name,
    groups: groups.length,
    metrics: metricsData.length,
    events: events.length,
    messages: 4,
  };
}

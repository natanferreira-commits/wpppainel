import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

// helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

function fakePhoneHash(): string {
  return createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 16);
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// seed ────────────────────────────────────────────────────────────────────

async function main() {
  // ── Users ──
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

  // ── Instance ──
  const instance = await prisma.instance.upsert({
    where: { id: 'inst_caumo_seed' },
    update: {},
    create: {
      id: 'inst_caumo_seed',
      name: 'Mateus Caumo Tips',
      phoneNumber: '+55 11 9XXXX-1234',
      status: 'CONNECTED',
      lastConnectedAt: new Date(),
    },
  });

  // ── Community ──
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

  // ── Groups (canal de anúncios + 3 grupos) ──
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

  // ── Limpa métricas e eventos antigos pra reseed limpo ──
  await prisma.memberEvent.deleteMany({ where: { communityId: community.id } });
  await prisma.communityMetric.deleteMany({ where: { communityId: community.id } });

  // ── CommunityMetric: 30 dias de snapshots ──
  // Simulação: começa em ~4090, termina em 4213 com flutuações
  const baseStart = 4090;
  const baseEnd = 4213;
  const metricsData: { date: Date; membersCount: number; channelViews: number }[] = [];

  for (let i = 30; i >= 0; i--) {
    const t = (30 - i) / 30; // 0 → 1
    const trend = Math.round(baseStart + (baseEnd - baseStart) * t);
    const noise = rand(-15, 25);
    const membersCount = trend + noise;
    metricsData.push({
      date: daysAgo(i),
      membersCount,
      channelViews: rand(2800, 3900), // views do canal — fake
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

  // ── Mensagens passadas (já SENT) — algumas "queimadoras" ──
  // 5 dias atrás · 12:00 — promoção bônus 100% (queimadora)
  const msgQueimadora1 = await prisma.message.create({
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

  // 3 dias atrás · 21:00 — tip basquete
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

  // ontem · 19:30 — Brasil x Argentina (queimadora, perdeu)
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

  // hoje cedo — tip manhã (boa, sem queimadora)
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

  // ── MemberEvents — distribuídos pelos últimos 7 dias ──
  // Mistura JOIN baseline + LEFT clusters após mensagens queimadoras

  const events: Array<{
    type: 'JOIN' | 'LEFT';
    occurredAt: Date;
    messageId?: string;
  }> = [];

  // Baseline: ~10 JOINs e ~5 LEFTs por dia ao longo de 7 dias
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

  // Cluster 1: 23 LEFTs nos 60min após msgQueimadora1 (promo bônus)
  for (let i = 0; i < 23; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(msgQueimadora1.sentAt!.getTime() + rand(2, 60) * 60 * 1000),
      messageId: msgQueimadora1.id,
    });
  }

  // Cluster 2: 18 LEFTs nos 2h após tipBrasilArg (perdeu)
  for (let i = 0; i < 18; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(tipBrasilArg.sentAt!.getTime() + rand(2, 120) * 60 * 1000),
      messageId: tipBrasilArg.id,
    });
  }

  // Cluster 3: 12 LEFTs nos 60min após tipBasquete
  for (let i = 0; i < 12; i++) {
    events.push({
      type: 'LEFT',
      occurredAt: new Date(tipBasquete.sentAt!.getTime() + rand(2, 60) * 60 * 1000),
      messageId: tipBasquete.id,
    });
  }

  // Bonus: 4 JOINs após tipManha (mostra que tip boa atrai)
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

  console.log('Seed pronto:');
  console.log(`  Users: ${admin.email} / ${tipster.email}`);
  console.log(`  Instance: ${instance.name}`);
  console.log(`  Community: ${community.name}`);
  console.log(`  Groups: ${groups.length}`);
  console.log(`  Métricas (30d): ${metricsData.length}`);
  console.log(`  Eventos JOIN/LEFT: ${events.length}`);
  console.log(`  Mensagens passadas (com queimadoras): 4`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/clean?token=SEED_TOKEN
// Apaga dados de demonstração (Community "Caumo Free" + cascade).
// Mantém: users, instâncias e dados reais vindos do /sync com Z-API.
//
// Idempotente: pode rodar várias vezes. Se o que apaga já não existe,
// retorna deleted: 0 sem erro.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.SEED_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { message: 'SEED_TOKEN não configurado' },
      { status: 500 },
    );
  }
  if (token !== expected) {
    return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
  }

  // Apaga Community "Caumo Free" pelo whatsappId fake do seed
  // (cascade: groups filhos, metrics, events, messages)
  const fakeCommunity = await prisma.community.findFirst({
    where: { whatsappId: 'wa_community_caumo_free' },
  });

  let summary = {
    community: null as string | null,
    metrics: 0,
    memberEvents: 0,
    messages: 0,
    messageTargets: 0,
    groups: 0,
  };

  if (fakeCommunity) {
    // Conta antes pra reportar
    const [metricsCount, eventsCount, messagesCount, groupsCount] =
      await Promise.all([
        prisma.communityMetric.count({ where: { communityId: fakeCommunity.id } }),
        prisma.memberEvent.count({ where: { communityId: fakeCommunity.id } }),
        prisma.message.count({ where: { communityId: fakeCommunity.id } }),
        prisma.group.count({ where: { communityId: fakeCommunity.id } }),
      ]);

    // Apaga em ordem (Postgres respeita FK cascade do schema, mas vamos
    // ser explícitos pra garantir):
    // MessageTarget é cascateado de Message
    // MemberEvent depende de message via messageId opcional → não bloqueia

    await prisma.memberEvent.deleteMany({
      where: { communityId: fakeCommunity.id },
    });
    await prisma.message.deleteMany({
      where: { communityId: fakeCommunity.id },
    });
    await prisma.communityMetric.deleteMany({
      where: { communityId: fakeCommunity.id },
    });
    await prisma.group.deleteMany({
      where: { communityId: fakeCommunity.id },
    });
    await prisma.community.delete({ where: { id: fakeCommunity.id } });

    summary = {
      community: fakeCommunity.name,
      metrics: metricsCount,
      memberEvents: eventsCount,
      messages: messagesCount,
      messageTargets: 0, // já vai junto via cascade da Message
      groups: groupsCount,
    };
  }

  // Também apaga grupos órfãos do seed (sem communityId, com whatsappId
  // que começa com "wa_")
  const orphanGroupsDeleted = await prisma.group.deleteMany({
    where: {
      communityId: null,
      whatsappId: { startsWith: 'wa_' },
    },
  });

  return NextResponse.json({
    ok: true,
    message: fakeCommunity
      ? 'Dados de demonstração apagados'
      : 'Já estava limpo (sem Community fake)',
    summary,
    orphanGroupsDeleted: orphanGroupsDeleted.count,
  });
}

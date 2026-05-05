import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/instances
// Lista todas as instâncias com suas comunidades e contagem de grupos.

export async function GET() {
  const instances = await prisma.instance.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      communities: {
        select: { id: true, name: true, membersCount: true },
      },
      _count: { select: { groups: true } },
    },
  });
  return NextResponse.json(instances);
}

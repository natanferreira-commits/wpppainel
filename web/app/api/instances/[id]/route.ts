import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../_helpers/errors';

// GET /api/instances/[id]

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const instance = await prisma.instance.findUnique({
    where: { id: ctx.params.id },
    include: { communities: true },
  });
  if (!instance) return notFound('Instância');
  return NextResponse.json(instance);
}

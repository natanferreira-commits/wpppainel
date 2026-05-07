import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound } from '../../_helpers/errors';

export const dynamic = 'force-dynamic';

// DELETE /api/image-presets/[id]
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const preset = await prisma.imagePreset.findUnique({ where: { id: ctx.params.id } });
  if (!preset) return notFound('Preset');

  await prisma.imagePreset.delete({ where: { id: ctx.params.id } });

  return NextResponse.json({ ok: true, deleted: preset.id });
}

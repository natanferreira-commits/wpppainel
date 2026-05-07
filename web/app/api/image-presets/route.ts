import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRESET_CATEGORIES } from '@/lib/image-categories';
import { fromZodError } from '../_helpers/errors';

export const dynamic = 'force-dynamic';

const CategorySchema = z.enum(PRESET_CATEGORIES);

// GET /api/image-presets?category=NBA
//   sem categoria → retorna todos agrupados por categoria
//   com categoria → só daquela
export async function GET(req: NextRequest) {
  const categoryParam = req.nextUrl.searchParams.get('category');

  const where = categoryParam
    ? { category: categoryParam.toUpperCase() }
    : {};

  const presets = await prisma.imagePreset.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({
    categories: PRESET_CATEGORIES,
    presets,
  });
}

// POST /api/image-presets
const CreateSchema = z.object({
  category: CategorySchema,
  url: z.string().url(),
  label: z.string().max(80).optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const created = await prisma.imagePreset.create({
    data: {
      category: parsed.data.category,
      url: parsed.data.url,
      label: parsed.data.label ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });

  return NextResponse.json(created, { status: 201 });
}

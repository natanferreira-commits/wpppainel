// Categorias hardcoded do banco de imagens.
// Movido pra cá pra poder ser importado por route handlers (Next.js
// não permite exports arbitrários em route.ts).
//
// Adicionar nova categoria? Inclui aqui + atualiza CATEGORIES no
// components/image-bank.tsx + atualiza o type em lib/api.ts.

export const PRESET_CATEGORIES = [
  'AUMENTADAS',
  'NBA',
  'BINGOS',
  'SIMPLES',
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

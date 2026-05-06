import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// POST /api/upload
// Recebe FormData com campo "file" e sobe pro Vercel Blob.
// Retorna { url } público pra ser usado em Message.imageUrl.
//
// Limites:
//   - Apenas imagens (image/*)
//   - 5 MB máximo
//
// Requer BLOB_READ_WRITE_TOKEN nas env vars (Vercel injeta automático
// quando você cria um Blob store no Storage do projeto).

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        message:
          'Vercel Blob não configurado. Vai em Storage → Add Database → Blob no painel Vercel.',
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: 'FormData inválido' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'campo "file" é obrigatório' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { message: `Tipo não permitido (${file.type}). Use JPG, PNG, WebP ou GIF.` },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: `Imagem muito grande (${Math.round(file.size / 1024)} KB). Máximo 5 MB.` },
      { status: 400 },
    );
  }

  // Filename único pra evitar colisão
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `messages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    // Compatível com Blob stores private E public:
    //   - Store public:  blob.url é URL aberta
    //   - Store private: blob.url é URL com token (Z-API consegue baixar)
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return NextResponse.json({
      url: blob.url,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (err) {
    // Se o store é privado e a SDK reclama de access:'public',
    // tenta de novo SEM o access (cria blob com modo do store)
    if (
      err instanceof Error &&
      /Cannot use public access on a private store/i.test(err.message)
    ) {
      try {
        const blob = await put(filename, file, {
          addRandomSuffix: false,
          allowOverwrite: true,
        } as any);
        return NextResponse.json({
          url: blob.url,
          filename,
          size: file.size,
          type: file.type,
        });
      } catch (err2) {
        return NextResponse.json(
          { message: err2 instanceof Error ? err2.message : 'Upload falhou (private store)' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Erro ao fazer upload' },
      { status: 500 },
    );
  }
}

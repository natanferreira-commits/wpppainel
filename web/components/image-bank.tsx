'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Upload, Image as ImageIcon } from 'lucide-react';
import {
  imagePresets as imagePresetsApi,
  uploads as uploadsApi,
  type ImagePreset,
  type PresetCategory,
} from '@/lib/api';
import { cn } from '@/lib/cn';

const CATEGORIES: { id: PresetCategory; label: string; emoji: string }[] = [
  { id: 'SIMPLES', label: 'Simples', emoji: '⚪' },
  { id: 'AUMENTADAS', label: 'Aumentadas', emoji: '🔥' },
  { id: 'NBA', label: 'NBA', emoji: '🏀' },
  { id: 'BINGOS', label: 'Bingos', emoji: '🎯' },
];

type Props = {
  onSelect: (url: string) => void;
};

export function ImageBank({ onSelect }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('AUMENTADAS');
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const result = await imagePresetsApi.list(activeCategory);
      setPresets(result.presets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar presets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const upload = await uploadsApi.image(file);
      await imagePresetsApi.create({
        category: activeCategory,
        url: upload.url,
        label: file.name.replace(/\.[^.]+$/, ''),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover essa imagem do banco? (não apaga o arquivo do Blob)')) return;
    try {
      await imagePresetsApi.delete(id);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover');
    }
  }

  return (
    <div>
      {/* Tabs categoria — flex-wrap pra não estourar em mobile estreito */}
      <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-800">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              'px-3 py-2.5 md:py-2 text-xs font-medium transition border-b-2 -mb-px',
              activeCategory === cat.id
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 md:hover:text-slate-200 active:text-slate-200',
            )}
          >
            <span className="mr-1">{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid de imagens */}
      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 size={20} className="text-slate-500 animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 italic border border-dashed border-slate-800 rounded-lg">
          <ImageIcon size={20} className="mx-auto mb-2 text-slate-700" />
          Nenhuma imagem na categoria{' '}
          <strong>{CATEGORIES.find((c) => c.id === activeCategory)?.label}</strong>{' '}
          ainda. Use o botão abaixo pra adicionar.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.url)}
              className="relative group aspect-square rounded-lg overflow-hidden border border-slate-800 md:hover:border-emerald-500 transition cursor-pointer block"
              aria-label={`Selecionar imagem ${p.label ?? ''}`}
            >
              <img
                src={p.url}
                alt={p.label ?? 'preset'}
                className="w-full h-full object-cover pointer-events-none"
              />
              {/* Label flutuante — sempre visível no mobile (touch não tem hover),
                  só hover no desktop pra não poluir */}
              {p.label && (
                <span className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] text-white bg-slate-950/70 truncate md:opacity-0 md:group-hover:opacity-100 transition pointer-events-none">
                  {p.label}
                </span>
              )}
              {/* Botão delete — sempre visível no mobile, hover-only no desktop.
                  Target maior (p-1.5) e ícone 12 pra ficar tocável. */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleDelete(p.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDelete(p.id);
                  }
                }}
                className="absolute top-1 right-1 bg-red-500/90 md:hover:bg-red-500 active:bg-red-600 text-white rounded p-1.5 md:p-1 md:opacity-0 md:group-hover:opacity-100 transition cursor-pointer"
                aria-label="Remover do banco"
              >
                <Trash2 size={12} className="md:size-2.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {/* Botão adicionar imagem ao banco */}
      <label
        htmlFor="image-bank-upload"
        className={cn(
          'flex items-center justify-center gap-2 w-full rounded-lg border border-dashed py-2.5 cursor-pointer transition text-sm',
          uploading
            ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300'
            : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200',
        )}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Adicionando…
          </>
        ) : (
          <>
            <Plus size={14} />
            Adicionar à categoria{' '}
            <strong>{CATEGORIES.find((c) => c.id === activeCategory)?.label}</strong>
          </>
        )}
      </label>
      <input
        ref={fileInputRef}
        id="image-bank-upload"
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        disabled={uploading}
        className="hidden"
      />
    </div>
  );
}

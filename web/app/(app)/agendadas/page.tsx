'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  X,
  Send,
  AlertCircle,
  Pencil,
  Upload,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  messages as messagesApi,
  uploads as uploadsApi,
  type Message,
} from '@/lib/api';
import { ImageBank } from '@/components/image-bank';
import { CardSkeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';

type ImageTab = 'bank' | 'upload';

export default function AgendadasPage() {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    const list = await messagesApi.list({ status: 'SCHEDULED' });
    setItems(list);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      ),
    [items],
  );

  async function handleCancel(id: string) {
    if (!confirm('Cancelar essa mensagem? Não vai ser enviada.')) return;
    setCancelling(id);
    try {
      await messagesApi.cancel(id);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar');
    } finally {
      setCancelling(null);
    }
  }

  const editingMessage = items.find((m) => m.id === editingId);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Agendadas</h1>
          <p className="text-sm text-slate-400">
            {items.length === 0
              ? 'Nenhuma mensagem agendada'
              : `${items.length} mensagem${items.length > 1 ? 's' : ''} aguardando envio`}
          </p>
        </div>
        <Link
          href="/nova-mensagem"
          className="px-4 min-h-[44px] sm:min-h-0 sm:py-2 rounded-lg bg-emerald-500 md:hover:bg-emerald-600 active:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Send size={14} />
          Nova mensagem
        </Link>
      </header>

      {loading && (
        <ul className="space-y-3" aria-label="Carregando mensagens agendadas">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </ul>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Clock size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nenhuma mensagem agendada.</p>
          <p className="text-xs text-slate-500 mt-1">
            Quando você agendar, aparece aqui com countdown ao vivo.
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="space-y-3">
          {sorted.map((m) => {
            const scheduledDate = new Date(m.scheduledFor);
            const diff = scheduledDate.getTime() - now.getTime();
            const isPast = diff < 0;
            const overdue = isPast && Math.abs(diff) > 60_000;

            return (
              <li
                key={m.id}
                className="bg-slate-900 rounded-xl border border-slate-800 p-4 md:hover:border-emerald-500/30 transition"
              >
                {/* Mobile: stack vertical. Desktop (sm+): 3 colunas lado a lado. */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                  <div className="sm:w-32 sm:shrink-0 flex sm:block items-center gap-2">
                    <p className="text-sm font-medium text-slate-300">
                      {scheduledDate.toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </p>
                    <p className="text-lg font-semibold text-slate-100">
                      {scheduledDate.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p
                      className={cn(
                        'text-xs sm:mt-1 ml-auto sm:ml-0',
                        overdue
                          ? 'text-red-400 font-medium flex items-center gap-1'
                          : isPast
                            ? 'text-amber-400'
                            : 'text-slate-500',
                      )}
                    >
                      {overdue && <AlertCircle size={12} />}
                      {formatDelta(diff)}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mb-1">
                      <span>
                        {m.destinationType === 'ANNOUNCEMENT_CHANNEL' && '📢 '}
                        {m.destinationType === 'GROUP' && '💬 '}
                        {m.destinationType === 'MULTI_GROUP' && '💬 '}
                        {m.targets.map((t) => t.group.name).join(' · ')}
                      </span>
                      <span className="text-slate-700 hidden sm:inline">·</span>
                      <span>{m.instance.name}</span>
                    </div>
                    <p className="text-sm text-slate-200 line-clamp-2 whitespace-pre-wrap">
                      {m.content}
                    </p>
                    {m.imageUrl && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <ImageIcon size={10} /> com imagem
                      </p>
                    )}
                  </div>

                  {/* Mobile: botões horizontais full-width. Desktop: stack vertical à direita. */}
                  <div className="flex sm:flex-col gap-2 sm:shrink-0">
                    <button
                      onClick={() => setEditingId(m.id)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 min-h-[40px] sm:min-h-0 sm:py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-sm sm:text-xs text-slate-300 md:hover:bg-emerald-500/10 md:hover:border-emerald-500/40 md:hover:text-emerald-300 active:bg-slate-800 transition"
                    >
                      <Pencil size={14} className="sm:hidden" />
                      <Pencil size={12} className="hidden sm:inline" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleCancel(m.id)}
                      disabled={cancelling === m.id}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 min-h-[40px] sm:min-h-0 sm:py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-sm sm:text-xs text-slate-300 md:hover:bg-red-500/10 md:hover:border-red-500/40 md:hover:text-red-400 active:bg-slate-800 transition disabled:opacity-50"
                    >
                      <X size={14} className="sm:hidden" />
                      <X size={12} className="hidden sm:inline" />
                      {cancelling === m.id ? 'Cancelando…' : 'Cancelar'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {overdueCount(sorted, now) > 0 && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-200">
          <p className="font-medium mb-1">⚠️ Mensagens atrasadas</p>
          <p>
            Tem {overdueCount(sorted, now)} mensagem(ns) que já passaram da hora mas ainda
            não foram enviadas. Provavelmente o cron-job.org/GitHub Actions não tá batendo
            no nosso worker.
          </p>
        </div>
      )}

      {editingMessage && (
        <EditModal
          message={editingMessage}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal de edição ────────────────────────────────────────────────────

function EditModal({
  message,
  onClose,
  onSaved,
}: {
  message: Message;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialDate = new Date(message.scheduledFor);

  const [content, setContent] = useState(message.content);
  const [nickname, setNickname] = useState(message.nickname ?? '');
  const [imageUrl, setImageUrl] = useState(message.imageUrl ?? '');
  const [imageTab, setImageTab] = useState<ImageTab>('bank');
  const [mentionAll, setMentionAll] = useState<boolean>(message.mentionAll);
  const [scheduleDate, setScheduleDate] = useState(
    initialDate.toISOString().slice(0, 10),
  );
  const [scheduleTime, setScheduleTime] = useState(
    initialDate.toTimeString().slice(0, 5),
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newScheduledFor = useMemo(
    () => new Date(`${scheduleDate}T${scheduleTime}:00`),
    [scheduleDate, scheduleTime],
  );

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadsApi.image(file);
      setImageUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await messagesApi.update(message.id, {
        content,
        scheduledFor: newScheduledFor.toISOString(),
        // null se removida, string nova se trocou, manter atual se não mexeu
        imageUrl: imageUrl ? imageUrl : message.imageUrl ? null : undefined,
        mentionAll,
        // Edição: aceita vazio (mensagens legadas podem não ter apelido).
        // Mas se tem texto, normaliza com trim. Se vazio, manda null
        // pra deixar o backend manter o estado atual coerente.
        nickname: nickname.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90dvh] overflow-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Editar mensagem</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Destino: {message.targets.map((t) => t.group.name).join(', ')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 md:hover:text-slate-300 active:bg-slate-800 rounded-lg p-2 -mr-1"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Apelido */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Apelido <span className="text-red-400 normal-case">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="ex: bilhete007"
              maxLength={80}
              className={cn(
                'w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1',
                nickname.trim()
                  ? 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500'
                  : 'border-amber-500/40 focus:border-amber-500 focus:ring-amber-500',
              )}
            />
            {!nickname.trim() && (
              <p className="text-xs text-amber-400/80 mt-1">
                ⚠️ Sem apelido a tip fica difícil de identificar no histórico.
                Recomendado preencher antes de salvar.
              </p>
            )}
          </div>

          {/* Conteúdo */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Conteúdo
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1 text-right">
              {content.length} / 4096
            </p>
          </div>

          {/* Imagem */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
              Imagem
            </label>
            {imageUrl ? (
              <div className="relative inline-block">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="rounded-lg border border-slate-700 max-h-40"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute -top-2 -right-2 bg-red-500 md:hover:bg-red-600 active:bg-red-700 text-white rounded-full p-2 shadow-lg"
                  aria-label="Remover imagem"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-1 mb-3 border-b border-slate-800">
                  <button
                    type="button"
                    onClick={() => setImageTab('bank')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition border-b-2 -mb-px',
                      imageTab === 'bank'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Banco de imagens
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageTab('upload')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition border-b-2 -mb-px',
                      imageTab === 'upload'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Subir nova
                  </button>
                </div>

                {imageTab === 'bank' ? (
                  <ImageBank onSelect={(url) => setImageUrl(url)} />
                ) : (
                  <>
                    <label
                      htmlFor="edit-image-upload"
                      className={cn(
                        'flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed py-6 cursor-pointer transition',
                        uploading
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-slate-700 bg-slate-900/50 hover:border-slate-600',
                      )}
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={20} className="text-emerald-400 animate-spin" />
                          <span className="text-sm text-slate-400">Enviando…</span>
                        </>
                      ) : (
                        <>
                          <Upload size={20} className="text-slate-500" />
                          <span className="text-sm text-slate-300">
                            Clique pra subir imagem (JPG/PNG, até 5MB)
                          </span>
                        </>
                      )}
                    </label>
                    <input
                      ref={fileInputRef}
                      id="edit-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelected}
                      disabled={uploading}
                      className="hidden"
                    />
                  </>
                )}
              </>
            )}
          </div>

          {/* Mencionar todos — desativado até API oficial */}

          {/* Horário */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Reagendar
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full sm:w-auto rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full sm:w-auto rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <span className="text-xs text-slate-500">
                {formatDelta(newScheduledFor.getTime() - Date.now())}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer — mobile: stack vertical (primário em cima pra ficar
            na zona do polegar). Desktop: alinhado à direita. */}
        <div className="sticky bottom-0 bg-slate-900 px-6 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto px-4 min-h-[44px] sm:min-h-0 sm:py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-300 md:hover:bg-slate-800 active:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading || !content.trim()}
            className="w-full sm:w-auto px-4 min-h-[44px] sm:min-h-0 sm:py-2 rounded-lg bg-emerald-500 md:hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium"
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDelta(diffMs: number): string {
  if (diffMs < 0) {
    const overdue = Math.abs(diffMs);
    const overdueMin = Math.floor(overdue / 60000);
    if (overdueMin < 1) return 'agora';
    if (overdueMin < 60) return `${overdueMin}min atrasada`;
    const overdueH = Math.floor(overdueMin / 60);
    return `${overdueH}h atrasada`;
  }
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'em <1min';
  if (min < 60) return `em ${min}min`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  if (h < 24) return `em ${h}h${remMin > 0 ? ` ${remMin}min` : ''}`;
  const d = Math.floor(h / 24);
  return `em ${d}d ${h % 24}h`;
}

function overdueCount(items: Message[], now: Date): number {
  return items.filter((m) => {
    const diff = new Date(m.scheduledFor).getTime() - now.getTime();
    return diff < -60000;
  }).length;
}

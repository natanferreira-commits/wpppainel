'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Calendar,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Upload,
  X,
  Loader2,
} from 'lucide-react';
import {
  instances as instancesApi,
  messages as messagesApi,
  uploads as uploadsApi,
  getCurrentUser,
  type Instance,
  type Group,
  type DestinationType,
} from '@/lib/api';
import { WhatsAppPreview } from '@/components/whatsapp-preview';
import { ImageBank } from '@/components/image-bank';
import { MESSAGE_TEMPLATE } from '@/lib/templates';
import { cn } from '@/lib/cn';

type ImageTab = 'bank' | 'upload';

type Mode = 'now' | 'scheduled';

export default function NovaMensagemPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // dados remotos
  const [instances, setInstances] = useState<Instance[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  // estado do formulário
  const [instanceId, setInstanceId] = useState<string>('');
  const [communityId, setCommunityId] = useState<string>('');
  const [destinationType, setDestinationType] =
    useState<DestinationType>('ANNOUNCEMENT_CHANNEL');
  const [groupId, setGroupId] = useState<string>('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [content, setContent] = useState<string>(MESSAGE_TEMPLATE);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageTab, setImageTab] = useState<ImageTab>('bank');
  const [mentionAll, setMentionAll] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<Mode>('scheduled');
  const [scheduleDate, setScheduleDate] = useState<string>(defaultTomorrow().date);
  const [scheduleTime, setScheduleTime] = useState<string>(defaultTomorrow().time);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // carrega instâncias
  useEffect(() => {
    instancesApi
      .list()
      .then((list) => {
        setInstances(list);
        if (list[0]) setInstanceId(list[0].id);
      })
      .catch((err) => setFeedback({ type: 'error', text: err.message }));
  }, []);

  // carrega grupos quando instância muda
  useEffect(() => {
    if (!instanceId) return;
    instancesApi
      .groups(instanceId)
      .then(setGroups)
      .catch((err) => setFeedback({ type: 'error', text: err.message }));
  }, [instanceId]);

  const selectedInstance = instances.find((i) => i.id === instanceId);
  const availableCommunities = selectedInstance?.communities ?? [];

  useEffect(() => {
    if (availableCommunities.length === 0) {
      setCommunityId('');
      return;
    }
    if (!availableCommunities.find((c) => c.id === communityId)) {
      setCommunityId(availableCommunities[0].id);
    }
  }, [availableCommunities, communityId]);

  const community = availableCommunities.find((c) => c.id === communityId);
  const groupsOfCommunity = groups.filter((g) => g.community?.id === communityId);
  const announcementChannel = groupsOfCommunity.find((g) => g.isAnnouncementChannel);
  const regularGroups = groupsOfCommunity.filter((g) => !g.isAnnouncementChannel);

  const destinationLabel = useMemo(() => {
    if (destinationType === 'ANNOUNCEMENT_CHANNEL') {
      return community ? `📢 ${community.name} · canal de anúncios` : 'Canal de anúncios';
    }
    if (destinationType === 'GROUP') {
      const g = groups.find((x) => x.id === groupId);
      return g ? `💬 ${g.name}` : 'Selecione o grupo';
    }
    if (destinationType === 'MULTI_GROUP') {
      return `💬 ${groupIds.length} grupos selecionados`;
    }
    return '';
  }, [destinationType, community, groups, groupId, groupIds]);

  const scheduledForDate = useMemo(() => {
    if (mode === 'now') return new Date();
    return new Date(`${scheduleDate}T${scheduleTime}:00`);
  }, [mode, scheduleDate, scheduleTime]);

  function toggleGroupInMulti(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const result = await uploadsApi.image(file);
      setImageUrl(result.url);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro no upload',
      });
    } finally {
      setUploading(false);
      // limpa o input pra permitir re-upload do mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveImage() {
    setImageUrl('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      router.replace('/login');
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        instanceId,
        destinationType,
        content,
        createdById: user.id,
        mentionAll,
        ...(imageUrl ? { imageUrl } : {}),
        ...(mode === 'scheduled' ? { scheduledFor: scheduledForDate.toISOString() } : {}),
        ...(destinationType === 'ANNOUNCEMENT_CHANNEL' && community
          ? { communityId: community.id }
          : {}),
        ...(destinationType === 'GROUP' && groupId ? { groupId } : {}),
        ...(destinationType === 'MULTI_GROUP' && groupIds.length ? { groupIds } : {}),
      };

      const created = await messagesApi.create(payload);

      // O backend agora dispara síncrono em "enviar agora": retorna
      // SENT (sucesso), FAILED (erro Z-API) ou SCHEDULED (futuro).
      if (created.status === 'SENT') {
        setFeedback({
          type: 'ok',
          text: '✅ Enviada com sucesso!',
        });
      } else if (created.status === 'FAILED') {
        setFeedback({
          type: 'error',
          text: `❌ Falhou no envio: ${created.lastError ?? 'erro desconhecido'}`,
        });
      } else if (created.status === 'SCHEDULED') {
        setFeedback({
          type: 'ok',
          text: `🕒 Agendada pra ${scheduledForDate.toLocaleString('pt-BR')}. O worker dispara no horário.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Mensagem criada (status ${created.status}).`,
        });
      }

      if (created.status !== 'FAILED') {
        setContent(MESSAGE_TEMPLATE);
        setImageUrl('');
        setMentionAll(false);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao salvar',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Nova mensagem</h1>
        <p className="text-sm text-slate-400">
          Escreva, escolha o destino e envie agora ou agende pra depois.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          {/* ① Instância */}
          <Section number="①" title="De qual número?">
            <select
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              required
            >
              {instances.length === 0 && <option value="">— sem instâncias —</option>}
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.phoneNumber ? `· ${i.phoneNumber}` : ''}
                </option>
              ))}
            </select>
            {selectedInstance && (
              <p className="text-xs text-slate-500 mt-2">
                Status:{' '}
                <span
                  className={cn(
                    'font-medium',
                    selectedInstance.status === 'CONNECTED'
                      ? 'text-emerald-400'
                      : 'text-red-400',
                  )}
                >
                  {selectedInstance.status === 'CONNECTED'
                    ? '🟢 conectada'
                    : '🔴 ' + selectedInstance.status}
                </span>
              </p>
            )}
          </Section>

          {/* ② Destino */}
          <Section number="②" title="Para onde?">
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
                Comunidade
              </label>
              {availableCommunities.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  Nenhuma comunidade cadastrada — clique em "Sincronizar grupos" em /instancias
                </p>
              ) : (
                <select
                  value={communityId}
                  onChange={(e) => setCommunityId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  {availableCommunities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.membersCount
                        ? ` · ${c.membersCount.toLocaleString('pt-BR')} membros`
                        : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <RadioCard
                checked={destinationType === 'ANNOUNCEMENT_CHANNEL'}
                onChange={() => setDestinationType('ANNOUNCEMENT_CHANNEL')}
                title="📢 Canal de anúncios"
                subtitle={
                  community
                    ? `${community.name} · ${
                        community.membersCount?.toLocaleString('pt-BR') ?? '?'
                      } membros`
                    : 'Selecione uma comunidade primeiro'
                }
                disabled={!community}
              />
              <RadioCard
                checked={destinationType === 'GROUP'}
                onChange={() => setDestinationType('GROUP')}
                title="💬 Grupo específico"
                subtitle={
                  regularGroups.length === 0
                    ? 'Sem grupos regulares (só canais de anúncios)'
                    : 'Mensagem só pra um grupo'
                }
                disabled={regularGroups.length === 0}
              />
              <RadioCard
                checked={destinationType === 'MULTI_GROUP'}
                onChange={() => setDestinationType('MULTI_GROUP')}
                title="💬 Vários grupos"
                subtitle={
                  regularGroups.length === 0
                    ? 'Sem grupos regulares disponíveis'
                    : 'Mesmo conteúdo em múltiplos grupos'
                }
                disabled={regularGroups.length === 0}
              />
            </div>

            {destinationType === 'GROUP' && regularGroups.length > 0 && (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                required
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">— selecione o grupo —</option>
                {regularGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.membersCount ?? '?'} membros)
                  </option>
                ))}
              </select>
            )}

            {destinationType === 'MULTI_GROUP' && regularGroups.length > 0 && (
              <div className="mt-3 space-y-1.5 border border-slate-700 bg-slate-900 rounded-lg p-2 max-h-44 overflow-auto">
                {regularGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={() => toggleGroupInMulti(g.id)}
                      className="rounded border-slate-600 text-emerald-500 bg-slate-800"
                    />
                    <span className="text-sm text-slate-200">{g.name}</span>
                    <span className="text-xs text-slate-500 ml-auto">
                      {g.membersCount ?? '?'} membros
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Section>

          {/* ③ Conteúdo */}
          <Section number="③" title="Conteúdo">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                '🎯 *PALPITE DA NOITE*\nBrasil x Argentina · 21:30\n\nMais de 2.5 gols → odd 1.85'
              }
              rows={8}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
              <span>
                Markdown WhatsApp:{' '}
                <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                  *negrito*
                </code>{' '}
                <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                  _itálico_
                </code>{' '}
                <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                  ~tachado~
                </code>
              </span>
              <span className="ml-auto">{content.length} / 4096</span>
            </div>

            {/* Imagem (opcional) — banco ou upload novo */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                Imagem (opcional)
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
                    onClick={handleRemoveImage}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg"
                    aria-label="Remover imagem"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {/* Tabs Banco / Subir novo */}
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
                        htmlFor="image-upload"
                        className={cn(
                          'flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed py-8 cursor-pointer transition',
                          uploading
                            ? 'border-emerald-500/50 bg-emerald-500/5'
                            : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900',
                        )}
                      >
                        {uploading ? (
                          <>
                            <Loader2 size={24} className="text-emerald-400 animate-spin" />
                            <span className="text-sm text-slate-400">Enviando…</span>
                          </>
                        ) : (
                          <>
                            <Upload size={24} className="text-slate-500" />
                            <span className="text-sm text-slate-300">
                              Clique pra subir imagem
                            </span>
                            <span className="text-xs text-slate-500">
                              JPG, PNG, WebP ou GIF · até 5MB
                            </span>
                          </>
                        )}
                      </label>
                      <input
                        ref={fileInputRef}
                        id="image-upload"
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

            {/* Mencionar todos */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={mentionAll}
                  onChange={(e) => setMentionAll(e.target.checked)}
                  className="mt-0.5 rounded border-slate-600 bg-slate-800 text-emerald-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    Mencionar todos os membros
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mentionAll ? (
                      <span className="text-amber-300">
                        ⚠️ Cada membro do canal/grupo recebe uma notificação push
                        individual. Use só pra anúncios importantes.
                      </span>
                    ) : (
                      'Sem isso, mensagem chega normal (só notifica quem não silenciou).'
                    )}
                  </p>
                </div>
              </label>
            </div>
          </Section>

          {/* ④ Quando */}
          <Section number="④" title="Quando?">
            <div className="space-y-2">
              <RadioCard
                checked={mode === 'now'}
                onChange={() => setMode('now')}
                title="Enviar agora"
                subtitle="Despacha assim que o worker rodar"
                icon={<Send size={16} />}
              />
              <RadioCard
                checked={mode === 'scheduled'}
                onChange={() => setMode('scheduled')}
                title="Agendar"
                subtitle="Programa pra horário futuro"
                icon={<Calendar size={16} />}
              />
            </div>

            {mode === 'scheduled' && (
              <div className="mt-3 flex gap-2 items-center">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
                <p className="text-xs text-slate-500 self-center">
                  {formatDelta(scheduledForDate)}
                </p>
              </div>
            )}
          </Section>

          {/* feedback + submit */}
          {feedback && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg px-4 py-3 text-sm border',
                feedback.type === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30',
              )}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 size={16} className="mt-0.5" />
              ) : (
                <AlertCircle size={16} className="mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push('/historico')}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !instanceId || !content.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium"
            >
              {submitting
                ? 'Salvando…'
                : mode === 'now'
                  ? 'Enviar agora'
                  : 'Salvar agendamento'}
            </button>
          </div>
        </form>

        {/* Preview (2/5) */}
        <div className="lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
            Preview
          </p>
          <WhatsAppPreview
            content={content}
            imageUrl={imageUrl}
            destinationLabel={destinationLabel}
            scheduledFor={mode === 'scheduled' ? scheduledForDate : null}
          />
        </div>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h2 className="text-sm font-semibold text-slate-100 mb-3">
        <span className="text-emerald-400 mr-2">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function RadioCard({
  checked,
  onChange,
  title,
  subtitle,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition',
        disabled
          ? 'border-slate-800 bg-slate-900/50 cursor-not-allowed opacity-50'
          : checked
            ? 'border-emerald-500 bg-emerald-500/10 cursor-pointer'
            : 'border-slate-800 bg-slate-900 hover:bg-slate-800/50 cursor-pointer',
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="text-emerald-500 bg-slate-800 border-slate-600 disabled:cursor-not-allowed"
      />
      {icon && <span className="text-slate-400">{icon}</span>}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </label>
  );
}

function defaultTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 30, 0, 0);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
  };
}

function formatDelta(target: Date): string {
  const diff = target.getTime() - Date.now();
  if (diff < 0) return '⚠️ no passado';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `em ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `em ${hours}h${mins ? ` ${mins}min` : ''}`;
  const days = Math.floor(hours / 24);
  return `em ${days}d ${hours % 24}h`;
}

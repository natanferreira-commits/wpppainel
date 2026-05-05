'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Calendar, Image as ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  instances as instancesApi,
  messages as messagesApi,
  getCurrentUser,
  type Instance,
  type Group,
  type DestinationType,
} from '@/lib/api';
import { WhatsAppPreview } from '@/components/whatsapp-preview';
import { cn } from '@/lib/cn';

type Mode = 'now' | 'scheduled';

export default function NovaMensagemPage() {
  const router = useRouter();
  const user = getCurrentUser();

  // dados remotos
  const [instances, setInstances] = useState<Instance[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  // estado do formulário
  const [instanceId, setInstanceId] = useState<string>('');
  const [destinationType, setDestinationType] = useState<DestinationType>('ANNOUNCEMENT_CHANNEL');
  const [groupId, setGroupId] = useState<string>('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [content, setContent] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [mode, setMode] = useState<Mode>('scheduled');
  const [scheduleDate, setScheduleDate] = useState<string>(defaultTomorrow().date);
  const [scheduleTime, setScheduleTime] = useState<string>(defaultTomorrow().time);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

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
  const community = selectedInstance?.communities[0]; // MVP: 1 comunidade por instância
  const announcementChannel = groups.find((g) => g.isAnnouncementChannel);
  const regularGroups = groups.filter((g) => !g.isAnnouncementChannel);

  // preview: derivar label e horário previstos
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
        ...(imageUrl ? { imageUrl } : {}),
        ...(mode === 'scheduled' ? { scheduledFor: scheduledForDate.toISOString() } : {}),
        ...(destinationType === 'ANNOUNCEMENT_CHANNEL' && community
          ? { communityId: community.id }
          : {}),
        ...(destinationType === 'GROUP' && groupId ? { groupId } : {}),
        ...(destinationType === 'MULTI_GROUP' && groupIds.length ? { groupIds } : {}),
      };

      const created = await messagesApi.create(payload);

      setFeedback({
        type: 'ok',
        text:
          mode === 'now'
            ? `Mensagem criada (id ${created.id.slice(0, 8)}…). Worker vai despachar no próximo round.`
            : `Agendada pra ${scheduledForDate.toLocaleString('pt-BR')}.`,
      });

      // limpa só o conteúdo — mantém destino pra agilidade no agendamento em batch
      setContent('');
      setImageUrl('');
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
        <h1 className="text-2xl font-semibold text-slate-900">Nova mensagem</h1>
        <p className="text-sm text-slate-500">
          Escreva, escolha o destino e envie agora ou agende pra depois.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Formulário (3/5) */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          {/* ① Instância */}
          <Section number="①" title="De qual número?">
            <select
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
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
                    selectedInstance.status === 'CONNECTED' ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {selectedInstance.status === 'CONNECTED' ? '🟢 conectada' : '🔴 ' + selectedInstance.status}
                </span>
              </p>
            )}
          </Section>

          {/* ② Destino */}
          <Section number="②" title="Para onde dentro da comunidade?">
            <div className="space-y-2">
              <RadioCard
                checked={destinationType === 'ANNOUNCEMENT_CHANNEL'}
                onChange={() => setDestinationType('ANNOUNCEMENT_CHANNEL')}
                title="📢 Canal de anúncios"
                subtitle={
                  community
                    ? `${community.name} · ${community.membersCount?.toLocaleString('pt-BR') ?? '?'} membros`
                    : 'Comunidade não cadastrada'
                }
              />
              <RadioCard
                checked={destinationType === 'GROUP'}
                onChange={() => setDestinationType('GROUP')}
                title="💬 Grupo específico"
                subtitle="Mensagem só pra um grupo"
              />
              <RadioCard
                checked={destinationType === 'MULTI_GROUP'}
                onChange={() => setDestinationType('MULTI_GROUP')}
                title="💬 Vários grupos"
                subtitle="Mesmo conteúdo em múltiplos grupos"
              />
            </div>

            {destinationType === 'GROUP' && (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                required
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">— selecione o grupo —</option>
                {regularGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.membersCount ?? '?'} membros)
                  </option>
                ))}
              </select>
            )}

            {destinationType === 'MULTI_GROUP' && (
              <div className="mt-3 space-y-1.5 border border-slate-200 rounded-lg p-2 max-h-44 overflow-auto">
                {regularGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={() => toggleGroupInMulti(g.id)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span className="text-sm">{g.name}</span>
                    <span className="text-xs text-slate-400 ml-auto">
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
              placeholder={'🎯 *PALPITE DA NOITE*\nBrasil x Argentina · 21:30\n\nMais de 2.5 gols → odd 1.85'}
              rows={8}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
              <span>
                Markdown WhatsApp: <code className="bg-slate-100 px-1">*negrito*</code>{' '}
                <code className="bg-slate-100 px-1">_itálico_</code>{' '}
                <code className="bg-slate-100 px-1">~tachado~</code>
              </span>
              <span className="ml-auto">{content.length} / 4096</span>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <ImageIcon size={14} />
              Imagem (URL):
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
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
              <div className="mt-3 flex gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                'flex items-start gap-2 rounded-lg px-4 py-3 text-sm',
                feedback.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200',
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
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !instanceId || !content.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium"
            >
              {submitting ? 'Salvando…' : mode === 'now' ? 'Enviar agora' : 'Salvar agendamento'}
            </button>
          </div>
        </form>

        {/* Preview (2/5) */}
        <div className="lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-400 font-medium mb-2">
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

// ─── helpers ─────────────────────────────────────────────────────────────

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
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">
        <span className="text-emerald-600 mr-2">{number}</span>
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
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition',
        checked
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 hover:bg-slate-50',
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="text-emerald-600"
      />
      {icon && <span className="text-slate-500">{icon}</span>}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, X, Send, AlertCircle } from 'lucide-react';
import { messages as messagesApi, type Message } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function AgendadasPage() {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [cancelling, setCancelling] = useState<string | null>(null);

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

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6 flex items-start justify-between">
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
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2"
        >
          <Send size={14} />
          Nova mensagem
        </Link>
      </header>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

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
                className="bg-slate-900 rounded-xl border border-slate-800 p-4 hover:border-emerald-500/30 transition"
              >
                <div className="flex items-start gap-4">
                  <div className="w-32 shrink-0">
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
                        'text-xs mt-1',
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
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <span>
                        {m.destinationType === 'ANNOUNCEMENT_CHANNEL' && '📢 '}
                        {m.destinationType === 'GROUP' && '💬 '}
                        {m.destinationType === 'MULTI_GROUP' && '💬 '}
                        {m.targets.map((t) => t.group.name).join(' · ')}
                      </span>
                      <span className="text-slate-700">·</span>
                      <span>{m.instance.name}</span>
                    </div>
                    <p className="text-sm text-slate-200 line-clamp-2 whitespace-pre-wrap">
                      {m.content}
                    </p>
                    {m.imageUrl && (
                      <p className="text-xs text-slate-500 mt-1">📎 com imagem</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleCancel(m.id)}
                      disabled={cancelling === m.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition disabled:opacity-50"
                    >
                      <X size={12} />
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
            não foram enviadas. Provavelmente o cron-job.org não tá batendo no nosso
            worker. Confere se o cronjob tá ativo em{' '}
            <a
              href="https://cron-job.org"
              target="_blank"
              rel="noreferrer"
              className="underline text-amber-100"
            >
              cron-job.org
            </a>
            .
          </p>
        </div>
      )}
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

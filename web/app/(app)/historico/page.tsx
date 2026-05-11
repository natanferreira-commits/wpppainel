'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  messages as messagesApi,
  type Message,
  type TipResult,
} from '@/lib/api';
import { cn } from '@/lib/cn';

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  SCHEDULED: {
    label: '🟡 Agendada',
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  SENDING: {
    label: '🔵 Enviando',
    cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  },
  SENT: {
    label: '🟢 Enviada',
    cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  FAILED: {
    label: '🔴 Falhou',
    cls: 'bg-red-500/10 text-red-300 border-red-500/30',
  },
  CANCELLED: {
    label: '⚫ Cancelada',
    cls: 'bg-slate-700/30 text-slate-400 border-slate-600',
  },
};

const RESULT_OPTIONS: Array<{ value: TipResult; label: string; emoji: string }> = [
  { value: null, label: 'Pendente', emoji: '⏳' },
  { value: 'GREEN', label: 'Green', emoji: '🟢' },
  { value: 'RED', label: 'Red', emoji: '🔴' },
  { value: 'VOID', label: 'Void', emoji: '⚪' },
];

export default function HistoricoPage() {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    messagesApi
      .list()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleResultChange(messageId: string, value: TipResult) {
    setUpdating(messageId);
    try {
      const updated = await messagesApi.update(messageId, { result: value });
      setItems((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, result: updated.result } : m)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar resultado');
    } finally {
      setUpdating(null);
    }
  }

  // Stats: agregação dos resultados
  const stats = useMemo(() => {
    const sent = items.filter((m) => m.status === 'SENT');
    const counts = {
      total: sent.length,
      green: sent.filter((m) => m.result === 'GREEN').length,
      red: sent.filter((m) => m.result === 'RED').length,
      void: sent.filter((m) => m.result === 'VOID').length,
      pending: sent.filter((m) => m.result === null).length,
    };
    const decided = counts.green + counts.red;
    const greenRate = decided > 0 ? (counts.green / decided) * 100 : 0;
    return { ...counts, greenRate };
  }, [items]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Histórico</h1>
          <p className="text-sm text-slate-400">
            Todas as mensagens — agendadas, enviadas, canceladas. Marque o resultado
            das tips quando o jogo terminar.
          </p>
        </div>

        {/* Stats inline */}
        {stats.total > 0 && (
          <div className="flex gap-3 text-xs">
            <Stat label="Tips enviadas" value={stats.total} />
            <Stat label="🟢 Green" value={stats.green} tone="green" />
            <Stat label="🔴 Red" value={stats.red} tone="red" />
            <Stat label="⚪ Void" value={stats.void} />
            <Stat
              label="Acerto"
              value={`${stats.greenRate.toFixed(0)}%`}
              tone={stats.greenRate >= 60 ? 'green' : stats.greenRate >= 50 ? undefined : 'red'}
            />
          </div>
        )}
      </header>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && items.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium">Apelido</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Operador</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const style = STATUS_STYLE[m.status] ?? STATUS_STYLE.SCHEDULED;
                const isSent = m.status === 'SENT';
                return (
                  <tr
                    key={m.id}
                    className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      <p className="font-medium text-slate-200">
                        {new Date(m.scheduledFor).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isSent && m.sentAt
                          ? `enviada ${new Date(m.sentAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : `criada ${new Date(m.createdAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px]">
                      <p className="truncate">
                        {m.destinationType === 'ANNOUNCEMENT_CHANNEL' && '📢 '}
                        {m.destinationType === 'GROUP' && '💬 '}
                        {m.destinationType === 'MULTI_GROUP' && '💬 '}
                        {m.targets.map((t) => t.group.name).join(', ')}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{m.instance.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-200 max-w-xs">
                      {m.nickname ? (
                        <p className="font-medium truncate">{m.nickname}</p>
                      ) : (
                        <p
                          className="text-slate-600 italic text-xs"
                          title={m.content.replace(/\n+/g, ' ').slice(0, 200)}
                        >
                          — sem apelido
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap',
                          style.cls,
                        )}
                      >
                        {style.label}
                      </span>
                      {m.lastError && (
                        <p
                          className="text-xs text-red-400 mt-1 truncate max-w-[200px]"
                          title={m.lastError}
                        >
                          {m.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isSent ? (
                        <ResultSelect
                          value={m.result}
                          disabled={updating === m.id}
                          onChange={(v) => handleResultChange(m.id, v)}
                        />
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {m.createdBy.name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'green' | 'red';
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'font-semibold text-base',
          tone === 'green' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : 'text-slate-100',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ResultSelect({
  value,
  onChange,
  disabled,
}: {
  value: TipResult;
  onChange: (v: TipResult) => void;
  disabled?: boolean;
}) {
  const current = RESULT_OPTIONS.find((o) => o.value === value) ?? RESULT_OPTIONS[0];

  // Cor da borda baseada no resultado atual
  const borderTone =
    value === 'GREEN'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : value === 'RED'
        ? 'border-red-500/40 bg-red-500/10 text-red-300'
        : value === 'VOID'
          ? 'border-slate-600 bg-slate-800 text-slate-300'
          : 'border-slate-700 bg-slate-900 text-slate-400';

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : (v as TipResult));
      }}
      disabled={disabled}
      className={cn(
        'rounded-md border px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-50',
        borderTone,
      )}
    >
      {RESULT_OPTIONS.map((opt) => (
        <option key={opt.value ?? 'pending'} value={opt.value ?? ''}>
          {opt.emoji} {opt.label}
        </option>
      ))}
    </select>
  );
}

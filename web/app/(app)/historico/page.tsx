'use client';

import { useEffect, useState } from 'react';
import { messages as messagesApi, type Message } from '@/lib/api';
import { cn } from '@/lib/cn';

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: '🟡 Agendada', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENDING: { label: '🔵 Enviando', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  SENT: { label: '🟢 Enviada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { label: '🔴 Falhou', cls: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: '⚫ Cancelada', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function HistoricoPage() {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    messagesApi
      .list()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Histórico</h1>
        <p className="text-sm text-slate-500">
          Todas as mensagens criadas — agendadas, enviadas e canceladas.
        </p>
      </header>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Conteúdo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Operador</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const style = STATUS_STYLE[m.status] ?? STATUS_STYLE.SCHEDULED;
                return (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">
                      <p className="font-medium">
                        {new Date(m.scheduledFor).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-slate-400">
                        criada {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>
                        {m.destinationType === 'ANNOUNCEMENT_CHANNEL' && '📢 '}
                        {m.destinationType === 'GROUP' && '💬 '}
                        {m.destinationType === 'MULTI_GROUP' && '💬 '}
                        {m.targets.map((t) => t.group.name).join(', ')}
                      </p>
                      <p className="text-xs text-slate-400">{m.instance.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs">
                      <p className="truncate">{m.content}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                          style.cls,
                        )}
                      >
                        {style.label}
                      </span>
                      {m.lastError && (
                        <p className="text-xs text-red-600 mt-1 truncate max-w-[200px]" title={m.lastError}>
                          {m.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{m.createdBy.name}</td>
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

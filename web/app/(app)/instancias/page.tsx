'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { instances as instancesApi, type Instance } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function InstanciasPage() {
  const [items, setItems] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    instanceId: string;
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  async function reload() {
    const list = await instancesApi.list();
    setItems(list);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleSync(instanceId: string) {
    setSyncing(instanceId);
    setFeedback(null);
    try {
      const result = await instancesApi.sync(instanceId);
      setFeedback({
        instanceId,
        type: 'ok',
        text: `Sincronizou ${result.syncedGroups} grupos da Z-API`,
      });
      await reload();
    } catch (err) {
      setFeedback({
        instanceId,
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao sincronizar',
      });
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Instâncias</h1>
        <p className="text-sm text-slate-400">
          Números WhatsApp conectados ao painel via Z-API.
        </p>
      </header>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      <div className="space-y-3">
        {items.map((inst) => (
          <div
            key={inst.id}
            className="bg-slate-900 rounded-xl border border-slate-800 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-medium text-slate-100">{inst.name}</h3>
                <p className="text-sm text-slate-400">
                  {inst.phoneNumber ?? 'sem número'}
                </p>
                {inst.communities[0] && (
                  <p className="text-xs text-slate-500 mt-1">
                    Comunidade: {inst.communities[0].name} ·{' '}
                    {inst.communities[0].membersCount?.toLocaleString('pt-BR') ?? '?'}{' '}
                    membros
                  </p>
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium px-2 py-1 rounded-md border whitespace-nowrap',
                  inst.status === 'CONNECTED'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-300 border-red-500/30',
                )}
              >
                {inst.status === 'CONNECTED' ? '🟢 Conectado' : '🔴 ' + inst.status}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {feedback?.instanceId === inst.id && (
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      feedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {feedback.type === 'ok' ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <AlertCircle size={12} />
                    )}
                    {feedback.text}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleSync(inst.id)}
                disabled={syncing === inst.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={cn(syncing === inst.id && 'animate-spin')}
                />
                {syncing === inst.id ? 'Sincronizando…' : 'Sincronizar grupos'}
              </button>
            </div>
          </div>
        ))}

        <div className="bg-slate-900/50 border border-dashed border-slate-700 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-500">
            Adicionar nova instância (com QR code via Z-API) — Round 2.5
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { instances as instancesApi, type Instance } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function InstanciasPage() {
  const [items, setItems] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    instancesApi.list().then(setItems).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Instâncias</h1>
        <p className="text-sm text-slate-500">
          Números WhatsApp conectados ao painel via Z-API.
        </p>
      </header>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      <div className="space-y-3">
        {items.map((inst) => (
          <div key={inst.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-slate-900">{inst.name}</h3>
                <p className="text-sm text-slate-500">{inst.phoneNumber ?? 'sem número'}</p>
                {inst.communities[0] && (
                  <p className="text-xs text-slate-400 mt-1">
                    Comunidade: {inst.communities[0].name} ·{' '}
                    {inst.communities[0].membersCount?.toLocaleString('pt-BR') ?? '?'} membros
                  </p>
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium px-2 py-1 rounded-md border',
                  inst.status === 'CONNECTED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200',
                )}
              >
                {inst.status === 'CONNECTED' ? '🟢 Conectado' : '🔴 ' + inst.status}
              </span>
            </div>
          </div>
        ))}

        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-500">
            Adicionar nova instância (com QR code via Z-API) — Round 2
          </p>
        </div>
      </div>
    </div>
  );
}

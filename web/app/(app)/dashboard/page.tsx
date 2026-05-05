'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Send, Calendar, History, Smartphone } from 'lucide-react';
import { instances as instancesApi, messages as messagesApi, type Instance, type Message } from '@/lib/api';

export default function DashboardPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [recent, setRecent] = useState<Message[]>([]);

  useEffect(() => {
    instancesApi.list().then(setInstances).catch(() => {});
    messagesApi.list({ limit: 5 }).then(setRecent).catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Início</h1>
        <p className="text-sm text-slate-500">Visão geral do painel</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Instâncias"
          value={instances.length}
          sub={`${instances.filter((i) => i.status === 'CONNECTED').length} conectadas`}
          href="/instancias"
          icon={<Smartphone size={20} />}
        />
        <Stat
          label="Mensagens"
          value={recent.length}
          sub="últimas 5"
          href="/historico"
          icon={<History size={20} />}
        />
        <Stat
          label="Nova mensagem"
          value="✉️"
          sub="enviar / agendar"
          href="/nova-mensagem"
          icon={<Send size={20} />}
        />
        <Stat
          label="Calendário"
          value="📅"
          sub="visão semanal"
          href="/calendario"
          icon={<Calendar size={20} />}
        />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Últimas mensagens</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                <span className="truncate flex-1">{m.content}</span>
                <span className="text-xs text-slate-400 ml-3">{m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-500 hover:shadow-sm transition"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </Link>
  );
}

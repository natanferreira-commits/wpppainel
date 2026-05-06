'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Send,
  Calendar,
  Clock,
  History,
  Smartphone,
  Users,
  LogOut,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCurrentUser, messages as messagesApi } from '@/lib/api';

const items = [
  { href: '/nova-mensagem', label: 'Nova Mensagem', icon: Send },
  { href: '/agendadas', label: 'Agendadas', icon: Clock, badge: 'scheduled' },
  { href: '/calendario', label: 'Calendário', icon: Calendar },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/insights', label: 'Insights', icon: TrendingUp },
  { href: '/instancias', label: 'Instâncias', icon: Smartphone },
  { href: '/operadores', label: 'Operadores', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const [scheduledCount, setScheduledCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const list = await messagesApi.list({ status: 'SCHEDULED', limit: 100 });
        if (alive) setScheduledCount(list.length);
      } catch {
        // silencioso
      }
    }
    refresh();
    const i = setInterval(refresh, 60_000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, []);

  function logout() {
    localStorage.removeItem('painel-token');
    localStorage.removeItem('painel-user');
    router.replace('/login');
  }

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-800">
        <h1 className="font-semibold text-slate-100">Painel Dupla</h1>
        <p className="text-xs text-slate-500">Grupo Dupla</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          const showBadge =
            item.badge === 'scheduled' && scheduledCount !== null && scheduledCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                active
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
              )}
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                    active
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-300',
                  )}
                >
                  {scheduledCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        {user && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-100 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-400 mt-1 font-semibold">
              {user.role}
            </p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}

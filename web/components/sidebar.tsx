'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Send,
  Calendar,
  History,
  Smartphone,
  Users,
  LogOut,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCurrentUser } from '@/lib/api';

const items = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/nova-mensagem', label: 'Nova Mensagem', icon: Send },
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

  function logout() {
    localStorage.removeItem('painel-token');
    localStorage.removeItem('painel-user');
    router.replace('/login');
  }

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200">
        <h1 className="font-semibold text-slate-900">Painel Dupla</h1>
        <p className="text-xs text-slate-500">Grupo Dupla</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                active
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        {user && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-600 mt-1">
              {user.role}
            </p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}

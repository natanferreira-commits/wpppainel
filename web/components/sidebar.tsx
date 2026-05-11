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
  LogOut,
  TrendingUp,
  Menu,
  X,
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
];

// Navegação principal.
// Desktop (md+): sidebar fixa lateral de 240px, sempre visível.
// Mobile (<md): topbar de 56px + drawer que slide-in pela esquerda.
//   - Botão hamburguer abre, X dentro do drawer fecha
//   - Click no overlay fecha
//   - Navegar pra outra rota fecha automaticamente (useEffect em pathname)
//   - Tecla ESC fecha
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  // Conta de agendadas pro badge
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

  // Fecha drawer ao mudar de rota (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC fecha drawer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Quando drawer aberto no mobile, trava scroll do body
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  function logout() {
    localStorage.removeItem('painel-token');
    localStorage.removeItem('painel-user');
    router.replace('/login');
  }

  return (
    <>
      {/* ─── Topbar mobile (só <md) ────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-2 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="p-3 text-slate-300 active:bg-slate-800 rounded-lg"
        >
          <Menu size={22} />
        </button>
        <h1 className="font-semibold text-slate-100 text-sm">Painel Dupla</h1>
        <div className="w-12" aria-hidden /> {/* spacer pra centralizar título */}
      </header>

      {/* ─── Overlay (só <md, quando aberto) ───────────────────── */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      {/* ─── Sidebar / Drawer ──────────────────────────────────── */}
      <aside
        className={cn(
          'w-60 bg-slate-900 border-r border-slate-800 flex flex-col',
          // mobile: drawer fixed que slide
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
          // md+: static, sempre visível, sem transform
          'md:static md:translate-x-0 md:z-auto md:transition-none',
        )}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-100">Painel Dupla</h1>
            <p className="text-xs text-slate-500">Grupo Dupla</p>
          </div>
          {/* Botão fechar — só no mobile dentro do drawer */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden p-2 -mr-2 text-slate-400 active:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                  'flex items-center gap-3 px-3 rounded-lg text-sm transition',
                  // 44px de altura no mobile (target acessível),
                  // mais compacto no desktop
                  'min-h-[44px] md:min-h-0 md:py-2',
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                    : 'text-slate-400 md:hover:bg-slate-800/50 md:hover:text-slate-200 active:bg-slate-800',
                )}
              >
                <Icon size={18} />
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
            className="w-full flex items-center gap-3 px-3 rounded-lg text-sm text-slate-400 md:hover:bg-slate-800/50 md:hover:text-slate-200 active:bg-slate-800 transition min-h-[44px] md:min-h-0 md:py-2"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

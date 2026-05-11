'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Send, Clock, History, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { messages as messagesApi } from '@/lib/api';

// Bottom navigation — só visível no mobile (md:hidden).
// As 4 ações mais frequentes ficam na "zona do polegar" (terço inferior
// da tela), padrão Material 3 / Apple HIG. Calendário e Instâncias
// (uso raro) continuam acessíveis via drawer (botão hamburguer).
//
// Padding-bottom no main do layout pra esse nav não cobrir conteúdo.

const items = [
  { href: '/nova-mensagem', label: 'Nova', icon: Send },
  { href: '/agendadas', label: 'Agendadas', icon: Clock, badge: 'scheduled' },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/insights', label: 'Insights', icon: TrendingUp },
];

export function BottomNav() {
  const pathname = usePathname();
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

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800"
      style={{
        // Respeita home indicator do iPhone (safe area inferior)
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Navegação rápida"
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          const showBadge =
            item.badge === 'scheduled' && scheduledCount !== null && scheduledCount > 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-xs transition active:bg-slate-800',
                  active ? 'text-emerald-400' : 'text-slate-400',
                )}
              >
                <span className="relative">
                  <Icon size={20} />
                  {showBadge && (
                    <span
                      className={cn(
                        'absolute -top-1.5 -right-2 text-[9px] font-semibold px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center',
                        active
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-500 text-white',
                      )}
                      aria-label={`${scheduledCount} agendadas`}
                    >
                      {scheduledCount}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'leading-tight',
                    active && 'font-medium',
                  )}
                >
                  {item.label}
                </span>
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full"
                    aria-hidden
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

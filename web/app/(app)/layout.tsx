'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { BottomNav } from '@/components/bottom-nav';
import { getCurrentUser } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    // Mobile: stack vertical (topbar em cima, main abaixo, drawer é overlay,
    //         bottom nav fixo no rodapé).
    // Desktop (md+): flex horizontal com sidebar lateral, sem bottom nav.
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}

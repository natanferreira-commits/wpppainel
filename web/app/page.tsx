'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const user = getCurrentUser();
    router.replace(user ? '/nova-mensagem' : '/login');
  }, [router]);
  return null;
}

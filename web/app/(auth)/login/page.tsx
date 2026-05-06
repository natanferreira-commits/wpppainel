'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('natan@grupodupla.com.br');
  const [password, setPassword] = useState('qualquer-coisa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await auth.login(email);
      localStorage.setItem('painel-token', token);
      localStorage.setItem('painel-user', JSON.stringify(user));
      router.replace('/nova-mensagem');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-5 shadow-xl"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Painel Dupla</h1>
          <p className="text-sm text-slate-400 mt-1">Entre com seu email pra continuar</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Senha <span className="text-slate-500 text-xs">(qualquer coisa em dev)</span>
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 text-sm transition"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Modo dev — qualquer email cria/loga conta automaticamente
        </p>
      </form>
    </main>
  );
}

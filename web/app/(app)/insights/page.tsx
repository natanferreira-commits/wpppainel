'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Users, UserPlus, UserMinus, Flame } from 'lucide-react';
import {
  insights as insightsApi,
  instances as instancesApi,
  type CommunityInsights,
} from '@/lib/api';
import { cn } from '@/lib/cn';

type CommunityOption = {
  id: string;
  name: string;
  membersCount: number | null;
  instanceName: string;
};

export default function InsightsPage() {
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
  const [data, setData] = useState<CommunityInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carrega lista de comunidades disponíveis (de todas as instâncias)
  // e seleciona por padrão a com mais membros (a "principal" da operação)
  useEffect(() => {
    (async () => {
      try {
        const list = await instancesApi.list();
        const all: CommunityOption[] = list.flatMap((inst) =>
          inst.communities.map((c) => ({
            id: c.id,
            name: c.name,
            membersCount: c.membersCount,
            instanceName: inst.name,
          })),
        );

        if (all.length === 0) {
          setError(
            'Nenhuma comunidade cadastrada — sincroniza grupos em /instancias primeiro.',
          );
          setLoading(false);
          return;
        }

        // Ordena pela com mais membros (default cai na principal —
        // ex: ✅ MATEUS CAUMO #1 com 363 ao invés de "teste da zapi" com 2)
        all.sort((a, b) => (b.membersCount ?? 0) - (a.membersCount ?? 0));
        setCommunities(all);
        setSelectedCommunityId(all[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar comunidades');
        setLoading(false);
      }
    })();
  }, []);

  // Quando troca de comunidade, busca insights dela
  useEffect(() => {
    if (!selectedCommunityId) return;
    setLoading(true);
    insightsApi
      .community(selectedCommunityId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [selectedCommunityId]);

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-slate-100 mb-2">Insights</h1>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Insights</h1>
          <p className="text-sm text-slate-400 mt-1">
            Crescimento e churn por mensagem · últimos 7 dias
          </p>
        </div>

        {communities.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Comunidade
            </label>
            <select
              value={selectedCommunityId}
              onChange={(e) => setSelectedCommunityId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 min-w-[260px]"
            >
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.membersCount
                    ? ` · ${c.membersCount.toLocaleString('pt-BR')} membros`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {loading && !data && (
        <p className="text-sm text-slate-500">Carregando insights…</p>
      )}

      {data && <InsightsContent data={data} />}
    </div>
  );
}

function InsightsContent({ data }: { data: CommunityInsights }) {
  const growthIsPositive = data.summary.growth7dPct >= 0;
  const hasMetrics = data.growthSeries.length > 0;
  const hasBurners = data.topBurners.length > 0;

  return (
    <>
      {!hasMetrics && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-200">
          🟡 <strong>Sem snapshots ainda</strong> — cada vez que você roda
          "Sincronizar grupos" em <code className="bg-slate-900 px-1 rounded">/instancias</code>,
          a gente cria 1 snapshot do dia. Pra ter o gráfico de crescimento, precisa
          de pelo menos 2 snapshots em dias diferentes (o cron-job.org/GitHub
          Actions também sincroniza diariamente quando estiver ativo).
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card
          icon={<Users size={18} />}
          label="Membros agora"
          value={data.summary.membersNow.toLocaleString('pt-BR')}
          sub="canal de anúncios"
        />
        <Card
          icon={growthIsPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          label="Crescimento 7d"
          value={`${growthIsPositive ? '+' : ''}${data.summary.growth7d}`}
          sub={`${growthIsPositive ? '+' : ''}${data.summary.growth7dPct.toFixed(1)}%`}
          tone={growthIsPositive ? 'positive' : 'negative'}
        />
        <Card
          icon={<UserMinus size={18} />}
          label="Churn 7d"
          value={`${data.summary.churn7dPct.toFixed(1)}%`}
          sub={`${data.summary.lefts7d} saídas`}
          tone={data.summary.churn7dPct > 3 ? 'negative' : 'neutral'}
        />
        <Card
          icon={<UserPlus size={18} />}
          label="Entradas 7d"
          value={`+${data.summary.joins7d}`}
          sub="novas adesões"
          tone="positive"
        />
      </div>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-100 mb-4">
          Crescimento últimos 30 dias
        </h2>
        {hasMetrics ? (
          <GrowthChart series={data.growthSeries} />
        ) : (
          <p className="text-sm text-slate-500 italic py-8 text-center">
            Sem snapshots ainda — clica em "Sincronizar grupos" pra criar o primeiro.
          </p>
        )}
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} className="text-red-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Mensagens que mais geraram saídas (7d)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Ordenado por número de saídas atribuídas à mensagem nos minutos seguintes ao envio.
          Use isso pra identificar tipos de tip/promoção que afastam audiência.
        </p>

        {!hasBurners ? (
          <p className="text-sm text-slate-500 italic">
            🎉 Nenhuma mensagem gerou saída atribuída no período (precisa do webhook
            Z-API ativo).
          </p>
        ) : (
          <ul className="space-y-2">
            {data.topBurners.map((m, idx) => (
              <li
                key={m.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 hover:bg-slate-800/40 transition"
              >
                <div className="text-2xl font-semibold text-slate-700 w-8 text-center">
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 line-clamp-2 break-words">
                    {m.content}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {m.sentAt
                      ? new Date(m.sentAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-red-400">{m.leftsTotal}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                    saídas
                  </p>
                  {m.leftsIn60min > 0 && (
                    <p className="text-[10px] text-amber-300 mt-0.5">
                      {m.leftsIn60min} em 1h
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
        <p className="font-medium text-slate-300 mb-1">Próximas métricas (Round 3):</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>CTR por mensagem (com encurtador comunidade.mateuscaumo.com.br)</li>
          <li>Conversão atribuída (cadastros via UTM)</li>
          <li>Score por tipster quando virar Arena multi-afiliado</li>
        </ul>
      </div>
    </>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const toneCls = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral: 'text-slate-100',
  }[tone];

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          {label}
        </span>
        <span className={cn('text-slate-500', toneCls)}>{icon}</span>
      </div>
      <p className={cn('text-2xl font-semibold', toneCls)}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function GrowthChart({
  series,
}: {
  series: Array<{ date: string; membersCount: number }>;
}) {
  const W = 800;
  const H = 200;
  const PAD = 24;

  const points = useMemo(() => {
    if (series.length < 2) return [];
    const counts = series.map((s) => s.membersCount);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const range = max - min || 1;

    return series.map((s, i) => {
      const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
      const y = H - PAD - ((s.membersCount - min) / range) * (H - 2 * PAD);
      return { x, y, count: s.membersCount, date: s.date };
    });
  }, [series]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-500 italic">
        Sem dados suficientes ainda (precisa de pelo menos 2 snapshots).
      </p>
    );
  }

  const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const pathFill = `${pathLine} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  const minCount = Math.min(...series.map((s) => s.membersCount));
  const maxCount = Math.max(...series.map((s) => s.membersCount));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48">
        <path d={pathFill} fill="rgb(16 185 129 / 0.1)" />
        <path d={pathLine} fill="none" stroke="rgb(52 211 153)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgb(52 211 153)" />
        ))}
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => {
          const p = points[i];
          const date = new Date(p.date);
          return (
            <text
              key={`x${i}`}
              x={p.x}
              y={H - 4}
              textAnchor="middle"
              fontSize="10"
              fill="rgb(100 116 139)"
            >
              {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </text>
          );
        })}
        <text x={4} y={PAD + 4} fontSize="10" fill="rgb(100 116 139)">
          {maxCount.toLocaleString('pt-BR')}
        </text>
        <text x={4} y={H - PAD} fontSize="10" fill="rgb(100 116 139)">
          {minCount.toLocaleString('pt-BR')}
        </text>
      </svg>
    </div>
  );
}

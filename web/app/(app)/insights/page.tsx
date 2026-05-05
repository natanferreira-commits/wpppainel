'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Users, UserPlus, UserMinus, Flame } from 'lucide-react';
import {
  insights as insightsApi,
  instances as instancesApi,
  type CommunityInsights,
} from '@/lib/api';
import { cn } from '@/lib/cn';

export default function InsightsPage() {
  const [data, setData] = useState<CommunityInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await instancesApi.list();
        const community = list[0]?.communities[0];
        if (!community) {
          setError('Nenhuma comunidade cadastrada ainda.');
          return;
        }
        const result = await insightsApi.community(community.id);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar insights');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-slate-500">Carregando insights…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-red-600">{error ?? 'Sem dados'}</p>
      </div>
    );
  }

  const growthIsPositive = data.summary.growth7dPct >= 0;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Insights</h1>
        <p className="text-sm text-slate-500">
          Comunidade <span className="font-medium text-slate-700">{data.community.name}</span> ·
          últimos 7 dias
        </p>
      </header>

      {/* aviso fake data */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
        🟡 <strong>Dados de demonstração</strong> — quando a Z-API estiver conectada (cron diário),
        substitui automaticamente pelos números reais.
      </div>

      {/* ── Cards principais ── */}
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

      {/* ── Gráfico de crescimento ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Crescimento últimos 30 dias
        </h2>
        <GrowthChart series={data.growthSeries} />
      </section>

      {/* ── Top mensagens queimadoras ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} className="text-red-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Mensagens que mais geraram saídas (7d)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Ordenado por número de saídas atribuídas à mensagem nos minutos seguintes ao envio.
          Use isso pra identificar tipos de tip/promoção que afastam audiência.
        </p>

        {data.topBurners.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            🎉 Nenhuma mensagem gerou saída atribuída no período.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.topBurners.map((m, idx) => (
              <li
                key={m.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
              >
                <div className="text-2xl font-semibold text-slate-300 w-8 text-center">
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 line-clamp-2 break-words">
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
                  <p className="text-lg font-semibold text-red-600">{m.leftsTotal}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">saídas</p>
                  {m.leftsIn60min > 0 && (
                    <p className="text-[10px] text-amber-700 mt-0.5">
                      {m.leftsIn60min} em 1h
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Roadmap ── */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700 mb-1">Próximas métricas (Round 3):</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>CTR por mensagem (com link encurtador próprio)</li>
          <li>Conversão atribuída (cadastros via UTM)</li>
          <li>Score por tipster quando virar Arena multi-afiliado</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────

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
    positive: 'text-emerald-600',
    negative: 'text-red-600',
    neutral: 'text-slate-700',
  }[tone];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className={cn('text-slate-400', toneCls)}>{icon}</span>
      </div>
      <p className={cn('text-2xl font-semibold', toneCls)}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

// ─── Gráfico SVG inline (sem dependências externas) ───────────────────────

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
    return <p className="text-sm text-slate-500">Sem dados suficientes ainda.</p>;
  }

  const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const pathFill = `${pathLine} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  const minCount = Math.min(...series.map((s) => s.membersCount));
  const maxCount = Math.max(...series.map((s) => s.membersCount));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48">
        {/* área preenchida */}
        <path d={pathFill} fill="rgb(16 185 129 / 0.08)" />
        {/* linha */}
        <path d={pathLine} fill="none" stroke="rgb(16 185 129)" strokeWidth={2} />
        {/* pontos */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgb(16 185 129)" />
        ))}
        {/* eixo x labels (primeiro / meio / último) */}
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
        {/* eixo y labels */}
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

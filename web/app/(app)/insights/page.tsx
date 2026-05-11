'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  UserPlus,
  UserMinus,
  Flame,
  Activity,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
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
  const [compareDays, setCompareDays] = useState<number>(7);
  const [data, setData] = useState<CommunityInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);

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
          setError('Nenhuma comunidade cadastrada — sincroniza grupos em /instancias.');
          setLoading(false);
          return;
        }
        all.sort((a, b) => (b.membersCount ?? 0) - (a.membersCount ?? 0));
        setCommunities(all);
        setSelectedCommunityId(all[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar comunidades');
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedCommunityId) return;
    setLoading(true);
    insightsApi
      .community(selectedCommunityId, { compareDays })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [selectedCommunityId, compareDays]);

  // Força a Z-API a contar de novo e recarrega o insights.
  // Usa quando o número parecer defasado (ex: rodou tráfego e quer ver
  // o impacto na hora). Dispara um GET na Z-API por baixo dos panos.
  async function handleRefreshMembers() {
    if (!selectedCommunityId || refreshing) return;
    setRefreshing(true);
    setRefreshFeedback(null);
    try {
      const result = await insightsApi.refreshMembers(selectedCommunityId);
      const deltaText =
        result.delta === null
          ? `${result.after} membros`
          : result.delta === 0
            ? `sem mudança · ${result.after} membros`
            : `${result.delta > 0 ? '+' : ''}${result.delta} · agora ${result.after}`;
      setRefreshFeedback(deltaText);
      // Recarrega o insights pra refletir o novo membersCount no card
      const fresh = await insightsApi.community(selectedCommunityId, { compareDays });
      setData(fresh);
      // Limpa o feedback depois de 5s
      setTimeout(() => setRefreshFeedback(null), 5000);
    } catch (err) {
      setRefreshFeedback(
        `Erro: ${err instanceof Error ? err.message : 'falha ao atualizar'}`,
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-slate-100 mb-2">Insights</h1>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Insights</h1>
          <p className="text-sm text-slate-400 mt-1">
            Crescimento e churn da comunidade
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

      {data && (
        <InsightsContent
          data={data}
          compareDays={compareDays}
          onChangeCompareDays={setCompareDays}
          onRefreshMembers={handleRefreshMembers}
          refreshing={refreshing}
          refreshFeedback={refreshFeedback}
        />
      )}
    </div>
  );
}

function InsightsContent({
  data,
  compareDays,
  onChangeCompareDays,
  onRefreshMembers,
  refreshing,
  refreshFeedback,
}: {
  data: CommunityInsights;
  compareDays: number;
  onChangeCompareDays: (n: number) => void;
  onRefreshMembers: () => void;
  refreshing: boolean;
  refreshFeedback: string | null;
}) {
  const growthIsPositive = data.summary.growth7dPct >= 0;
  const hasMetrics = data.growthSeries.length > 0;
  const hasBurners = data.topBurners.length > 0;
  const hasEvents =
    data.summary.joins7d + data.summary.lefts7d + data.realtime.joins + data.realtime.lefts > 0;

  return (
    <>
      {!hasEvents && !hasMetrics && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-200">
          🟡 <strong>Sem dados ainda</strong> — métricas começam a popular quando o
          webhook Z-API estiver ativo (entradas/saídas em tempo real) e quando rodar
          "Sincronizar grupos" pelo menos 2 dias seguidos (snapshots de membros).
        </div>
      )}

      {/* ── Cards principais (7d + tempo real) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MembersNowCard
          value={data.summary.membersNow.toLocaleString('pt-BR')}
          onRefresh={onRefreshMembers}
          refreshing={refreshing}
          feedback={refreshFeedback}
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

      {/* ── Tempo real (últimas 24h) ── */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Tempo real — últimas {data.realtime.hours}h
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat
            label="Entradas"
            value={`+${data.realtime.joins}`}
            tone="positive"
          />
          <MiniStat
            label="Saídas"
            value={`-${data.realtime.lefts}`}
            tone="negative"
          />
          <MiniStat
            label="Líquido"
            value={`${data.realtime.net >= 0 ? '+' : ''}${data.realtime.net}`}
            tone={data.realtime.net >= 0 ? 'positive' : 'negative'}
          />
          <MiniStat
            label="Churn 24h"
            value={`${data.realtime.churnPct.toFixed(2)}%`}
            tone={data.realtime.churnPct > 1 ? 'negative' : 'neutral'}
          />
        </div>
      </section>

      {/* ── Gráfico crescimento 30d ── */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-100 mb-4">
          Crescimento últimos 30 dias
        </h2>
        {hasMetrics ? (
          <GrowthChart series={data.growthSeries} />
        ) : (
          <p className="text-sm text-slate-500 italic py-8 text-center">
            Sem snapshots ainda. Roda "Sincronizar grupos" em /instancias pra criar o
            primeiro. Cron diário cria o resto.
          </p>
        )}
      </section>

      {/* ── Tabela movimento diário ── */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-100 mb-4">
          Movimento diário — últimos 7 dias
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium text-right">Entradas</th>
                <th className="pb-2 font-medium text-right">Saídas</th>
                <th className="pb-2 font-medium text-right">Líquido</th>
                <th className="pb-2 font-medium text-right">Membros</th>
                <th className="pb-2 font-medium text-right">Churn %</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => {
                const date = new Date(d.date);
                return (
                  <tr key={d.date} className="border-b border-slate-800/50 last:border-b-0">
                    <td className="py-2.5 text-slate-300">
                      {date.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        weekday: 'short',
                      })}
                    </td>
                    <td className="py-2.5 text-right text-emerald-400">
                      {d.joins > 0 ? `+${d.joins}` : '0'}
                    </td>
                    <td className="py-2.5 text-right text-red-400">
                      {d.lefts > 0 ? `-${d.lefts}` : '0'}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 text-right font-medium',
                        d.net > 0
                          ? 'text-emerald-400'
                          : d.net < 0
                            ? 'text-red-400'
                            : 'text-slate-500',
                      )}
                    >
                      {d.net > 0 ? `+${d.net}` : d.net}
                    </td>
                    <td className="py-2.5 text-right text-slate-400">
                      {d.membersCount?.toLocaleString('pt-BR') ?? '—'}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 text-right',
                        d.churnPct > 3 ? 'text-red-400' : 'text-slate-400',
                      )}
                    >
                      {d.churnPct > 0 ? `${d.churnPct.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Comparativo períodos ── */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <GitCompare size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Comparativo de períodos
            </h2>
          </div>
          <select
            value={compareDays}
            onChange={(e) => onChangeCompareDays(parseInt(e.target.value, 10))}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
          >
            <option value={1}>último 1 dia vs 1 dia anterior</option>
            <option value={3}>últimos 3 dias vs 3 anteriores</option>
            <option value={7}>últimos 7 dias vs 7 anteriores</option>
            <option value={14}>últimos 14 dias vs 14 anteriores</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="pb-2 font-medium"></th>
                <th className="pb-2 font-medium text-right">{data.comparison.periodA.label}</th>
                <th className="pb-2 font-medium text-right">{data.comparison.periodB.label}</th>
                <th className="pb-2 font-medium text-right">Diferença</th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="Entradas"
                a={data.comparison.periodA.joins}
                b={data.comparison.periodB.joins}
                diff={data.comparison.diff.joins}
                diffPct={data.comparison.diff.joinsPct}
                tone="positive"
              />
              <ComparisonRow
                label="Saídas"
                a={data.comparison.periodA.lefts}
                b={data.comparison.periodB.lefts}
                diff={data.comparison.diff.lefts}
                diffPct={data.comparison.diff.leftsPct}
                tone="negative"
                invert
              />
              <ComparisonRow
                label="Líquido"
                a={data.comparison.periodA.net}
                b={data.comparison.periodB.net}
                diff={data.comparison.diff.net}
                diffPct={null}
                tone="neutral"
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Top burners ── */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} className="text-red-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Mensagens que mais geraram saídas (7d)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Ordenado por número de saídas atribuídas à mensagem nos minutos seguintes ao envio.
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
    </>
  );
}

// Card especial pra "Membros agora" — tem botão de refresh manual,
// que dispara um GET na Z-API e atualiza o membersCount no banco.
// Útil quando o painel parece defasado e quer ver o número exato.
function MembersNowCard({
  value,
  onRefresh,
  refreshing,
  feedback,
}: {
  value: string;
  onRefresh: () => void;
  refreshing: boolean;
  feedback: string | null;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Membros agora
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Atualizar agora (puxa contagem real da Z-API)"
          aria-label="Atualizar contagem de membros"
          className="text-slate-500 md:hover:text-emerald-400 active:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition rounded-lg p-2 -m-2"
        >
          <RefreshCw
            size={16}
            className={cn(refreshing && 'animate-spin text-emerald-400')}
          />
        </button>
      </div>
      <p className="text-2xl font-semibold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 mt-1">
        {feedback ?? 'canal de anúncios'}
      </p>
    </div>
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

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const toneCls = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral: 'text-slate-100',
  }[tone];

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className={cn('text-xl font-semibold mt-0.5', toneCls)}>{value}</p>
    </div>
  );
}

function ComparisonRow({
  label,
  a,
  b,
  diff,
  diffPct,
  tone,
  invert = false,
}: {
  label: string;
  a: number;
  b: number;
  diff: number;
  diffPct: number | null;
  tone: 'positive' | 'negative' | 'neutral';
  // pra "Saídas" — diff positivo é ruim, então inverte cor
  invert?: boolean;
}) {
  // determinação da cor do diff
  const isImprovement = invert ? diff < 0 : diff > 0;
  const isWorse = invert ? diff > 0 : diff < 0;
  const diffColor =
    diff === 0
      ? 'text-slate-500'
      : isImprovement
        ? 'text-emerald-400'
        : isWorse
          ? 'text-red-400'
          : 'text-slate-300';

  const formatDiff = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <tr className="border-b border-slate-800/50 last:border-b-0">
      <td className="py-2.5 text-slate-300">{label}</td>
      <td className="py-2.5 text-right text-slate-200 font-medium">
        {formatDiff(a)}
      </td>
      <td className="py-2.5 text-right text-slate-400">{formatDiff(b)}</td>
      <td className={cn('py-2.5 text-right font-medium', diffColor)}>
        {formatDiff(diff)}
        {diffPct !== null && Math.abs(diffPct) > 0.1 && (
          <span className="text-xs ml-1 opacity-80">
            ({diffPct > 0 ? '+' : ''}
            {diffPct.toFixed(0)}%)
          </span>
        )}
      </td>
    </tr>
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

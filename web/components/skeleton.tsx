import { cn } from '@/lib/cn';

// Bloco pulsante usado como placeholder enquanto dados carregam.
// Sempre prefira skeletons que ESPELHEM o layout final (mesma altura,
// número de cards, etc) pra evitar layout shift quando o conteúdo chega.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-slate-800/60',
        className,
      )}
      aria-hidden
    />
  );
}

// Skeleton card pré-fabricado pra listas tipo "agendadas" e "histórico".
// Altura aproximada de um card real — evita o page jump ao trocar pra
// conteúdo real.
export function CardSkeleton() {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>
      <Skeleton className="h-3 w-1/2 mb-2" />
      <Skeleton className="h-3 w-3/4 mb-3" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

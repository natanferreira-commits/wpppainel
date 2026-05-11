'use client';

// Renderiza um mock fiel-o-suficiente da bolha de mensagem do WhatsApp
// pra o operador ver como vai ficar antes de enviar.
// Suporta markdown básico do WhatsApp:
//   *negrito*  →  bold
//   _itálico_  →  italic
//   ~tachado~  →  line-through
//   ```mono``` →  monospace

function formatWhatsAppMarkdown(text: string): string {
  // Sanitiza HTML primeiro pra evitar injection
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/```([^`]+)```/g, '<code class="bg-black/20 px-1 rounded">$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<span class="line-through">$1</span>')
    .replace(/\n/g, '<br/>');
}

type Props = {
  content: string;
  imageUrl?: string | null;
  destinationLabel?: string;
  scheduledFor?: Date | null;
};

export function WhatsAppPreview({ content, imageUrl, destinationLabel, scheduledFor }: Props) {
  const formatted = formatWhatsAppMarkdown(content || '_(escreva sua mensagem)_');
  const time = scheduledFor
    ? scheduledFor.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-whatsapp-bg rounded-xl overflow-hidden shadow-sm border border-slate-200 md:sticky md:top-6">
      {/* Header simulando topo do WA */}
      <div className="bg-whatsapp-panel px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
          📢
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-whatsapp-text text-sm font-medium truncate">
            {destinationLabel || 'Selecione o destino'}
          </p>
          <p className="text-whatsapp-time text-xs">visto por todos</p>
        </div>
      </div>

      {/* Área de conversa com padrão de fundo */}
      <div
        className="p-4 min-h-[300px]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      >
        <div className="bg-whatsapp-bubble rounded-lg p-2 max-w-[85%] ml-auto shadow">
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="rounded-md mb-2 max-h-48 w-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          )}
          <p
            className="text-whatsapp-text text-sm whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
          <p className="text-whatsapp-time text-[10px] text-right mt-1">{time} ✓✓</p>
        </div>
      </div>
    </div>
  );
}

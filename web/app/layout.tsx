import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Painel Dupla',
  description: 'Painel interno do Grupo Dupla',
};

// Viewport explícito pro mobile — sem isso o iOS renderiza em modo
// desktop emulado (980px) e nada de mobile-first funciona.
// Importante: NÃO setar maximumScale=1 (quebra acessibilidade WCAG 2.1).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617', // slate-950, combina com a barra de status mobile
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

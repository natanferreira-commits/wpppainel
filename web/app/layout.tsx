import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Painel Dupla',
  description: 'Painel interno do Grupo Dupla',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

# Painel Dupla

Painel interno do Grupo Dupla pra envio e agendamento de mensagens em comunidades WhatsApp.

## Stack

- **Backend:** NestJS + Prisma + SQLite (dev) / PostgreSQL (prod)
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Fila:** BullMQ + Redis (entra no próximo round)
- **WhatsApp:** Z-API (mockado por enquanto)

## Como rodar (primeira vez)

```bash
# 1. Instalar deps de tudo
npm install

# 2. Configurar banco (SQLite — cria arquivo local)
cd api
cp .env.example .env
npm run db:push     # cria tabelas
npm run db:seed     # popula dados de teste

# 3. Subir backend (porta 3001)
cd ..
npm run dev:api

# 4. Em OUTRO terminal — subir frontend (porta 3011)
npm run dev:web
```

Abrir `http://localhost:3011`. Login com qualquer email (dev mode).

## Estrutura

```
painel-dupla/
├── api/              # Backend NestJS
│   ├── prisma/       # Schema + seed
│   └── src/
│       ├── auth/         # Login fake (dev)
│       ├── instances/    # Instâncias WhatsApp
│       ├── messages/     # Mensagens (criar, listar, agendar)
│       └── prisma/       # Cliente Prisma
└── web/              # Frontend Next.js
    ├── app/
    │   ├── (auth)/login/
    │   └── (app)/        # Telas autenticadas
    │       ├── nova-mensagem/   # ⭐ tela principal
    │       ├── calendario/
    │       ├── historico/
    │       └── instancias/
    ├── components/
    └── lib/
```

## Status

- [x] Round 1: Scaffold + tela Nova Mensagem ponta-a-ponta
- [ ] Round 2: Z-API real + worker BullMQ + idempotência
- [ ] Round 3: Calendário visual + multi-operador + permissões
- [ ] Round 4: Deploy (Railway + Vercel + Neon + Upstash)

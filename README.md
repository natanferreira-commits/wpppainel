# Painel Dupla

Painel interno do Grupo Dupla pra envio e agendamento de mensagens em comunidades WhatsApp.

## Stack

- **App:** Next.js 14 (App Router) — UI + Route Handlers
- **Banco:** Prisma + SQLite (dev) / PostgreSQL (prod)
- **Auth:** JWT via `jose` (edge-compatible)
- **Validação:** Zod
- **UI:** Tailwind CSS + lucide-react
- **WhatsApp:** Z-API (mockada por enquanto)
- **Deploy alvo:** Vercel (1 deploy só) + Supabase ou Neon (Postgres)

## Como rodar (primeira vez)

```bash
# 1. Instalar deps
npm install

# 2. Configurar banco (SQLite — cria arquivo local)
cd web
cp .env.example .env
npm run db:push     # cria tabelas
npm run db:seed     # popula dados de teste

# 3. Subir a app (porta 3011)
cd ..
npm run dev
```

Abrir `http://localhost:3011`. Login com qualquer email (dev mode aceita).

## Estrutura

```
painel-dupla/
├── package.json              # workspace root (apenas web/ ativo)
└── web/                      # tudo aqui
    ├── package.json
    ├── prisma/
    │   ├── schema.prisma     # User, Instance, Community, Group, Message,
    │   │                     # MessageTarget, CommunityMetric, MemberEvent
    │   └── seed.ts           # popula 30d de métricas + eventos fake
    ├── app/
    │   ├── api/              # Route Handlers (substituem o NestJS)
    │   │   ├── auth/login/
    │   │   ├── instances/[id]/groups/
    │   │   ├── messages/[id]/
    │   │   └── communities/[id]/insights/
    │   ├── (auth)/login/
    │   └── (app)/
    │       ├── nova-mensagem/   # ⭐ tela principal
    │       ├── calendario/
    │       ├── historico/
    │       ├── insights/        # churn por mensagem + crescimento
    │       └── instancias/
    ├── components/
    │   ├── sidebar.tsx
    │   └── whatsapp-preview.tsx  # mock fiel da bolha do WA
    └── lib/
        ├── prisma.ts            # singleton (reuse em Lambda)
        ├── jwt.ts               # sign/verify com jose
        └── api.ts               # cliente HTTP tipado
```

## Variáveis de ambiente

Em `web/.env`:

```
DATABASE_URL="file:./prisma/dev.db"      # SQLite local; prod = postgres://...
JWT_SECRET="dev-secret-change-in-prod"   # gere algo forte em prod
ZAPI_BASE_URL="https://api.z-api.io"
ZAPI_INSTANCE_ID=""                       # Luccas vai fornecer
ZAPI_TOKEN=""                             # Luccas vai fornecer
ZAPI_CLIENT_TOKEN=""                      # Luccas vai fornecer
```

## Deploy no Vercel

1. Conectar repo no Vercel
2. **Root Directory:** `web`
3. **Framework:** Next.js (auto-detectado)
4. Variáveis de ambiente: copiar de `.env.example` e preencher prod
5. **DATABASE_URL** aponta pra Postgres (Supabase/Neon)
6. Build command padrão (`npm run build`) — `postinstall` roda `prisma generate`

## Status

- [x] Round 1: scaffold + tela Nova Mensagem ponta-a-ponta
- [x] Insights: métricas de crescimento e churn por mensagem (dados fake)
- [x] Refator pra Next.js Route Handlers (deploy Vercel-ready)
- [ ] Round 2: Z-API real + worker (cron externo) + idempotência
- [ ] Round 3: auth real (bcrypt) + RBAC + UI de QR code
- [ ] Round 4: deploy Vercel + DNS + smoke prod

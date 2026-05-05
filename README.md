# Painel Dupla

Painel interno do Grupo Dupla pra envio e agendamento de mensagens em comunidades WhatsApp.

## Stack

- **App:** Next.js 14 (App Router) — UI + Route Handlers
- **Banco:** Prisma + PostgreSQL (Vercel Postgres em prod / Neon em dev)
- **Auth:** JWT via `jose` (edge-compatible)
- **Validação:** Zod
- **UI:** Tailwind CSS + lucide-react
- **WhatsApp:** Z-API (integração no Round 2)
- **Deploy:** Vercel (1 deploy só)

## Deploy no Vercel (passo a passo)

1. **Importar o repo no Vercel** — Add New Project → seleciona `wpppainel`
2. **Root Directory:** `web` ⚠️ obrigatório
3. **Framework:** Next.js (auto-detectado)
4. **Storage → Create Database → Postgres** (Vercel Postgres):
   - Nome: `painel-dupla-db`
   - Região: `gru1` (São Paulo)
   - Vercel injeta `DATABASE_URL` automaticamente nas env vars
5. **Settings → Environment Variables → Add:**
   ```
   JWT_SECRET = (gere com: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
   SEED_TOKEN = (gere com: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
   ```
6. **Deploy** (build roda `prisma db push` automaticamente — cria tabelas)
7. **Popular dados de demo** (1 vez só):
   ```
   https://SEU-PROJETO.vercel.app/api/admin/seed?token=SEED_TOKEN
   ```
8. Acesse o painel → login com qualquer email (modo dev — Round 3 vira auth real)

## Como rodar dev local

Como o schema agora é PostgreSQL, você precisa de um Postgres acessível:

**Opção A — Neon (recomendado, free):**
1. Cria conta em [neon.tech](https://neon.tech) → New Project
2. Copia a connection string
3. Cria `web/.env`:
   ```
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
   JWT_SECRET="qualquer-coisa-pra-dev"
   SEED_TOKEN="qualquer-coisa-pra-dev"
   ```
4. `npm install`
5. `cd web && npm run db:push && npm run db:seed`
6. `cd .. && npm run dev` → http://localhost:3011

**Opção B — Postgres local via Docker:**
```bash
docker run -d --name painel-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
# DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres
```

## Estrutura

```
painel-dupla/
├── package.json              # workspace root (web/ ativo)
└── web/
    ├── prisma/
    │   ├── schema.prisma     # postgresql
    │   └── seed.ts           # CLI wrapper (chama lib/seed.ts)
    ├── app/
    │   ├── api/              # Route Handlers
    │   │   ├── admin/seed/         # ⭐ popula DB em prod (token-protected)
    │   │   ├── auth/login/
    │   │   ├── instances/[id]/groups/
    │   │   ├── messages/[id]/
    │   │   └── communities/[id]/insights/
    │   ├── (auth)/login/
    │   └── (app)/
    │       ├── nova-mensagem/   # ⭐ tela principal
    │       ├── calendario/
    │       ├── historico/
    │       ├── insights/        # churn por mensagem
    │       └── instancias/
    ├── components/
    │   ├── sidebar.tsx
    │   └── whatsapp-preview.tsx
    └── lib/
        ├── prisma.ts            # singleton (reuse em Lambda)
        ├── jwt.ts               # sign/verify com jose
        ├── seed.ts              # função reusable (CLI + endpoint)
        └── api.ts               # cliente HTTP tipado
```

## Variáveis de ambiente em prod

| Var | Origem | Obrigatória |
|---|---|---|
| `DATABASE_URL` | Vercel Postgres injeta | ✅ |
| `JWT_SECRET` | gerada manualmente | ✅ |
| `SEED_TOKEN` | gerada manualmente | ✅ |
| `ZAPI_*` | Luccas (Round 2) | ⚪ ainda não |

## Status

- [x] Round 1: scaffold + tela Nova Mensagem ponta-a-ponta
- [x] Insights: métricas de crescimento e churn por mensagem
- [x] Refator pra Next.js Route Handlers
- [x] Prisma migrado pra PostgreSQL
- [ ] Deploy Vercel + DNS painel.grupodupla.com.br
- [ ] Round 2: Z-API real + worker (cron-job.org) + integração encurtador
- [ ] Round 3: auth real (bcrypt) + RBAC + UI de QR code

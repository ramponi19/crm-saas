# CRM SaaS

Sistema de gestão completo para lojas — vendas, estoque, clientes, leads, financeiro e BI.

Construído para a JM Store Importados. Arquitetura preparada para replicar e vender como SaaS.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Postgres + Auth + Realtime + RLS)
- **Vercel** (deploy)
- **Claude API** (IA)

## Setup rápido

### 1. Clonar e instalar

```bash
git clone https://github.com/ramponi19/crm-saas.git
cd crm-saas
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencher `.env.local` com suas chaves do Supabase.

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### 4. Deploy no Vercel

```bash
# Já conectado ao repositório GitHub — deploy automático no push
git push origin main
```

## Estrutura de módulos

| Módulo | Rota | Status |
|--------|------|--------|
| Dashboard | `/dashboard` | ✅ Fase 1 |
| Leads / Kanban | `/leads` | 🔄 Fase 2 |
| PDV / Vendas | `/pdv` | 🔄 Fase 3 |
| Clientes | `/clientes` | 🔄 Fase 3 |
| Estoque | `/estoque` | 🔄 Fase 3 |
| Assistência | `/assistencia` | 🔄 Fase 3 |
| Compras | `/compras` | 🔄 Fase 3 |
| Financeiro | `/financeiro` | 🔄 Fase 4 |
| Relatórios / BI | `/relatorios` | 🔄 Fase 4 |
| Configurações | `/configuracoes` | 🔄 Fase 4 |
| Multi-tenant / SaaS | — | 📋 Fase 5 |

## Banco de dados

Conecta ao projeto Supabase existente da JM Store (`guiuzbcqkvelqcuogxtd`).

Para gerar tipos TypeScript atualizados:

```bash
npx supabase gen types typescript --project-id guiuzbcqkvelqcuogxtd > types/database.ts
```

## White-label

A tabela `configuracoes` já contém campos para personalização por empresa:
- `wl_empresa` — nome da empresa
- `wl_cor` — cor primária
- `wl_logo_url` — URL do logo
- `wl_slogan` — slogan

## Licença

Proprietário — todos os direitos reservados.

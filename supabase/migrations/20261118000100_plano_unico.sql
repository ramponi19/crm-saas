-- PLANO ÚNICO + MÓDULOS (18/11/2026, pedido do Lucas: "reconstrução do /register e dos textos públicos").
--
-- 1. planos_config ganha o plano 'base' (o único ativo): o que o cadastro, a landing e o checkout mostram.
--    Os quatro antigos (free, starter, pro, unlimited) ficam inativos, guardados para o histórico.
-- 2. precos_adicionais: a tabela de preços de módulos e extras (usuário, número, loja), editável no
--    superadmin. Preço nulo = "a definir" (decisão (a) do Lucas: preços e Stripe).
-- 3. empresas.plano aceita 'base' (CHECK e padrão) e as empresas existentes passam para ele SEM MUDAR NADA:
--    limites (limite_usuarios, limite_leads) ficam como estão; o que o plano libera (lib/plano.ts) cobre o que
--    elas já usam. empresas.cortesia marca quem não paga por acordo (a JM): fica fora do faturamento estimado.
-- 4. termos_aceites aceita o documento 'dpa' (acordo de tratamento de dados), aceito no cadastro com os termos
--    e a privacidade.
--
-- Volta: supabase/scripts/volta/volta-plano-unico.sql

-- ── 1. O plano base ───────────────────────────────────────────────────────────
insert into public.planos_config (id, nome, descricao, preco_centavos, limite_usuarios, limite_leads, features, destaque, ativo, ordem, cor)
values (
  'base', 'Nexus', '14 dias grátis, sem cartão. Módulos extras na Central.', 19700, 3, 0,
  '["3 usuários", "1 número de WhatsApp, com Instagram e Messenger", "2 lojas", "Funil de vendas", "Comunicação", "Tarefas", "Automatize", "Etiquetas"]'::jsonb,
  true, true, 0, '#2E5CE6'
)
on conflict (id) do nothing;

update public.planos_config set ativo = false, destaque = false, updated_at = now() where id <> 'base';

-- ── 2. Preços de módulos e extras ─────────────────────────────────────────────
create table if not exists public.precos_adicionais (
  chave text primary key check (chave ~ '^[a-z][a-z0-9_]*$'),
  tipo text not null check (tipo in ('modulo', 'extra')),
  nome text not null,
  preco_centavos integer check (preco_centavos is null or preco_centavos >= 0),
  unidade text not null default 'por mês',
  ativo boolean not null default true,
  ordem integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.precos_adicionais enable row level security;
-- Leitura: quem está logado (a Central e o faturamento mostram o preço). Gravação: só o service (rota do superadmin).
create policy precos_adicionais_ler on public.precos_adicionais for select to authenticated using (true);
revoke all on public.precos_adicionais from anon;
grant select on public.precos_adicionais to authenticated;

insert into public.precos_adicionais (chave, tipo, nome, unidade, ordem) values
  ('usuario', 'extra', 'Usuário adicional', 'por usuário, por mês', 1),
  ('numero',  'extra', 'Número de WhatsApp adicional', 'por número, por mês', 2),
  ('loja',    'extra', 'Loja adicional', 'por loja, por mês', 3)
on conflict (chave) do nothing;

-- ── 3. Empresas no plano base ─────────────────────────────────────────────────
alter table public.empresas drop constraint if exists empresas_plano_check;
alter table public.empresas add constraint empresas_plano_check check (plano in ('base', 'free', 'starter', 'pro', 'unlimited'));
alter table public.empresas alter column plano set default 'base';
alter table public.empresas add column if not exists cortesia boolean not null default false;

-- Quem já estava num plano pago e fora de teste e de demonstração, sem Stripe ativo, é cortesia (hoje: a JM).
update public.empresas set cortesia = true
 where plano in ('starter', 'pro', 'unlimited') and not coalesce(demo, false)
   and trial_ends_at is null and coalesce(stripe_status, '') <> 'active';

-- O plano de antes, guardado para a volta.
create table if not exists ops.empresas_plano_legado_20261118 as select id, plano from public.empresas;

-- Sem o gatilho empresas_limites_do_plano (0100): ele copiaria os limites do plano novo, e a JM (0 = sem
-- limite) passaria a ter 3 usuários. Trocar o nome do plano aqui não muda limite de ninguém.
alter table public.empresas disable trigger empresas_limites_do_plano;
update public.empresas set plano = 'base' where plano in ('free', 'starter', 'pro', 'unlimited');
alter table public.empresas enable trigger empresas_limites_do_plano;

-- ── 4. DPA no aceite ──────────────────────────────────────────────────────────
alter table public.termos_aceites drop constraint if exists termos_aceites_documento_check;
alter table public.termos_aceites add constraint termos_aceites_documento_check check (documento in ('termos', 'privacidade', 'dpa'));

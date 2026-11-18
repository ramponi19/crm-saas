-- PRIMEIRO PILOTO COM EMPRESA TERCEIRA (18/11/2026, pedido do Lucas). Nada aqui muda a JM.
--
-- 1. empresas.piloto: situação "Piloto" ao lado de Cortesia e Demonstração — sem cobrança, sem vencimento de
--    teste (trial_ends_at nulo, o job expirar-trials não toca) e fora do faturamento estimado. Piloto e
--    cortesia não andam juntos.
-- 2. importacoes: o registro de cada importação de contatos e leads por planilha (Configurações → Importar
--    contatos): quem, quando, quantos e as linhas recusadas com o motivo. Grava só o serviço (a rota confere
--    dono/admin); lê quem é da empresa.
-- 3. acompanhamento_empresa(p_empresa, p_dias): o acompanhamento por empresa do superadmin — mensagens
--    recebidas/enviadas/com erro por dia (dia de Brasília), usuários ativos por dia, canais e falhas.
--    Só o serviço executa (a página do superadmin confere quem é antes).
--
-- 0. Plano base com limite_leads 99999 onde a 0100 entrou com 0 (incidente de 18/11, 06 s.54). Em produção
--    já foi corrigido à mão às 15:35 UTC (não muda nada lá); aqui conserta bancos locais e de teste.
--
-- Volta: supabase/scripts/volta/volta-piloto-importacao.sql

-- ── 0. Plano base: leads sem teto ─────────────────────────────────────────────
update public.planos_config set limite_leads = 99999, updated_at = now() where id = 'base' and limite_leads = 0;

-- ── 0b. "Produto de interesse" em toda empresa ────────────────────────────────
-- O campo negocio.produto_interessado só nasceu nas empresas do corte (21/10); empresa cadastrada depois
-- recusava o lead com interesse ("campo personalizado desconhecido"). O cadastro passa a criá-lo
-- (core/campos.ts); aqui completa quem não tem. Em produção hoje: JM e Preview já têm (nada muda).
insert into public.campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, ordem, ativo)
select e.id, 'negocio', 'produto_interessado', 'Produto de interesse', 'texto', 10, true
  from public.empresas e
 where not exists (select 1 from public.campos_personalizados cp
                    where cp.empresa_id = e.id and cp.entidade = 'negocio' and cp.chave = 'produto_interessado')
on conflict do nothing;

-- ── 1. Piloto ─────────────────────────────────────────────────────────────────
alter table public.empresas add column if not exists piloto boolean not null default false;
alter table public.empresas drop constraint if exists empresas_piloto_cortesia_check;
alter table public.empresas add constraint empresas_piloto_cortesia_check check (not (piloto and cortesia));

-- ── 2. Importações ────────────────────────────────────────────────────────────
create table if not exists public.importacoes (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint references public.filiais(id) on delete set null,
  usuario_id uuid references auth.users(id) on delete set null,
  arquivo text check (arquivo is null or length(arquivo) <= 200),
  total integer not null check (total >= 0),
  contatos_novos integer not null default 0,
  contatos_existentes integer not null default 0,
  leads_criados integer not null default 0,
  recusadas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.importacoes is
  'Importações de contatos e leads por planilha (core, 18/11/2026). Uma linha por importação gravada; recusadas = [{linha, motivo}].';
create index if not exists importacoes_empresa_idx on public.importacoes (empresa_id, created_at desc);
alter table public.importacoes enable row level security;
create policy importacoes_ler_empresa on public.importacoes for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) or (select public.is_super_admin()));
revoke all on public.importacoes from anon;
grant select on public.importacoes to authenticated;

-- ── 3. Acompanhamento por empresa ─────────────────────────────────────────────
create or replace function public.acompanhamento_empresa(p_empresa bigint, p_dias integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with lim as (
    select greatest(1, least(coalesce(p_dias, 14), 60)) as n,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  dias as (
    select lim.hoje - g as dia from lim, generate_series(0, lim.n - 1) g
  ),
  inicio as (
    select (min(dia)::timestamp at time zone 'America/Sao_Paulo') as t from dias
  ),
  m as (
    select (mm.created_at at time zone 'America/Sao_Paulo')::date as dia,
           count(*) filter (where mm.direcao = 'recebida') as recebidas,
           count(*) filter (where mm.direcao = 'enviada') as enviadas,
           count(*) filter (where mm.direcao = 'enviada' and mm.usuario_id is not null) as pelo_crm,
           count(*) filter (where mm.direcao = 'enviada' and (mm.erro_envio is not null or mm.status_entrega = 'falhou')) as com_erro
      from mensagens mm, inicio
     where mm.empresa_id = p_empresa and mm.created_at >= inicio.t
     group by 1
  ),
  u as (
    select d.dia, count(distinct a.usuario_id) as usuarios
      from dias d
      join acessos a on a.empresa_id = p_empresa
       and a.entrada < ((d.dia + 1)::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(a.saida, a.ultimo_sinal, a.entrada) >= (d.dia::timestamp at time zone 'America/Sao_Paulo')
     group by d.dia
  )
  select jsonb_build_object(
    'dias', (select jsonb_agg(jsonb_build_object(
               'dia', d.dia, 'recebidas', coalesce(m.recebidas, 0), 'enviadas', coalesce(m.enviadas, 0),
               'pelo_crm', coalesce(m.pelo_crm, 0), 'com_erro', coalesce(m.com_erro, 0), 'usuarios', coalesce(u.usuarios, 0))
               order by d.dia)
               from dias d left join m on m.dia = d.dia left join u on u.dia = d.dia),
    'usuarios_periodo', (select count(distinct a.usuario_id) from acessos a, inicio
                          where a.empresa_id = p_empresa and coalesce(a.saida, a.ultimo_sinal, a.entrada) >= inicio.t),
    'membros_ativos', (select count(*) from empresa_usuarios eu where eu.empresa_id = p_empresa and eu.ativo),
    'canais', coalesce((select jsonb_agg(jsonb_build_object(
               'id', c.id, 'tipo', c.tipo, 'nome', c.nome_exibicao, 'loja', f.nome, 'status', c.status,
               'conectado_em', c.conectado_em, 'ultima_msg_em', c.ultima_msg_em,
               'ultimo_erro', left(c.ultimo_erro, 200), 'ultimo_erro_em', c.ultimo_erro_em,
               'token_expira_em', c.token_expira_em) order by c.tipo, c.id)
               from canais c left join filiais f on f.id = c.filial_id
              where c.empresa_id = p_empresa), '[]'::jsonb),
    'falhas_recentes', coalesce((select jsonb_agg(x order by x->>'em' desc) from (
               select jsonb_build_object('em', mm.created_at, 'canal_id', mm.canal_id, 'erro', left(coalesce(mm.erro_envio, mm.status_entrega), 200)) x
                 from mensagens mm, inicio
                where mm.empresa_id = p_empresa and mm.created_at >= inicio.t and mm.direcao = 'enviada'
                  and (mm.erro_envio is not null or mm.status_entrega = 'falhou')
                order by mm.created_at desc limit 10) f), '[]'::jsonb)
  );
$$;
revoke all on function public.acompanhamento_empresa(bigint, integer) from public, anon, authenticated;
grant execute on function public.acompanhamento_empresa(bigint, integer) to service_role;

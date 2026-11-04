-- AUTOMATIZE NO FUNIL (decisões do Lucas, 04/11/2026). Uma migração só.
--
-- 1. automacoes ganha as ações novas e a espera:
--    - acao 'enviar_modelo' (modelo APROVADO na Meta, enviado de verdade pela Edge, com
--      as travas do executor) e 'atribuir_responsavel';
--    - espera_dias: "esperar N dias" antes da ação (0 = na hora);
--    - modelo_id: o modelo da ação enviar_modelo.
-- 2. contatos.opt_out_em: quem pediu para não receber mensagem automática.
-- 3. automacao_execucoes: cada ação agendada/executada, por negócio. É a fila do
--    "esperar N dias", o "executou hoje" do quadro e a trava de 7 dias por modelo e
--    contato. Só a chave de serviço grava; quem vê a loja lê.
-- 4. automacao_reservar(lote): o cron pega um lote com FOR UPDATE SKIP LOCKED e marca
--    'executando' na mesma ida — rodar duas vezes não executa duas vezes.
-- 5. RLS: automacoes, cadencias e cadencia_passos — todos leem; só dono/admin gravam
--    (antes qualquer membro gravava; "vendedor vê e não edita").
--
-- O job do pg_cron e o pg_net NÃO estão aqui: dependem do segredo no Vault e do gate
-- de IOwait (ver o 05, "Automatize"). Volta: supabase/scripts/volta/volta-automatize.sql.

-- 1 ─────────────────────────────────────────────────────────────────────────────
alter table public.automacoes drop constraint if exists automacoes_acao_check;
alter table public.automacoes add constraint automacoes_acao_check
  check (acao = any (array['criar_tarefa', 'enviar_whatsapp_template', 'notificar_gestor', 'enviar_modelo', 'atribuir_responsavel']));
alter table public.automacoes add column if not exists espera_dias integer not null default 0;
alter table public.automacoes drop constraint if exists automacoes_espera_dias_check;
alter table public.automacoes add constraint automacoes_espera_dias_check check (espera_dias between 0 and 90);
alter table public.automacoes add column if not exists modelo_id bigint references public.modelos_mensagem(id) on delete set null;
alter table public.automacoes drop constraint if exists automacoes_modelo_check;
alter table public.automacoes add constraint automacoes_modelo_check check (acao <> 'enviar_modelo' or modelo_id is not null);

-- 2 ─────────────────────────────────────────────────────────────────────────────
alter table public.contatos add column if not exists opt_out_em timestamptz;
comment on column public.contatos.opt_out_em is 'Pediu para não receber mensagem automática (Automatize). Nulo = pode receber.';

-- 3 ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.automacao_execucoes (
  id            bigint generated always as identity primary key,
  empresa_id    bigint not null references public.empresas(id) on delete cascade,
  filial_id     bigint references public.filiais(id) on delete set null,
  automacao_id  bigint not null references public.automacoes(id) on delete cascade,
  negocio_id    bigint not null references public.negocios(id) on delete cascade,
  contato_id    bigint references public.contatos(id) on delete set null,
  acao          text not null,
  modelo_id     bigint references public.modelos_mensagem(id) on delete set null,
  status        text not null default 'agendada'
                check (status in ('agendada', 'executando', 'executada', 'falhou', 'pulada')),
  agendada_para timestamptz not null default now(),
  reservada_em  timestamptz,
  executada_em  timestamptz,
  tentativas    integer not null default 0,
  motivo        text,
  mensagem_id   bigint,
  created_at    timestamptz not null default now()
);
comment on table public.automacao_execucoes is 'Automatize: ação de automação agendada/executada por negócio. Só service_role grava.';
create index if not exists automacao_execucoes_fila_idx on public.automacao_execucoes (agendada_para) where status = 'agendada';
create index if not exists automacao_execucoes_automacao_idx on public.automacao_execucoes (automacao_id, status);
create index if not exists automacao_execucoes_dia_idx on public.automacao_execucoes (empresa_id, executada_em) where status = 'executada';
create index if not exists automacao_execucoes_modelo_contato_idx on public.automacao_execucoes (contato_id, modelo_id, executada_em) where acao = 'enviar_modelo';
create index if not exists automacao_execucoes_negocio_idx on public.automacao_execucoes (negocio_id);

alter table public.automacao_execucoes enable row level security;
drop policy if exists automacao_execucoes_select on public.automacao_execucoes;
create policy automacao_execucoes_select on public.automacao_execucoes for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
revoke all on public.automacao_execucoes from anon, authenticated;
grant select on public.automacao_execucoes to authenticated;
grant all on public.automacao_execucoes to service_role;

-- 4 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.automacao_reservar(p_lote integer default 50)
returns setof public.automacao_execucoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 'executando' esquecido (rodada que caiu no meio) volta para a fila depois de 15 min.
  update automacao_execucoes set status = 'agendada', reservada_em = null
   where status = 'executando' and reservada_em < now() - interval '15 minutes';

  return query
  update automacao_execucoes e set status = 'executando', reservada_em = now(), tentativas = e.tentativas + 1
   where e.id in (
     select id from automacao_execucoes
      where status = 'agendada' and agendada_para <= now()
      order by agendada_para, id
      limit greatest(1, least(coalesce(p_lote, 50), 500))
      for update skip locked)
  returning e.*;
end $$;
revoke all on function public.automacao_reservar(integer) from public, anon, authenticated;
grant execute on function public.automacao_reservar(integer) to service_role;

-- 5 ─────────────────────────────────────────────────────────────────────────────
drop policy if exists automacoes_tenant on public.automacoes;
drop policy if exists automacoes_leitura on public.automacoes;
drop policy if exists automacoes_escrita on public.automacoes;
create policy automacoes_leitura on public.automacoes for select to authenticated
  using (empresa_id = (select get_empresa_id()));
create policy automacoes_escrita on public.automacoes for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));

drop policy if exists cad_tenant on public.cadencias;
drop policy if exists cadencias_leitura on public.cadencias;
drop policy if exists cadencias_escrita on public.cadencias;
create policy cadencias_leitura on public.cadencias for select to authenticated
  using (empresa_id = (select get_empresa_id()));
create policy cadencias_escrita on public.cadencias for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));

drop policy if exists cadp_tenant on public.cadencia_passos;
drop policy if exists cadencia_passos_leitura on public.cadencia_passos;
drop policy if exists cadencia_passos_escrita on public.cadencia_passos;
create policy cadencia_passos_leitura on public.cadencia_passos for select to authenticated
  using (empresa_id = (select get_empresa_id()));
create policy cadencia_passos_escrita on public.cadencia_passos for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));

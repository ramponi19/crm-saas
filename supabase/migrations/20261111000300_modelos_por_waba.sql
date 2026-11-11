-- MODELO APROVADO É POR NÚMERO, NÃO POR EMPRESA (11/11/2026).
--
-- A Meta aprova cada modelo dentro de UMA conta de WhatsApp (WABA). A JM tem duas lojas com
-- WABAs diferentes (Mogi 1052…, Jaguariúna 2080…), e o `retorno_atendimento` só existe aprovado
-- na de Jaguariúna. O CRM guardava um status só por empresa — lido da WABA do canal conectado por
-- último — e a Transmissão/Automatize ofereciam e mandavam o modelo por Mogi também: a Meta
-- recusaria cada envio (132001, modelo inexistente).
--
-- Agora:
--   modelos_mensagem_wabas  o status de cada modelo em cada WABA (a sincronização grava);
--   modelos_mensagem.status  vira RESUMO para a tela de modelos (o melhor entre os números);
--   whatsapp_waba_da_loja    a WABA que envia por uma loja, pela MESMA regra da Edge
--                            (canalDaLoja): o canal da loja; sem ele, o da empresa inteira
--                            (filial nula) — ou, com p_qualquer_loja, o último conectado de
--                            qualquer loja (o Automatize cai nele; a Transmissão não);
--   modelo_aprovado_na_loja  aprovado NAQUELE número;
--   modelos_aprovados_por_loja  o que cada loja pode oferecer (Transmissão e Automatize);
--   transmissao_montar       só monta a lista se o modelo está aprovado no número da loja.
-- A Edge confere de novo pela WABA do canal que de fato envia.
--
-- Volta: supabase/scripts/volta/volta-modelos-por-waba.sql

create table if not exists public.modelos_mensagem_wabas (
  modelo_id      bigint not null references public.modelos_mensagem(id) on delete cascade,
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  waba_id        text   not null check (length(btrim(waba_id)) > 0),
  status         text   not null default 'pendente'
                 check (status in ('rascunho', 'pendente', 'aprovado', 'rejeitado', 'pausado', 'desativado')),
  motivo_recusa  text,
  meta_id        text,
  ultima_sync_em timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (modelo_id, waba_id)
);
create index if not exists modelos_mensagem_wabas_empresa_idx
  on public.modelos_mensagem_wabas (empresa_id, waba_id, status);

alter table public.modelos_mensagem_wabas enable row level security;
drop policy if exists modelos_wabas_leitura on public.modelos_mensagem_wabas;
create policy modelos_wabas_leitura on public.modelos_mensagem_wabas
  for select using (empresa_id = (select public.get_empresa_id()));
-- Só o servidor (sincronização com a Meta) escreve.
revoke insert, update, delete, truncate on public.modelos_mensagem_wabas from anon, authenticated;

-- Preenchimento: o status de hoje veio da WABA do canal de WhatsApp conectado por último
-- (era o que a sincronização lia). Só modelo que existe na Meta (meta_id).
insert into public.modelos_mensagem_wabas (modelo_id, empresa_id, waba_id, status, motivo_recusa, meta_id, ultima_sync_em)
select m.id, m.empresa_id, c.waba_id, m.status, m.motivo_recusa, m.meta_id, m.ultima_sync_em
  from public.modelos_mensagem m
  cross join lateral (
    select waba_id from public.canais
     where empresa_id = m.empresa_id and tipo = 'whatsapp' and nullif(btrim(waba_id), '') is not null
     order by conectado_em desc nulls last limit 1) c
 where m.meta_id is not null
on conflict (modelo_id, waba_id) do nothing;

-- A WABA que envia por uma loja. Mesma regra do canalDaLoja da Edge.
create or replace function public.whatsapp_waba_da_loja(p_empresa bigint, p_filial bigint, p_qualquer_loja boolean default false)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.waba_id
    from canais c
   where c.empresa_id = p_empresa and c.tipo = 'whatsapp' and c.status = 'ativo'
     and nullif(btrim(c.waba_id), '') is not null
     and (p_qualquer_loja or p_filial is null or c.filial_id = p_filial or c.filial_id is null)
   order by (p_filial is not null and c.filial_id = p_filial) desc, c.conectado_em desc nulls last
   limit 1;
$$;

create or replace function public.modelo_aprovado_na_loja(p_empresa bigint, p_modelo bigint, p_filial bigint, p_qualquer_loja boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from modelos_mensagem_wabas w
     where w.empresa_id = p_empresa and w.modelo_id = p_modelo and w.status = 'aprovado'
       and w.waba_id = whatsapp_waba_da_loja(p_empresa, p_filial, p_qualquer_loja));
$$;

-- O que cada loja ativa pode oferecer (filial_id nulo = empresa sem loja escolhida).
create or replace function public.modelos_aprovados_por_loja(p_empresa bigint)
returns table (filial_id bigint, modelo_id bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.filial_id, w.modelo_id
    from (select f.id as filial_id from filiais f where f.empresa_id = p_empresa and f.ativo
          union all select null::bigint) l
    join modelos_mensagem_wabas w
      on w.empresa_id = p_empresa and w.status = 'aprovado'
     and w.waba_id = whatsapp_waba_da_loja(p_empresa, l.filial_id, false);
$$;

-- Leem canais de qualquer empresa pelo parâmetro: só o servidor (e as funções definer).
revoke all on function public.whatsapp_waba_da_loja(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.modelo_aprovado_na_loja(bigint, bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.modelos_aprovados_por_loja(bigint) from public, anon, authenticated;
grant execute on function public.whatsapp_waba_da_loja(bigint, bigint, boolean) to service_role;
grant execute on function public.modelo_aprovado_na_loja(bigint, bigint, bigint, boolean) to service_role;
grant execute on function public.modelos_aprovados_por_loja(bigint) to service_role;

-- Transmissão: a lista só congela se o modelo está aprovado NO NÚMERO da loja.
create or replace function public.transmissao_montar(p_transmissao bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t transmissoes%rowtype;
  v_emp bigint := get_empresa_id();
  v_n int;
begin
  select * into t from transmissoes where id = p_transmissao for update;
  if not found or t.empresa_id is distinct from v_emp or not is_empresa_admin(v_emp) then
    raise exception 'transmissão não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if t.status <> 'rascunho' then
    raise exception 'a transmissão já foi disparada' using errcode = '22023';
  end if;
  if not transmissao_loja_ok(v_emp, t.filial_id) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  if not modelo_aprovado_na_loja(v_emp, t.modelo_id, t.filial_id, false) then
    raise exception 'o modelo não está aprovado no WhatsApp desta loja' using errcode = '22023';
  end if;
  insert into transmissao_envios (empresa_id, filial_id, transmissao_id, contato_id, negocio_id, modelo_id, telefone, status, motivo)
  select v_emp, t.filial_id, t.id, p.contato_id, p.negocio_id, t.modelo_id, p.telefone,
         case when p.fora is null then 'pendente' else 'pulada' end,
         case p.fora when 'opt_out' then 'contato pediu para não receber (opt-out)'
                     when 'bloqueado' then 'contato bloqueado'
                     when 'sem_telefone' then 'contato sem telefone'
                     when 'modelo_7_dias' then 'este contato já recebeu este modelo nos últimos 7 dias' end
    from transmissao_publico(v_emp, t.filial_id, t.filtro, t.modelo_id) p
  on conflict (transmissao_id, contato_id) do nothing;
  get diagnostics v_n = row_count;
  -- Ninguém apto: não nasce transmissão vazia (o erro desfaz a lista inteira).
  if not exists (select 1 from transmissao_envios where transmissao_id = t.id and status = 'pendente') then
    raise exception 'ninguém na lista pode receber (todos fora ou lista vazia)' using errcode = '22023';
  end if;
  update transmissoes set total = v_n where id = t.id;
  return v_n;
end $$;
revoke all on function public.transmissao_montar(bigint) from public, anon;
grant execute on function public.transmissao_montar(bigint) to authenticated, service_role;

notify pgrst, 'reload schema';

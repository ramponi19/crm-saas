-- ETIQUETAS NO CORE (pedido do Lucas, 11/11/2026). Uma migração só.
--
-- 1. etiquetas: por empresa, nome e cor. O nome não se repete na empresa (sem diferença de caixa
--    nem de espaço nas pontas); a cor é uma das 5 da paleta Precisão (cinza, azul, verde, âmbar,
--    vermelho; o app traduz para o token). Todos da empresa leem; só dono/admin criam, renomeiam
--    e apagam (RLS com is_empresa_admin).
-- 2. contatos.etiqueta_ids: as etiquetas do contato (várias), num array com índice GIN. Uma fonte
--    só, lida igual pelo quadro, Comunicação, busca e Transmissão (filtro "contém" = &&, "não
--    contém" = not &&). Quem aplica e tira é quem pode alterar o contato (RLS de contatos: o
--    vendedor da loja); a lista é normalizada (sem repetição, em ordem) e só aceita etiqueta da
--    própria empresa — gatilho, vale para qualquer caminho, inclusive update direto.
-- 3. Histórico: todo aplicar/tirar vira linha em negocio_historico (acao 'etiqueta_aplicada' /
--    'etiqueta_tirada', detalhe com id, nome e cor da etiqueta no momento, e o motivo quando não
--    foi a mão: 'etiqueta apagada', 'fusão de contatos'), nos negócios ativos do contato (sem
--    nenhum ativo, no mais recente). Também por gatilho: nenhum caminho escapa.
-- 4. etiquetas_aplicar(negócios, etiqueta, aplicar): o card e o lote do quadro. Invoker: a RLS de
--    negocios e de contatos decide o que a pessoa alcança; devolve os negócios que mudaram (para
--    o gatilho "recebeu etiqueta" do Automatize, que roda no app com as travas de sempre).
-- 5. Apagar a etiqueta tira ela dos contatos antes (com histórico) e apaga as automações dela.
-- 6. automacoes: gatilho 'recebeu_etiqueta' + coluna etiqueta_id (on delete cascade).
-- 7. Filtro por etiqueta: quadro_leads / quadro_pagina / quadro_contagens ganham p_etiquetas_com e
--    p_etiquetas_sem (padrão nulo: o app antigo segue funcionando com o banco novo) e o cartão
--    recebe etiqueta_ids; transmissao_publico aceita etiquetas_com / etiquetas_sem no filtro.
--    Corpos copiados de 20261104000200 (quadro_leads), 20261106000100 (quadro_pagina),
--    20261111000400 (quadro_contagens) e 20261111000100 (transmissao_publico) — md5 conferido na
--    produção antes de aplicar — só com as linhas da etiqueta.
-- 8. core_fundir_contatos (copiada de 20261020000200_core_v1) soma as etiquetas do removido no
--    principal; antes se perderiam na fusão.
-- 9. Drop da assistente_status_conversas (lista de morte do 05): 0 leitores no código, nenhuma
--    função, view ou job do cron a cita, 0 chamadas no pg_stat_statements desde 10/11 16h33
--    (conferido 11/11 14h26).
--
-- Custo: a coluna nova tem padrão constante (sem reescrever contatos); o índice GIN é sobre ~6 mil
-- contatos. Os gatilhos de contatos só disparam quando etiqueta_ids muda (cláusula WHEN): o caminho
-- quente (webhook criando/atualizando contato) não paga nada.
-- Volta: supabase/scripts/volta/volta-etiquetas.sql (voltar o app antes).

-- 1 ─────────────────────────────────────────────────────────────────────────────
create table public.etiquetas (
  id          bigint generated always as identity primary key,
  empresa_id  bigint not null references public.empresas(id) on delete cascade,
  nome        text not null check (btrim(nome) <> '' and length(nome) <= 40),
  cor         text not null default 'cinza' check (cor in ('cinza', 'azul', 'verde', 'ambar', 'vermelho')),
  criada_por  uuid,
  created_at  timestamptz not null default now()
);
comment on table public.etiquetas is
  'Etiquetas da empresa (core, 11/11/2026). Nome unico na empresa sem caixa/espacos; cor da paleta. Contatos guardam os ids em contatos.etiqueta_ids.';
create unique index etiquetas_nome_uidx on public.etiquetas (empresa_id, lower(btrim(nome)));

alter table public.etiquetas enable row level security;
create policy etiquetas_leitura on public.etiquetas for select to authenticated
  using (empresa_id = (select get_empresa_id()));
create policy etiquetas_escrita on public.etiquetas for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
revoke all on public.etiquetas from anon, authenticated;
grant select, insert, update, delete on public.etiquetas to authenticated;
grant all on public.etiquetas to service_role;

-- 2 ─────────────────────────────────────────────────────────────────────────────
alter table public.contatos add column etiqueta_ids bigint[] not null default '{}';
comment on column public.contatos.etiqueta_ids is
  'Etiquetas do contato (ids de etiquetas da mesma empresa), sem repeticao e em ordem. Gatilhos validam e gravam o historico.';
create index contatos_etiquetas_idx on public.contatos using gin (etiqueta_ids);

create or replace function public.core_contato_etiquetas_validar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.etiqueta_ids := coalesce(array(select distinct x from unnest(new.etiqueta_ids) x where x is not null order by x), '{}');
  if exists (select 1 from unnest(new.etiqueta_ids) x
              where not exists (select 1 from etiquetas e where e.id = x and e.empresa_id = new.empresa_id)) then
    raise exception 'Etiqueta inexistente ou de outra empresa' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function public.core_contato_etiquetas_validar() from public, anon, authenticated;

create trigger contatos_etiquetas_validar_ins before insert on public.contatos
  for each row when (cardinality(new.etiqueta_ids) > 0)
  execute function public.core_contato_etiquetas_validar();
create trigger contatos_etiquetas_validar_upd before update of etiqueta_ids, empresa_id on public.contatos
  for each row when (new.etiqueta_ids is distinct from old.etiqueta_ids or new.empresa_id is distinct from old.empresa_id)
  execute function public.core_contato_etiquetas_validar();

-- 3 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.core_contato_etiquetas_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text := nullif(current_setting('nexus.etiqueta_motivo', true), '');
begin
  insert into negocio_historico (empresa_id, negocio_id, acao, por_usuario, detalhe)
  select new.empresa_id, a.id, m.acao, auth.uid(),
         jsonb_strip_nulls(jsonb_build_object('etiqueta_id', m.eid, 'nome', e.nome, 'cor', e.cor, 'motivo', v_motivo))
    from (select x as eid, 'etiqueta_aplicada' as acao from unnest(new.etiqueta_ids) x where not (x = any (old.etiqueta_ids))
          union all
          select x, 'etiqueta_tirada' from unnest(old.etiqueta_ids) x where not (x = any (new.etiqueta_ids))) m
    left join etiquetas e on e.id = m.eid
    cross join (
      select n.id from negocios n where n.contato_id = new.id and n.ativo
      union all
      select u.id from (select n.id from negocios n where n.contato_id = new.id
                         order by n.created_at desc, n.id desc limit 1) u
       where not exists (select 1 from negocios n where n.contato_id = new.id and n.ativo)
    ) a;
  return null;
end $$;
revoke all on function public.core_contato_etiquetas_historico() from public, anon, authenticated;

create trigger contatos_etiquetas_historico after update of etiqueta_ids on public.contatos
  for each row when (new.etiqueta_ids is distinct from old.etiqueta_ids)
  execute function public.core_contato_etiquetas_historico();

-- 4 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.etiquetas_aplicar(p_negocios bigint[], p_etiqueta bigint, p_aplicar boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_emp       bigint := get_empresa_id();
  v_achados   bigint[];
  v_contatos  bigint[];
  v_mudaram   bigint[];
begin
  if v_emp is null then raise exception 'Sem empresa na sessão' using errcode = '42501'; end if;
  if coalesce(cardinality(p_negocios), 0) = 0 then
    return jsonb_build_object('negocios', '[]'::jsonb, 'contatos', '[]'::jsonb, 'alcancados', 0);
  end if;
  if cardinality(p_negocios) > 500 then
    raise exception 'No máximo 500 negócios por vez' using errcode = '22023';
  end if;
  perform 1 from etiquetas where id = p_etiqueta and empresa_id = v_emp;
  if not found then raise exception 'Etiqueta não encontrada' using errcode = 'P0002'; end if;

  -- Só o que a RLS deixa a pessoa ver (negócio da loja dela).
  select array_agg(n.id), array_agg(distinct n.contato_id) filter (where n.contato_id is not null)
    into v_achados, v_contatos
    from negocios n
   where n.id = any (p_negocios) and n.empresa_id = v_emp;

  with u as (
    update contatos c
       set etiqueta_ids = case when p_aplicar then c.etiqueta_ids || p_etiqueta
                               else array_remove(c.etiqueta_ids, p_etiqueta) end
     where c.id = any (coalesce(v_contatos, '{}')) and c.empresa_id = v_emp
       and (c.etiqueta_ids @> array[p_etiqueta]) is distinct from coalesce(p_aplicar, false)
    returning c.id
  )
  select coalesce(array_agg(u.id), '{}') into v_mudaram from u;

  return jsonb_build_object(
    'negocios', coalesce((select jsonb_agg(n.id order by n.id) from negocios n
                           where n.id = any (coalesce(v_achados, '{}')) and n.contato_id = any (v_mudaram)), '[]'::jsonb),
    'contatos', to_jsonb(v_mudaram),
    'alcancados', coalesce(cardinality(v_achados), 0));
end $$;
revoke all on function public.etiquetas_aplicar(bigint[], bigint, boolean) from public, anon;
grant execute on function public.etiquetas_aplicar(bigint[], bigint, boolean) to authenticated, service_role;
comment on function public.etiquetas_aplicar(bigint[], bigint, boolean) is
  'Aplica (true) ou tira (false) a etiqueta dos contatos dos negocios pedidos que a sessao alcanca (RLS). Devolve os negocios cujo contato mudou.';

-- 5 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.core_etiqueta_apagada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('nexus.etiqueta_motivo', 'etiqueta apagada', true);
  update contatos set etiqueta_ids = array_remove(etiqueta_ids, old.id)
   where empresa_id = old.empresa_id and etiqueta_ids @> array[old.id];
  perform set_config('nexus.etiqueta_motivo', '', true);
  return old;
end $$;
revoke all on function public.core_etiqueta_apagada() from public, anon, authenticated;

create trigger etiquetas_apagar before delete on public.etiquetas
  for each row execute function public.core_etiqueta_apagada();

-- 6 ─────────────────────────────────────────────────────────────────────────────
alter table public.automacoes drop constraint if exists automacoes_gatilho_check;
alter table public.automacoes add constraint automacoes_gatilho_check
  check (gatilho = any (array['entrou_na_etapa', 'parado_x_horas', 'recebeu_etiqueta']));
alter table public.automacoes add column etiqueta_id bigint references public.etiquetas(id) on delete cascade;
alter table public.automacoes add constraint automacoes_etiqueta_check
  check (gatilho <> 'recebeu_etiqueta' or etiqueta_id is not null);
create index automacoes_etiqueta_idx on public.automacoes (etiqueta_id) where etiqueta_id is not null;

-- 7 ─────────────────────────────────────────────────────────────────────────────
-- Assinaturas novas (dois parâmetros a mais, com padrão): derrubar as antigas para não ficar
-- sobrecarga ambígua no PostgREST. Ninguém no banco chama estas três (só o app).
drop function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]);
drop function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]);
drop function public.quadro_contagens(bigint, uuid, boolean, uuid);

create function public.quadro_leads(
  p_funil bigint,
  p_por_etapa integer default 50,
  p_etapa text default null,
  p_antes_momento timestamptz default null,
  p_antes_id bigint default null,
  p_responsavel uuid default null,
  p_esteira boolean default false,
  p_so_meus uuid default null,
  p_ids bigint[] default null,
  p_etiquetas_com bigint[] default null,
  p_etiquetas_sem bigint[] default null
)
-- Só o que o cartão do funil usa (nome, origem, produto, valor, responsável, não lidas, tempos,
-- etiquetas) e o que o score e a qualificação olham — telefone e Instagram só como "tem": o card do
-- lead busca o resto quando abre. O cursor do "carregar mais" é (última mensagem ou criação, id).
returns table (
  id bigint, contato_id bigint, nome text, tem_telefone boolean, tem_instagram boolean, origem text,
  kanban_status text, responsavel_id uuid, created_at timestamptz, valor_estimado numeric,
  produto_interessado text, tem_primeira_msg boolean, ultima_tratativa timestamptz,
  msgs_nao_lidas integer, ultima_mensagem_at timestamptz, ultima_recebida_at timestamptz,
  ultima_enviada_at timestamptz, etiqueta_ids bigint[]
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with b as (
    select * from quadro_base(p_funil, p_so_meus) q
     where (p_responsavel is null or q.responsavel_id = p_responsavel)
       and (not coalesce(p_esteira, false) or q.responsavel_id is null)
       -- Etiqueta: "contém" = tem alguma das escolhidas; "não contém" = não tem nenhuma delas.
       and (coalesce(cardinality(p_etiquetas_com), 0) = 0
            or exists (select 1 from contatos c where c.id = q.contato_id and c.etiqueta_ids && p_etiquetas_com))
       and (coalesce(cardinality(p_etiquetas_sem), 0) = 0
            or not exists (select 1 from contatos c where c.id = q.contato_id and c.etiqueta_ids && p_etiquetas_sem))
  ),
  escolhidos as (
    -- 1) pelos ids (tempo real): o lead como o quadro o mostraria agora — ou nada,
    --    se ele saiu do funil, foi arquivado ou não passa nos filtros.
    select b.* from b where p_ids is not null and b.id = any (p_ids)
    union all
    -- 2) mais uma página de UMA etapa, depois do último cartão já na tela.
    select * from (
      select b.* from b
       where p_ids is null and p_etapa is not null and b.kanban_status = p_etapa
         and (p_antes_momento is null or (b.momento, b.id) < (p_antes_momento, p_antes_id))
       order by b.momento desc, b.id desc
       limit greatest(p_por_etapa, 1)
    ) pagina
    union all
    -- 3) a abertura: os mais recentes de cada etapa.
    select r.id, r.contato_id, r.filial_id, r.nome, r.telefone, r.instagram, r.origem, r.kanban_status,
           r.responsavel_id, r.created_at, r.funil_id, r.valor_estimado, r.produto_interessado,
           r.tem_primeira_msg, r.ultima_tratativa, r.msgs_nao_lidas, r.ultima_mensagem_at,
           r.ultima_recebida_at, r.ultima_enviada_at, r.momento
      from (select b.*, row_number() over (partition by b.kanban_status order by b.momento desc, b.id desc) as rn
              from b where p_ids is null and p_etapa is null) r
     where r.rn <= greatest(p_por_etapa, 1)
  )
  select e.id, e.contato_id, e.nome, nullif(e.telefone, '') is not null, nullif(e.instagram, '') is not null,
         e.origem, e.kanban_status, e.responsavel_id, e.created_at, e.valor_estimado, e.produto_interessado,
         e.tem_primeira_msg, e.ultima_tratativa, e.msgs_nao_lidas, e.ultima_mensagem_at, e.ultima_recebida_at,
         e.ultima_enviada_at, (select c.etiqueta_ids from contatos c where c.id = e.contato_id)
    from escolhidos e
   order by e.kanban_status, e.momento desc, e.id desc
$$;

create function public.quadro_pagina(
  p_funil bigint,
  p_por_etapa integer default 50,
  p_etapa text default null,
  p_antes_momento timestamptz default null,
  p_antes_id bigint default null,
  p_responsavel uuid default null,
  p_esteira boolean default false,
  p_so_meus uuid default null,
  p_ids bigint[] default null,
  p_etiquetas_com bigint[] default null,
  p_etiquetas_sem bigint[] default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'colunas', jsonb_build_array('id', 'contato_id', 'nome', 'tem_telefone', 'tem_instagram', 'origem', 'kanban_status', 'responsavel_id', 'created_at', 'valor_estimado', 'produto_interessado', 'tem_primeira_msg', 'ultima_tratativa', 'msgs_nao_lidas', 'ultima_mensagem_at', 'ultima_recebida_at', 'ultima_enviada_at', 'etiqueta_ids'),
    'linhas', coalesce(jsonb_agg(jsonb_build_array(q.id, q.contato_id, q.nome, q.tem_telefone, q.tem_instagram, q.origem, q.kanban_status, q.responsavel_id, q.created_at, q.valor_estimado, q.produto_interessado, q.tem_primeira_msg, q.ultima_tratativa, q.msgs_nao_lidas, q.ultima_mensagem_at, q.ultima_recebida_at, q.ultima_enviada_at, q.etiqueta_ids)
                         order by q.kanban_status, coalesce(q.ultima_recebida_at, q.created_at) desc, q.id desc), '[]'::jsonb))
    from quadro_leads(p_funil, p_por_etapa, p_etapa, p_antes_momento, p_antes_id, p_responsavel, p_esteira, p_so_meus, p_ids, p_etiquetas_com, p_etiquetas_sem) q
$$;

create function public.quadro_contagens(p_funil bigint, p_responsavel uuid default null, p_esteira boolean default false, p_so_meus uuid default null,
                                        p_etiquetas_com bigint[] default null, p_etiquetas_sem bigint[] default null)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with base as (select * from quadro_base(p_funil, p_so_meus)),
  f as (
    select * from base
     where (p_responsavel is null or responsavel_id = p_responsavel)
       and (not coalesce(p_esteira, false) or responsavel_id is null)
       and (coalesce(cardinality(p_etiquetas_com), 0) = 0
            or exists (select 1 from contatos c where c.id = base.contato_id and c.etiqueta_ids && p_etiquetas_com))
       and (coalesce(cardinality(p_etiquetas_sem), 0) = 0
            or not exists (select 1 from contatos c where c.id = base.contato_id and c.etiqueta_ids && p_etiquetas_sem))
  ),
  -- A regra única (esperando_resposta). Candidatos e não-clientes ficam fora da conta.
  esp as (select e.negocio_id from esperando_resposta_visiveis() e where not e.a_parte)
  select jsonb_build_object(
    'etapas', coalesce((
      select jsonb_object_agg(kanban_status, jsonb_build_object(
               'total', total, 'valor', valor, 'aguardando', aguardando))
        from (select kanban_status, count(*) as total, coalesce(sum(valor_estimado), 0) as valor,
                     count(*) filter (where f.id in (select negocio_id from esp)) as aguardando
                from f group by kanban_status) t), '{}'::jsonb),
    -- A esteira conta o funil inteiro (sem o filtro de responsável), como o botão sempre contou.
    'esteira', (select count(*) from base where responsavel_id is null)
  )
$function$;

revoke all on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]) from public, anon;
revoke all on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]) from public, anon;
revoke all on function public.quadro_contagens(bigint, uuid, boolean, uuid, bigint[], bigint[]) from public, anon;
grant execute on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]) to authenticated, service_role;
grant execute on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]) to authenticated, service_role;
grant execute on function public.quadro_contagens(bigint, uuid, boolean, uuid, bigint[], bigint[]) to authenticated, service_role;

-- Transmissão: etiquetas_com / etiquetas_sem (arrays de ids) no filtro.
create or replace function public.transmissao_publico(p_empresa bigint, p_filial bigint, p_filtro jsonb, p_modelo bigint)
returns table (contato_id bigint, negocio_id bigint, nome text, telefone text, fora text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  f         jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_funil   bigint := nullif(f ->> 'funil_id', '')::bigint;
  v_etapas  bigint[] := case when jsonb_typeof(f -> 'etapa_ids') = 'array' and jsonb_array_length(f -> 'etapa_ids') > 0
                         then array(select jsonb_array_elements_text(f -> 'etapa_ids')::bigint) end;
  v_sit     text[] := case when jsonb_typeof(f -> 'situacoes') = 'array' and jsonb_array_length(f -> 'situacoes') > 0
                         then array(select jsonb_array_elements_text(f -> 'situacoes')) end;
  v_orig    text[] := case when jsonb_typeof(f -> 'origens') = 'array' and jsonb_array_length(f -> 'origens') > 0
                         then array(select lower(jsonb_array_elements_text(f -> 'origens'))) end;
  v_etq_com bigint[] := case when jsonb_typeof(f -> 'etiquetas_com') = 'array' and jsonb_array_length(f -> 'etiquetas_com') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_com')::bigint) end;
  v_etq_sem bigint[] := case when jsonb_typeof(f -> 'etiquetas_sem') = 'array' and jsonb_array_length(f -> 'etiquetas_sem') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_sem')::bigint) end;
  v_sem     int := nullif(f ->> 'sem_mensagem_ha_dias', '')::int;
  v_com     int := nullif(f ->> 'com_mensagem_nos_dias', '')::int;
begin
  return query
  with negs as (
    select distinct on (n.contato_id) n.contato_id, n.id as negocio_id
      from negocios n
      join contatos c on c.id = n.contato_id
     where n.empresa_id = p_empresa
       and (p_filial is null or n.filial_id = p_filial)
       and (v_funil is null or n.funil_id = v_funil)
       and (v_etapas is null or n.etapa_id = any (v_etapas))
       and (v_sit is null or n.status = any (v_sit))
       and (v_orig is null or lower(coalesce(c.origem, '')) = any (v_orig))
       and (v_etq_com is null or c.etiqueta_ids && v_etq_com)
       and (v_etq_sem is null or not (c.etiqueta_ids && v_etq_sem))
     order by n.contato_id, n.created_at desc, n.id desc
  ), com_msg as (
    select x.*, (select max(cv.ultima_mensagem_at) from conversas cv
                  where cv.empresa_id = p_empresa and cv.contato_id = x.contato_id
                    and (p_filial is null or cv.filial_id = p_filial or cv.filial_id is null)) as ultima
      from negs x
  )
  select m.contato_id, m.negocio_id, c.nome,
         nullif(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g'), ''),
         case
           when c.opt_out_em is not null then 'opt_out'
           when c.ativo = false then 'bloqueado'
           when length(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g')) < 10 then 'sem_telefone'
           when p_modelo is not null and (
                  exists (select 1 from transmissao_envios e
                           where e.contato_id = m.contato_id and e.modelo_id = p_modelo and e.status = 'enviada'
                             and e.enviada_em > now() - interval '7 days')
               or exists (select 1 from automacao_execucoes a
                           where a.contato_id = m.contato_id and a.modelo_id = p_modelo and a.acao = 'enviar_modelo'
                             and a.status = 'executada' and a.executada_em > now() - interval '7 days'))
             then 'modelo_7_dias'
         end
    from com_msg m
    join contatos c on c.id = m.contato_id
   where (v_sem is null or m.ultima is null or m.ultima < now() - make_interval(days => v_sem))
     and (v_com is null or (m.ultima is not null and m.ultima >= now() - make_interval(days => v_com)));
end $$;
revoke all on function public.transmissao_publico(bigint, bigint, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.transmissao_publico(bigint, bigint, jsonb, bigint) to service_role;

-- 8 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.core_fundir_contatos(p_empresa bigint, p_principal bigint, p_removido bigint)
  returns jsonb
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_movido jsonb := '{}'::jsonb;
  v_n int;
  r record;
  v_conv record;
  v_destino bigint;
begin
  if p_principal = p_removido then
    raise exception 'O contato principal e o removido são o mesmo registro';
  end if;
  perform 1 from contatos where id = p_principal and empresa_id = p_empresa;
  if not found then raise exception 'Contato principal não encontrado nesta empresa'; end if;
  perform 1 from contatos where id = p_removido and empresa_id = p_empresa;
  if not found then raise exception 'Contato removido não encontrado nesta empresa'; end if;

  -- Campos vazios do principal recebem os do removido; dados: o principal vence.
  -- Etiquetas: as dos dois (11/11/2026), com o motivo no histórico.
  perform set_config('nexus.etiqueta_motivo', 'fusão de contatos', true);
  update contatos p set
    nome = coalesce(p.nome, r2.nome), telefone = coalesce(p.telefone, r2.telefone),
    telefone_e164 = coalesce(p.telefone_e164, r2.telefone_e164), email = coalesce(p.email, r2.email),
    cpf_cnpj = coalesce(p.cpf_cnpj, r2.cpf_cnpj), instagram = coalesce(p.instagram, r2.instagram),
    foto_url = coalesce(p.foto_url, r2.foto_url), origem = coalesce(p.origem, r2.origem),
    origem_id = coalesce(p.origem_id, r2.origem_id), responsavel_id = coalesce(p.responsavel_id, r2.responsavel_id),
    observacoes = coalesce(p.observacoes, r2.observacoes),
    endereco = r2.endereco || p.endereco, dados = r2.dados || p.dados,
    etiqueta_ids = p.etiqueta_ids || r2.etiqueta_ids
  from contatos r2 where p.id = p_principal and r2.id = p_removido;
  perform set_config('nexus.etiqueta_motivo', '', true);
  -- o telefone do removido sai antes do delete para não violar o índice único na troca
  update contatos set telefone_e164 = null where id = p_removido;

  -- Conversas: mesmo canal nos dois → mensagens vão para a conversa do principal.
  for v_conv in select * from conversas where contato_id = p_removido loop
    select id into v_destino from conversas
     where contato_id = p_principal and canal_id is not distinct from v_conv.canal_id;
    if found then
      update mensagens set conversa_id = v_destino where conversa_id = v_conv.id;
      delete from conversas where id = v_conv.id;
    else
      update conversas set contato_id = p_principal where id = v_conv.id;
    end if;
  end loop;

  update contato_identidades set contato_id = p_principal
   where contato_id = p_removido
     and not exists (select 1 from contato_identidades x
                      where x.contato_id = p_principal and x.canal_tipo = contato_identidades.canal_tipo
                        and x.external_id = contato_identidades.external_id);

  for r in
    select cl.relname as tabela, a.attname as coluna
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.contatos'::regclass
       and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and cl.relname not in ('contato_fusoes', 'contato_identidades')
  loop
    execute format('update public.%I set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna)
      using p_principal, p_removido;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_movido := v_movido || jsonb_build_object(r.tabela || '.' || r.coluna, v_n); end if;
  end loop;

  insert into contato_fusoes (empresa_id, contato_principal_id, contato_removido_id, movido, por_usuario)
  values (p_empresa, p_principal, p_removido, v_movido, auth.uid());
  insert into eventos (empresa_id, tipo, entidade, entidade_id, dados, por_usuario)
  values (p_empresa, 'contato.fundido', 'contato', p_principal,
          jsonb_build_object('removido', p_removido, 'movido', v_movido), auth.uid());
  delete from contatos where id = p_removido;
  return v_movido;
end $$;

-- 9 ─────────────────────────────────────────────────────────────────────────────
drop function public.assistente_status_conversas(bigint);

-- VOLTA de 20261111000500_etiquetas. Voltar o APP antes (o app novo chama etiquetas_aplicar e os
-- parâmetros p_etiquetas_* do quadro). Apaga as etiquetas e o que foi aplicado; o histórico
-- (negocio_historico 'etiqueta_aplicada'/'etiqueta_tirada') fica, como registro.
-- Corpos de volta: quadro_leads (20261104000200), quadro_pagina (20261106000100), quadro_contagens
-- (20261111000400), transmissao_publico (20261111000100), core_fundir_contatos (20261020000200),
-- assistente_status_conversas (20261105001200).

begin;

drop function if exists public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]);
drop function if exists public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[], bigint[], bigint[]);
drop function if exists public.quadro_contagens(bigint, uuid, boolean, uuid, bigint[], bigint[]);

create or replace function public.quadro_leads(
  p_funil bigint,
  p_por_etapa integer default 50,
  p_etapa text default null,
  p_antes_momento timestamptz default null,
  p_antes_id bigint default null,
  p_responsavel uuid default null,
  p_esteira boolean default false,
  p_so_meus uuid default null,
  p_ids bigint[] default null
)
-- Só o que o cartão do funil usa (nome, origem, produto, valor, responsável, não lidas, tempos) e
-- o que o score e a qualificação olham — telefone e Instagram só como "tem": o card do lead
-- busca o resto quando abre. O cursor do "carregar mais" é (última mensagem ou criação, id).
returns table (
  id bigint, contato_id bigint, nome text, tem_telefone boolean, tem_instagram boolean, origem text,
  kanban_status text, responsavel_id uuid, created_at timestamptz, valor_estimado numeric,
  produto_interessado text, tem_primeira_msg boolean, ultima_tratativa timestamptz,
  msgs_nao_lidas integer, ultima_mensagem_at timestamptz, ultima_recebida_at timestamptz,
  ultima_enviada_at timestamptz
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with b as (
    select * from quadro_base(p_funil, p_so_meus) q
     where (p_responsavel is null or q.responsavel_id = p_responsavel)
       and (not coalesce(p_esteira, false) or q.responsavel_id is null)
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
         e.ultima_enviada_at
    from escolhidos e
   order by e.kanban_status, e.momento desc, e.id desc
$$;

create or replace function public.quadro_pagina(
  p_funil bigint,
  p_por_etapa integer default 50,
  p_etapa text default null,
  p_antes_momento timestamptz default null,
  p_antes_id bigint default null,
  p_responsavel uuid default null,
  p_esteira boolean default false,
  p_so_meus uuid default null,
  p_ids bigint[] default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'colunas', jsonb_build_array('id', 'contato_id', 'nome', 'tem_telefone', 'tem_instagram', 'origem', 'kanban_status', 'responsavel_id', 'created_at', 'valor_estimado', 'produto_interessado', 'tem_primeira_msg', 'ultima_tratativa', 'msgs_nao_lidas', 'ultima_mensagem_at', 'ultima_recebida_at', 'ultima_enviada_at'),
    'linhas', coalesce(jsonb_agg(jsonb_build_array(q.id, q.contato_id, q.nome, q.tem_telefone, q.tem_instagram, q.origem, q.kanban_status, q.responsavel_id, q.created_at, q.valor_estimado, q.produto_interessado, q.tem_primeira_msg, q.ultima_tratativa, q.msgs_nao_lidas, q.ultima_mensagem_at, q.ultima_recebida_at, q.ultima_enviada_at)
                         order by q.kanban_status, coalesce(q.ultima_recebida_at, q.created_at) desc, q.id desc), '[]'::jsonb))
    from quadro_leads(p_funil, p_por_etapa, p_etapa, p_antes_momento, p_antes_id, p_responsavel, p_esteira, p_so_meus, p_ids) q
$$;

create or replace function public.quadro_contagens(p_funil bigint, p_responsavel uuid default null, p_esteira boolean default false, p_so_meus uuid default null)
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

revoke all on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) from public, anon;
revoke all on function public.quadro_contagens(bigint, uuid, boolean, uuid) from public, anon;
revoke all on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) from public, anon;
grant execute on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) to authenticated, service_role;
grant execute on function public.quadro_contagens(bigint, uuid, boolean, uuid) to authenticated, service_role;
grant execute on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) to authenticated, service_role;

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
  update contatos p set
    nome = coalesce(p.nome, r2.nome), telefone = coalesce(p.telefone, r2.telefone),
    telefone_e164 = coalesce(p.telefone_e164, r2.telefone_e164), email = coalesce(p.email, r2.email),
    cpf_cnpj = coalesce(p.cpf_cnpj, r2.cpf_cnpj), instagram = coalesce(p.instagram, r2.instagram),
    foto_url = coalesce(p.foto_url, r2.foto_url), origem = coalesce(p.origem, r2.origem),
    origem_id = coalesce(p.origem_id, r2.origem_id), responsavel_id = coalesce(p.responsavel_id, r2.responsavel_id),
    observacoes = coalesce(p.observacoes, r2.observacoes),
    endereco = r2.endereco || p.endereco, dados = r2.dados || p.dados
  from contatos r2 where p.id = p_principal and r2.id = p_removido;
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

create or replace function public.assistente_status_conversas(p_empresa bigint)
returns table(lead_id bigint, ultima_recebida timestamp with time zone, ultima_enviada timestamp with time zone, mensagens integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with principal as (
    select distinct on (n.contato_id, coalesce(n.filial_id, -1)) n.id, n.contato_id, n.filial_id
      from public.negocios n
     where n.empresa_id = p_empresa
     order by n.contato_id, coalesce(n.filial_id, -1), n.ativo desc, n.created_at desc, n.id desc
  )
  select p.id,
         max(m.created_at) filter (where m.direcao = 'recebida'),
         max(m.created_at) filter (where m.direcao = 'enviada'),
         count(*)::int
    from public.mensagens m
    join principal p on p.contato_id = m.contato_id and coalesce(p.filial_id, -1) = coalesce(m.filial_id, -1)
   where m.empresa_id = p_empresa
   group by p.id
$function$;

revoke all on function public.assistente_status_conversas(bigint) from public, anon, authenticated;
grant execute on function public.assistente_status_conversas(bigint) to service_role;

alter table public.automacoes drop constraint if exists automacoes_etiqueta_check;
delete from public.automacoes where gatilho = 'recebeu_etiqueta';
alter table public.automacoes drop column if exists etiqueta_id;
alter table public.automacoes drop constraint if exists automacoes_gatilho_check;
alter table public.automacoes add constraint automacoes_gatilho_check
  check (gatilho = any (array['entrou_na_etapa', 'parado_x_horas']));

drop trigger if exists etiquetas_apagar on public.etiquetas;
drop trigger if exists contatos_etiquetas_historico on public.contatos;
drop trigger if exists contatos_etiquetas_validar_ins on public.contatos;
drop trigger if exists contatos_etiquetas_validar_upd on public.contatos;
drop function if exists public.etiquetas_aplicar(bigint[], bigint, boolean);
drop function if exists public.core_etiqueta_apagada();
drop function if exists public.core_contato_etiquetas_historico();
drop function if exists public.core_contato_etiquetas_validar();
drop index if exists public.contatos_etiquetas_idx;
alter table public.contatos drop column if exists etiqueta_ids;
drop table if exists public.etiquetas;

commit;

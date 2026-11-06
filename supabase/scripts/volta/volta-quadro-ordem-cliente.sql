-- Volta de 20261106000100_quadro_ordem_cliente: o quadro volta a subir pela última
-- mensagem de qualquer lado (as duas funções como em 20261104000200_quadro_core.sql).
-- O app de antes (Instant Rollback) ordena igual a esta volta.

create or replace function public.quadro_base(p_funil bigint, p_so_meus uuid default null)
returns table (
  id bigint, contato_id bigint, filial_id bigint, nome text, telefone text, instagram text, origem text,
  kanban_status text, responsavel_id uuid, created_at timestamptz, funil_id bigint, valor_estimado numeric,
  produto_interessado text, tem_primeira_msg boolean, ultima_tratativa timestamptz,
  msgs_nao_lidas integer, ultima_mensagem_at timestamptz, ultima_recebida_at timestamptz,
  ultima_enviada_at timestamptz, momento timestamptz
)
language sql
stable
-- A RLS faz o planejador estimar uma linha e escolher laço aninhado, refazendo as agregações
-- por lead (3,2 s no local). Com hash, cada agregação roda uma vez.
set enable_nestloop to off
set search_path to 'public', 'pg_temp'
as $$
  with emp as (select get_empresa_id() as id),
  padrao as (
    select f.id from funis f where f.empresa_id = (select id from emp) and f.padrao order by f.nome, f.id limit 1
  ),
  principal as (
    select distinct on (n.contato_id, coalesce(n.filial_id, -1)) n.id
      from negocios n
     where n.empresa_id = (select id from emp)
     order by n.contato_id, coalesce(n.filial_id, -1),
              coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc
  ),
  conv as (
    select x.contato_id, coalesce(x.filial_id, -1) as f,
           max(x.ultima_mensagem_at) as um, max(x.ultima_recebida_at) as ur, max(x.ultima_enviada_at) as ue
      from conversas x where x.empresa_id = (select id from emp)
     group by 1, 2
  ),
  -- Não lidas pelo índice parcial mensagens_nao_lidas_idx (conversa → mensagens recebidas não
  -- lidas), contadas pelo contato e loja DA MENSAGEM, como v_leads_nao_lidas.
  nl as (
    select m.contato_id, coalesce(m.filial_id, -1) as f, count(*)::integer as n
      from conversas x
      join mensagens m on m.conversa_id = x.id and m.direcao = 'recebida' and not m.lida
     where x.empresa_id = (select id from emp)
     group by 1, 2
  )
  select n.id, n.contato_id, n.filial_id, c.nome, c.telefone, c.instagram, c.origem,
         coalesce(e.slug, n.dados -> '_lead' ->> 'kanban_status', 'novo'),
         n.responsavel_id, n.created_at, n.funil_id, n.valor_estimado,
         n.dados ->> 'produto_interessado',
         (n.dados -> '_lead' ->> 'primeira_msg') is not null,
         (n.dados -> '_lead' ->> 'ultima_tratativa')::timestamptz,
         coalesce(case when p.id is not null then nl.n end, 0),
         case when p.id is not null then cv.um end,
         case when p.id is not null then cv.ur end,
         case when p.id is not null then cv.ue end,
         coalesce(case when p.id is not null then cv.um end, n.created_at)
    from negocios n
    join contatos c on c.id = n.contato_id
    left join funil_etapas e on e.id = n.etapa_id
    left join principal p on p.id = n.id
    left join conv cv on cv.contato_id = n.contato_id and cv.f = coalesce(n.filial_id, -1)
    left join nl on nl.contato_id = n.contato_id and nl.f = coalesce(n.filial_id, -1)
   where n.empresa_id = (select id from emp)
     and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
     -- Funil nulo = todos (empresa sem funil cadastrado, como a tela antiga mostrava).
     and (p_funil is null or coalesce(n.funil_id, (select id from padrao)) = p_funil)
     -- Sem "ver leads de outros": os dele e a esteira (sem dono é de todos).
     and (p_so_meus is null or n.responsavel_id is null or n.responsavel_id = p_so_meus)
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
                         order by q.kanban_status, coalesce(q.ultima_mensagem_at, q.created_at) desc, q.id desc), '[]'::jsonb))
    from quadro_leads(p_funil, p_por_etapa, p_etapa, p_antes_momento, p_antes_id, p_responsavel, p_esteira, p_so_meus, p_ids) q
$$;

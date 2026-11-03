-- O QUADRO DE LEADS LÊ O CORE (04/11/2026). Só funções novas; nenhuma tabela muda.
--
-- A tela /leads carregava TODOS os leads da empresa pela view `leads` (5,1 MB por
-- abertura em Mogi, 03/11) para desenhar 5 colunas. Agora ela pede:
--
--   quadro_contagens(funil, ...)   total, valor e aguardando resposta por etapa + a
--                                  esteira, numa consulta agregada (o topo do quadro e
--                                  o cabeçalho de cada coluna);
--   quadro_pagina(funil, ...)      (entrega compacta de quadro_leads para a tela)
--   quadro_leads(funil, ...)       os 50 mais recentes de cada etapa, ou os próximos 50
--                                  de uma etapa ("carregar mais", cursor), ou alguns
--                                  leads pelo id (o tempo real) — só as colunas que o
--                                  cartão do funil mostra.
--
-- Leem negocios + contatos + conversas + mensagens direto. SECURITY INVOKER: a RLS de
-- quem chama decide (o vendedor vê a loja dele). As regras são as da view:
--   - status = slug da etapa, ou o kanban_status legado em dados._lead, ou 'novo';
--   - lead arquivado (dados._lead.ativo = false) não aparece;
--   - negócio sem funil conta no funil padrão;
--   - últimas mensagens vêm de conversas do contato na MESMA loja, e só para o negócio
--     principal dele naquela loja (o mais recente, ativo primeiro) — como a view;
--   - não lidas contam mensagens recebidas não lidas, como v_leads_nao_lidas (o topo
--     do quadro já usava esta conta, não o contador de conversas);
--   - ordem: última mensagem (ou criação) mais recente primeiro, id como desempate.
--
-- Volta: drop das três funções (supabase/scripts/volta/volta-quadro-core.sql).

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

create or replace function public.quadro_contagens(
  p_funil bigint,
  p_responsavel uuid default null,
  p_esteira boolean default false,
  p_so_meus uuid default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with base as (select * from quadro_base(p_funil, p_so_meus)),
  f as (
    select * from base
     where (p_responsavel is null or responsavel_id = p_responsavel)
       and (not coalesce(p_esteira, false) or responsavel_id is null)
  )
  select jsonb_build_object(
    'etapas', coalesce((
      select jsonb_object_agg(kanban_status, jsonb_build_object(
               'total', total, 'valor', valor, 'aguardando', aguardando))
        from (select kanban_status, count(*) as total, coalesce(sum(valor_estimado), 0) as valor,
                     count(*) filter (where msgs_nao_lidas > 0) as aguardando
                from f group by kanban_status) t), '{}'::jsonb),
    -- A esteira conta o funil inteiro (sem o filtro de responsável), como o botão sempre contou.
    'esteira', (select count(*) from base where responsavel_id is null)
  )
$$;

-- A entrega para a tela: as mesmas linhas de quadro_leads, com os nomes das colunas UMA vez e
-- cada lead como lista de valores — metade do tamanho (220 KB → ~110 KB nos 452 cartões do funil
-- principal da JM), porque o nome de cada campo repetido em cada linha era o grosso do peso.
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

-- Só quem está logado; a RLS faz o resto.
revoke all on function public.quadro_base(bigint, uuid) from public, anon;
revoke all on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) from public, anon;
revoke all on function public.quadro_contagens(bigint, uuid, boolean, uuid) from public, anon;
revoke all on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) from public, anon;
grant execute on function public.quadro_base(bigint, uuid) to authenticated, service_role;
grant execute on function public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) to authenticated, service_role;
grant execute on function public.quadro_contagens(bigint, uuid, boolean, uuid) to authenticated, service_role;
grant execute on function public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]) to authenticated, service_role;

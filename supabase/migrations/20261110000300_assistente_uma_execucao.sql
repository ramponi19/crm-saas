-- O ASSISTENTE NUMA EXECUÇÃO SÓ (10/11/2026). Pedido do Lucas depois da medição de 10/11:
-- das 10h42 às 10h49 a ferramenta leads_buscar rodou 5 vezes em 2 minutos e cada pergunta disparava ~25
-- consultas ao mesmo tempo: a assistente_status_conversas paginada em ondas de 8 (cada página recalcula
-- a função INTEIRA: 9 execuções por pergunta), mais 8 páginas paralelas das fichas e 4 dos leads. O
-- banco enfileirou tudo e o dashboard e o resumo da mesma pessoa estouraram 15 vezes.
--
-- 1. assistente_status_leads: status da conversa + ficha curta, SÓ dos leads ativos que passam nos
--    filtros da pergunta (loja, esperando, ativo nos últimos N dias, parado há N dias, classificação),
--    numa execução e num jsonb (sem o corte de 1.000 linhas do PostgREST, sem paginar). Os filtros de dias
--    são uma PRÉ-SELEÇÃO com folga (nunca mais estreita que a regra do app); a regra exata continua no app.
--    Por que a antiga levava 0,7 a 3,8 s para 3.220 linhas (EXPLAIN de 10/11): ela junta 112.698 mensagens
--    aos negócios ANTES de agregar — a junção sai pelo índice de contato com acesso aleatório (59.311
--    páginas lidas contra as 4.717 da tabela), o planejador estima 368 linhas onde há 112.688 e a
--    ordenação do group by cai em disco (external merge, 3,8 MB). Aqui agrega-se primeiro (uma passada
--    sequencial, hash de 600 kB em memória, 3.222 grupos) e só os grupos encontram os negócios.
-- 2. assistente_leads_visiveis: os leads ativos que QUEM PERGUNTA vê (security invoker: a RLS de empresa e
--    de loja vale como na leitura da tabela), num jsonb — era 1 a 4 páginas de 1.000. Mesmos campos do
--    select embutido de antes (contato e etapa sob a RLS deles também).
--
-- A assistente_status_conversas fica (o app de antes a usa até o deploy; volta = só voltar o app).
-- Volta: supabase/scripts/volta/volta-assistente-uma-execucao.sql.

create or replace function public.assistente_status_leads(
  p_empresa       bigint,
  p_filial        bigint  default null,
  p_esperando     boolean default null,
  p_ativo_dias    integer default null,
  p_parado_dias   integer default null,
  p_classificacao text    default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with conversa as materialized (
    select m.contato_id,
           coalesce(m.filial_id, -1) as filial,
           max(m.created_at) filter (where m.direcao = 'recebida') as rec,
           max(m.created_at) filter (where m.direcao = 'enviada')  as env,
           count(*)::int as n
      from public.mensagens m
     where m.empresa_id = p_empresa
       and (p_filial is null or m.filial_id = p_filial)
     group by 1, 2
  ), principal as (
    -- O negócio PRINCIPAL de cada contato em cada loja (ativo primeiro, o mais novo), como antes.
    select distinct on (n.contato_id, coalesce(n.filial_id, -1))
           n.id, n.contato_id, coalesce(n.filial_id, -1) as filial, n.ativo
      from public.negocios n
     where n.empresa_id = p_empresa
       and (p_filial is null or n.filial_id = p_filial)
     order by n.contato_id, coalesce(n.filial_id, -1), n.ativo desc, n.created_at desc, n.id desc
  ), lead as (
    select p.id, c.rec, c.env, c.n, greatest(c.rec, c.env) as ultima
      from conversa c
      join principal p on p.contato_id = c.contato_id and p.filial = c.filial
     where p.ativo
  )
  select coalesce(jsonb_agg(jsonb_build_array(
           l.id, l.rec, l.env, l.n,
           f.mensagens, f.perfil ->> 'classificacao', f.perfil ->> 'score', f.perfil ->> 'urgencia',
           f.perfil ->> 'perfil', f.perfil ->> 'proximaAcao', f.lead_id is not null
         ) order by l.id), '[]'::jsonb)
    from lead l
    left join public.zapintel_lead_perfil f on f.lead_id = l.id and f.empresa_id = p_empresa
   where (p_esperando is null
          or p_esperando = (l.rec is not null and (l.env is null or l.rec > l.env)))
     -- App: fica se floor((agora - última) / 1 dia) <= N. Folga de 5 min (o cache do app dura 60 s).
     and (p_ativo_dias is null
          or l.ultima >= now() - make_interval(days => p_ativo_dias + 1) - interval '5 minutes')
     -- App: fica se floor((agora - última) / 1 dia) >= N.
     and (p_parado_dias is null
          or l.ultima <= now() - make_interval(days => p_parado_dias) + interval '5 minutes')
     and (p_classificacao is null or f.perfil ->> 'classificacao' = p_classificacao)
$$;

revoke all on function public.assistente_status_leads(bigint, bigint, boolean, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.assistente_status_leads(bigint, bigint, boolean, integer, integer, text)
  to service_role;

comment on function public.assistente_status_leads(bigint, bigint, boolean, integer, integer, text) is
  'Assistente (leads_buscar): por lead ATIVO com conversa, [id, ultima_recebida, ultima_enviada, mensagens, '
  'ficha.mensagens, classificacao, score, urgencia, perfil, proximaAcao, tem_ficha], ja filtrado pela pergunta, '
  'numa execucao. Só service role; o app cruza com assistente_leads_visiveis (sessao de quem pergunta).';

create or replace function public.assistente_leads_visiveis(
  p_empresa     bigint,
  p_filial      bigint default null,
  p_responsavel uuid   default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'contato_id', n.contato_id,
           'filial_id', n.filial_id,
           'created_at', n.created_at,
           'responsavel_id', n.responsavel_id,
           'valor_estimado', n.valor_estimado,
           'motivo_perda_id', n.motivo_perda_id,
           'perdido_em', n.perdido_em,
           'produto_interessado', n.dados ->> 'produto_interessado',
           'convertido_em', n.dados -> '_lead' ->> 'convertido_em',
           'kanban', n.dados -> '_lead' ->> 'kanban_status',
           'contato', case when c.id is null then null else jsonb_build_object('nome', c.nome, 'origem', c.origem) end,
           'etapa', case when e.id is null then null else jsonb_build_object('slug', e.slug) end
         ) order by n.id), '[]'::jsonb)
    from public.negocios n
    left join public.contatos c on c.id = n.contato_id
    left join public.funil_etapas e on e.id = n.etapa_id
   where n.empresa_id = p_empresa
     and n.ativo
     and (p_filial is null or n.filial_id = p_filial)
     -- "Só os meus" do papel: os dele e os sem responsável (de todos), como a tela de leads.
     and (p_responsavel is null or n.responsavel_id = p_responsavel or n.responsavel_id is null)
$$;

revoke all on function public.assistente_leads_visiveis(bigint, bigint, uuid) from public, anon;
grant execute on function public.assistente_leads_visiveis(bigint, bigint, uuid) to authenticated, service_role;

comment on function public.assistente_leads_visiveis(bigint, bigint, uuid) is
  'Assistente: os leads ativos que o usuario ve (security invoker, sob a RLS dele), num jsonb, numa execucao.';

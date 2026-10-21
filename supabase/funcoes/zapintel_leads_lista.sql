-- ⚠ SUPERADA EM 21/10/2026 — NÃO REAPLICAR ESTE ARQUIVO.
-- A versão em vigor está em supabase/migrations/20261022001000_zapintel_le_o_core.sql (lê negocios e
-- mensagens direto; este arquivo lê as views leads/lead_mensagens, que custavam até 200 s por chamada
-- depois do corte). O texto abaixo fica como histórico das regras e das decisões.
--
-- A LISTA DE LEADS DO ZAPINTEL, CALCULADA NO BANCO A PARTIR DAS ANÁLISES.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- Pedido do Lucas em 14/10/2026: *"auditoria menu leads, so de olhar esta com
-- motor antigo e sem um modelo completo"*. A auditoria mediu, nos 1.895 leads
-- da lista: 75% com status diferente da análise da conversa, 421 "quentes"
-- (análises: 40, e 91 deles já eram clientes), score 31 pontos fora em média,
-- e só 6 frases de "próxima ação" para todos. E a tela baixava os 1.895 leads
-- de uma vez, calculados na Vercel.
--
-- Agora: filtros, busca, ordem e página no banco; a tela recebe só o que
-- mostra. Mesmo escopo (`zapintel_escopo`) e mesmas regras de
-- `zapintel_dashboard` / `zapintel_dashboard_lista` — o número do dashboard e a
-- contagem desta lista são a mesma conta.
--
-- p_filtros (jsonb, tudo opcional):
--   classe          customer|hot|warm|followup|stalled|lost|unqualified|sem_analise|sem_resposta
--   urgencia        critical|high|medium|low
--   canal           whatsapp|instagram
--   esperando       true = a loja deve resposta (últimas 72 h, sem fora-do-funil)
--   sem_registro    true = a análise leu compra e o CRM não tem a venda
--   desatualizadas  true = a conversa andou depois da análise
--   pendencias      true = a análise deixou alerta ⚠
--   perfil          rótulo da análise
--   sinal           rótulo do sinal de compra
--   objecao         família (zapintel_familia_objecao)
--   parado          hoje | 1-2 | 3-7 | 8-14 | 15-30 | 30+
--   modelo          "17 Pro Max" (o cliente citou nos últimos 30 dias)
--   busca           nome, telefone, interesse, o que foi dito, e a análise
--   dias            conversa com mensagem nos últimos N dias
--   funil           true = sem "fora do funil", "sem análise" e "sem resposta do cliente"
--   sinal_familia   família do sinal (zapintel_familia_sinal, em zapintel_insights.sql)
--   fase            aberto = quente, morno, acompanhar ou parado
--   largada         true = em aberto, 3+ dias parada, o cliente falou por último
--   retomar         true = em aberto, 3+ dias parada, a loja falou por último
-- p_ordem: prioridade (padrão) | recentes | parados | score | mensagens
create or replace function public.zapintel_leads_lista(
  p_filtros jsonb default '{}'::jsonb,
  p_ordem text default 'prioridade',
  p_pagina int default 1,
  p_por_pagina int default 50,
  p_filial bigint default null,
  p_empresa bigint default null,
  p_versao text default 'p2'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp    bigint;
  v_lojas  bigint[];
  v_agora  timestamptz := now();
  v_hoje   timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_f      jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca  text := nullif(trim(coalesce(p_filtros->>'busca', '')), '');
  v_padrao text;
  v_por    int := least(greatest(coalesce(p_por_pagina, 50), 10), 200);
  v_pag    int := greatest(coalesce(p_pagina, 1), 1);
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  if v_busca is not null then
    v_padrao := '%' || regexp_replace(replace(replace(v_busca, '%', ' '), '_', ' '), '\s+', '%', 'g') || '%';
  end if;

  with
  L as materialized (
    select l.id, l.nome, l.telefone, l.origem, l.origem_id, l.filial_id, l.created_at,
           l.kanban_status, l.convertido_em, l.produto_interessado
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um, min(m.created_at) pm
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  -- A busca só lê texto de mensagem quando há busca: é a parte cara.
  ACHADOS as materialized (
    select distinct m.lead_id from lead_mensagens m
    where v_padrao is not null and m.empresa_id = v_emp
      and (m.conteudo ilike v_padrao or m.transcricao ilike v_padrao)
    union
    select p.lead_id from zapintel_lead_perfil p
    where v_padrao is not null and p.empresa_id = v_emp
      and (p.perfil->>'diagnostico' ilike v_padrao or p.perfil->>'relato' ilike v_padrao)
  ),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, M.pm,
           F.fm, F.versao, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls,
           coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  -- Todos os filtros MENOS a classe: é daqui que saem as contagens dos chips,
  -- para "Quentes 12" dizer quantos quentes existem dentro dos outros filtros.
  BASE as materialized (
    select X.* from X
    where (v_f->>'urgencia' is null or X.urg = v_f->>'urgencia')
      and (v_f->>'canal' is null or coalesce(X.origem, 'whatsapp') = v_f->>'canal')
      and (coalesce((v_f->>'esperando')::boolean, false) = false
           or (X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified'))
      and (coalesce((v_f->>'sem_registro')::boolean, false) = false
           or (X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
               and X.convertido_em is null and X.um >= v_agora - interval '90 days'))
      and (coalesce((v_f->>'desatualizadas')::boolean, false) = false
           or (X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao)))
      and (coalesce((v_f->>'pendencias')::boolean, false) = false
           or exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%'))
      and (v_f->>'perfil' is null or X.rotulo = v_f->>'perfil')
      and (v_f->>'sinal' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                           where lower(trim(s->>'rotulo')) = lower(v_f->>'sinal')))
      and (v_f->>'objecao' is null or exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                             where zapintel_familia_objecao(o->>'rotulo') = v_f->>'objecao'))
      and (v_f->>'parado' is null or (X.cls not in ('customer', 'lost', 'unqualified') and (
            (v_f->>'parado' = 'hoje'  and X.um >= v_hoje) or
            (v_f->>'parado' = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (v_f->>'parado' = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (v_f->>'parado' = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (v_f->>'parado' = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (v_f->>'parado' = '30+'   and X.um < v_hoje - interval '30 days'))))
      and (v_f->>'modelo' is null or exists (
            select 1 from lead_mensagens m
            where m.lead_id = X.id and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
              and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
                  ('iphone\s*' || replace(v_f->>'modelo', ' ', '\s*') || '(?![0-9a-z])')))
      -- Os recortes da tela Insights (14/10/2026): "conversas com mensagem nos
      -- últimos N dias", "só quem está no funil", a família do sinal e a fase
      -- da pendência. Com eles o link de cada card abre a mesma contagem.
      and (v_f->>'dias' is null or X.um >= v_agora - make_interval(days => (v_f->>'dias')::int))
      and (coalesce((v_f->>'funil')::boolean, false) = false or X.cls not in ('unqualified', 'sem_analise', 'sem_resposta'))
      and (v_f->>'sinal_familia' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                                  where zapintel_familia_sinal(s->>'rotulo') = v_f->>'sinal_familia'))
      and (v_f->>'fase' is null or (v_f->>'fase' = 'aberto' and X.cls in ('hot', 'warm', 'followup', 'stalled')))
      -- Os recortes da tela Atendimento (15/10/2026): conversa em aberto, parada
      -- há 3 dias ou mais, com o cliente por último (a loja largou) ou com a
      -- loja por último (o cliente sumiu — fila de retomada).
      and (coalesce((v_f->>'largada')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours' and X.esperando))
      and (coalesce((v_f->>'retomar')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours'
               and X.ue is not null and not X.esperando))
      and (v_padrao is null
           or X.nome ilike v_padrao or X.telefone ilike v_padrao or X.produto_interessado ilike v_padrao
           or X.id in (select lead_id from ACHADOS))
  ),
  FINAL as materialized (
    select BASE.*,
           -- A ordem de atender, a mesma da fila do dashboard: urgência (lead
           -- novo sem análise conta como alta), quem espera a loja, e há mais
           -- tempo esperando primeiro.
           (case when BASE.cls = 'sem_analise' then 1
                 else case BASE.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end) prioridade
    from BASE
    where v_f->>'classe' is null or BASE.cls = v_f->>'classe'
  ),
  PAGINA as (
    select * from FINAL
    order by
      case when p_ordem = 'prioridade' then FINAL.prioridade end asc nulls last,
      case when p_ordem = 'prioridade' then (case when FINAL.esperando and FINAL.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
      case when p_ordem = 'prioridade' then FINAL.um end desc nulls last,
      case when p_ordem = 'recentes' then FINAL.um end desc nulls last,
      case when p_ordem = 'parados' then FINAL.um end asc nulls last,
      case when p_ordem = 'score' then FINAL.score::int end desc nulls last,
      case when p_ordem = 'mensagens' then FINAL.n end desc nulls last,
      FINAL.id desc
    limit v_por offset (v_pag - 1) * v_por
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'total', (select count(*) from FINAL),
    'pagina', v_pag,
    'porPagina', v_por,
    'contagens', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from BASE group by cls) c),
    'totalSemClasse', (select count(*) from BASE),
    'leads', (select coalesce(jsonb_agg(r), '[]') from (
        select P.id "leadId", P.nome, P.telefone, P.origem, P.origem_id "origemId",
               (select rotulo from NOMES where NOMES.id = P.filial_id) loja,
               P.cls classificacao, P.urg urgencia, P.score::int score, P.rotulo, P.acao "proximaAcao",
               P.tem_ficha "temAnalise", (P.tem_ficha and P.fm <> P.n) desatualizada,
               P.comprou,
               (P.esperando and P.ur >= v_agora - interval '72 hours' and P.cls <> 'unqualified') esperando,
               P.ur "ultimaDoCliente", P.um "ultimaMensagem", P.pm "primeiraMensagem", P.n mensagens,
               jsonb_array_length(coalesce(P.si, '[]'::jsonb)) sinais,
               jsonb_array_length(coalesce(P.obj, '[]'::jsonb)) objecoes,
               (select count(*) from jsonb_array_elements_text(coalesce(P.ps, '[]'::jsonb)) t where t like '⚠%') alertas
        from PAGINA P
        order by
          case when p_ordem = 'prioridade' then P.prioridade end asc nulls last,
          case when p_ordem = 'prioridade' then (case when P.esperando and P.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
          case when p_ordem = 'prioridade' then P.um end desc nulls last,
          case when p_ordem = 'recentes' then P.um end desc nulls last,
          case when p_ordem = 'parados' then P.um end asc nulls last,
          case when p_ordem = 'score' then P.score::int end desc nulls last,
          case when p_ordem = 'mensagens' then P.n end desc nulls last,
          P.id desc) r)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.zapintel_leads_lista(jsonb, text, int, int, bigint, bigint, text) from public, anon;
grant execute on function public.zapintel_leads_lista(jsonb, text, int, int, bigint, bigint, text) to authenticated;

comment on function public.zapintel_leads_lista(jsonb, text, int, int, bigint, bigint, text) is
  'Lista de leads do ZapIntel a partir das análises: filtros, busca (inclusive no texto das conversas), ordem e página, no escopo de quem pede (zapintel_escopo). Chamada direto do navegador.';

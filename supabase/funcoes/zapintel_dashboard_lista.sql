-- ⚠ SUPERADA EM 21/10/2026 — NÃO REAPLICAR ESTE ARQUIVO.
-- A versão em vigor está em supabase/migrations/20261022001000_zapintel_le_o_core.sql (lê negocios e
-- mensagens direto; este arquivo lê as views leads/lead_mensagens, que custavam até 200 s por chamada
-- depois do corte). O texto abaixo fica como histórico das regras e das decisões.
--
-- OS LEADS POR TRÁS DE CADA NÚMERO DO DASHBOARD DO ZAPINTEL.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- Clicar num cartão do dashboard abre a lista daquele número. Os cartões
-- antigos levavam para `/zapintel/leads?filter=hot`, que filtra pelo MOTOR de
-- palavra-chave: o cartão dizia 40 quentes (fichas) e a lista mostrava 421.
-- Esta função usa exatamente os mesmos critérios de `zapintel_dashboard`, no
-- mesmo escopo (`zapintel_escopo`), para o número e a lista nunca divergirem.
--
-- p_tipo / p_valor:
--   classe        customer | hot | warm | followup | stalled | lost | unqualified | sem_analise | sem_resposta
--   esperando     (sem valor) quem a loja deve resposta, últimas 72 h
--   sem_registro  (sem valor) a conversa mostra compra, o CRM não tem a venda
--   pendencias    (sem valor) leads com alerta ⚠ da análise
--   objecao       família (ver zapintel_familia_objecao)
--   perfil        rótulo da análise ("Sensível a preço")
--   sinal         rótulo do sinal de compra
--   inatividade   hoje | 1-2 | 3-7 | 8-14 | 15-30 | 30+
--   modelo        "17 Pro Max" (clientes que citaram, 30 dias)
--   desatualizadas (sem valor) conversa andou depois da análise
create or replace function public.zapintel_dashboard_lista(
  p_tipo text, p_valor text default null,
  p_filial bigint default null, p_empresa bigint default null, p_versao text default 'p2'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_hoje  timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao, p.gerado_em,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, F.fm, F.versao, F.gerado_em, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls, coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  ESCOLHA as (
    select X.*, null::text detalhe from X
    where (p_tipo = 'classe' and X.cls = p_valor)
       or (p_tipo = 'esperando' and X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified')
       or (p_tipo = 'sem_registro' and X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
           and X.convertido_em is null and X.um >= v_agora - interval '90 days')
       or (p_tipo = 'desatualizadas' and X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao))
       or (p_tipo = 'perfil' and X.rotulo = p_valor)
       or (p_tipo = 'inatividade' and X.cls not in ('customer', 'lost', 'unqualified') and (
            (p_valor = 'hoje'  and X.um >= v_hoje) or
            (p_valor = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (p_valor = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (p_valor = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (p_valor = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (p_valor = '30+'   and X.um < v_hoje - interval '30 days')))
    union all
    select X.*, (select string_agg(ltrim(substr(t, 2)), ' · ') from jsonb_array_elements_text(X.ps) t where t like '⚠%') from X
    where p_tipo = 'pendencias' and exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%')
    union all
    select X.*, (select string_agg((o->>'rotulo') || ' — ' || coalesce(o->>'desfecho', ''), ' · ')
                 from jsonb_array_elements(X.obj) o where zapintel_familia_objecao(o->>'rotulo') = p_valor) from X
    where p_tipo = 'objecao' and exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                         where zapintel_familia_objecao(o->>'rotulo') = p_valor)
    union all
    select X.*, (select string_agg(s->>'evidencia', ' · ') from jsonb_array_elements(X.si) s
                 where lower(trim(s->>'rotulo')) = lower(p_valor)) from X
    where p_tipo = 'sinal' and exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                       where lower(trim(s->>'rotulo')) = lower(p_valor))
    union all
    select X.*, null from X
    where p_tipo = 'modelo' and exists (
      select 1 from lead_mensagens m
      where m.lead_id = X.id and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
        and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~* ('iphone\s*' || replace(p_valor, ' ', '\s*') || '(?![0-9a-z])'))
  )
  select jsonb_build_object(
    'total', (select count(*) from ESCOLHA),
    'leads', (select coalesce(jsonb_agg(e order by e.ordem, e."ultimaMensagem" desc), '[]') from (
        select ESCOLHA.id "leadId", ESCOLHA.nome, (select rotulo from NOMES where NOMES.id = ESCOLHA.filial_id) loja,
               ESCOLHA.um "ultimaMensagem", ESCOLHA.cls classificacao, ESCOLHA.urg urgencia,
               ESCOLHA.score::int score, ESCOLHA.rotulo, ESCOLHA.acao "proximaAcao",
               ESCOLHA.esperando, ESCOLHA.detalhe,
               case ESCOLHA.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ordem
        from ESCOLHA
        order by ordem, ESCOLHA.um desc
        limit 120) e)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.zapintel_dashboard_lista(text, text, bigint, bigint, text) from public, anon;
grant execute on function public.zapintel_dashboard_lista(text, text, bigint, bigint, text) to authenticated;

-- ATENDIMENTO: COMO A LOJA ATENDE NO WHATSAPP E NO INSTAGRAM.
--
-- Aplicada no banco em 15/10/2026. Substitui as telas Performance I e II.
--
-- Pedido do Lucas em 14/10/2026: *"auditoria performance + performance 2"*. As
-- duas telas eram do motor de palavras e se contradiziam: "tempo de resposta"
-- aparecia com quatro números (4h14 "crítico", 14 min, 1h14; "< 5 min" = 31% e
-- 64%). A média era puxada por poucas esperas longas e pela madrugada. Medido no
-- horário comercial, a loja responde em 2 minutos (mediana), 61% em menos de 5.
--
-- O problema de verdade estava fora da tela: depois das 17h quase ninguém
-- responde (18h → 63% das falas esperam 4 h ou mais), e 169 conversas em
-- aberto têm o cliente falando por último há 3 dias ou mais.
--
-- O que NÃO está aqui de propósito: tempo de resposta não prevê venda (medido
-- no Insights e de novo aqui — quem esperou 4 h alguma vez compra MAIS, porque
-- conversa longa acumula espera). Esta tela mede o serviço; não promete venda.
--
-- TURNO: cada vez que o cliente volta a falar depois da loja (a primeira
-- mensagem de uma sequência dele). A resposta é a próxima mensagem da loja.
--
-- HORÁRIO DA LOJA e TURNOS: `zapintel_horario` e `zapintel_turnos`
-- (zapintel_turnos.sql) — a mesma conta que o dashboard usa desde 15/10.
--
-- p_dias: 7 | 30 | 90 | null (tudo). A evolução semanal usa sempre 8 semanas.
create or replace function public.zapintel_atendimento(
  p_dias int default 30,
  p_filial bigint default null,
  p_empresa bigint default null
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
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_hor    jsonb;
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_hor := zapintel_horario(v_emp);

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.responsavel_id
    from leads l
    where l.empresa_id = v_emp and l.ativo and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  -- Os turnos e o horário vêm de `zapintel_turnos` — a mesma conta do
  -- dashboard (supabase/funcoes/zapintel_turnos.sql). A evolução semanal
  -- precisa de 8 semanas mesmo quando o período é 7 dias.
  TH as materialized (
    select * from zapintel_turnos(v_emp, v_lojas, least(v_desde, v_agora - interval '8 weeks'))
  ),
  -- Conversa que ainda pode virar venda, segundo a análise.
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, (p.perfil->>'score')::int score
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  U as materialized (
    select m.lead_id, max(m.created_at) um,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada') ue
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  ABERTO as (
    select L.id, L.nome, L.filial_id, F.cls, F.score, U.um, U.ur, U.ue
    from L join U on U.lead_id = L.id join F on F.lead_id = L.id
    where F.cls in ('hot', 'warm', 'followup', 'stalled')
      and U.um < v_agora - interval '72 hours' and U.um >= v_desde
  ),
  LARGADAS as (select * from ABERTO where ur is not null and (ue is null or ur > ue)),
  RETOMAR  as (select * from ABERTO where ue is not null and (ur is null or ue >= ur)),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'dias', p_dias,
    'empresa', v_emp,
    'horario', v_hor - 'configurado',
    'horarioConfigurado', (v_hor->>'configurado')::boolean,

    -- ── Tempo de resposta no horário da loja, por loja e no total ─────────
    'resposta', coalesce((select jsonb_agg(r order by r->>'loja' nulls first) from (
        select jsonb_build_object(
          'loja', case when grouping(filial_id) = 1 then null else (select rotulo from NOMES where NOMES.id = TH.filial_id) end,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'p75', round(percentile_cont(0.75) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'ate30', round(100.0 * count(*) filter (where espera < 30) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) r
        from TH where aberto and chegou >= v_desde
        group by rollup (filial_id)) z), '[]'::jsonb),

    -- ── Fora do horário: quanto espera quem fala com a loja fechada ───────
    'foraDoHorario', (select jsonb_build_object(
        'turnos', count(*) filter (where not aberto),
        'pct', round(100.0 * count(*) filter (where not aberto) / nullif(count(*), 0)),
        'mediana', round((percentile_cont(0.5) within group (order by least(coalesce(espera, 2880), 2880)) filter (where not aberto))::numeric),
        'ate1h', round(100.0 * count(*) filter (where not aberto and espera < 60) / nullif(count(*) filter (where not aberto), 0)))
      from TH where chegou >= v_desde),

    -- ── Evolução: 8 semanas, sempre no horário da loja ───────────────────
    'semanas', coalesce((select jsonb_agg(s order by s->>'inicio') from (
        select jsonb_build_object(
          'inicio', (date_trunc('week', chegou at time zone 'America/Sao_Paulo'))::date,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) s
        from TH where aberto and chegou >= v_agora - interval '8 weeks'
        group by date_trunc('week', chegou at time zone 'America/Sao_Paulo')) z), '[]'::jsonb),

    -- ── Cobertura: dia × hora, quantos chegam e quantos esperam 4 h+ ─────
    'cobertura', coalesce((select jsonb_agg(c) from (
        select jsonb_build_object('dow', dow, 'hora', hora, 'turnos', count(*),
               'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) c
        from TH where chegou >= v_desde group by dow, hora) z), '[]'::jsonb),

    -- ── Conversas que a loja largou e as que esperam retomada ────────────
    'largadas', jsonb_build_object(
        'total', (select count(*) from LARGADAS),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', LARGADAS.id, 'nome', nome, 'classe', cls, 'desde', ur,
                   'loja', (select rotulo from NOMES where NOMES.id = LARGADAS.filial_id),
                   'fala', (select left(coalesce(nullif(trim(m.transcricao), ''), m.conteudo), 160)
                            from lead_mensagens m where m.lead_id = LARGADAS.id and m.direcao = 'recebida'
                            order by m.created_at desc, m.id desc limit 1)) i
            from LARGADAS order by ur desc limit 8) z), '[]'::jsonb)),
    'retomar', jsonb_build_object(
        'total', (select count(*) from RETOMAR),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', RETOMAR.id, 'nome', nome, 'classe', cls, 'score', score, 'desde', ue,
                   'loja', (select rotulo from NOMES where NOMES.id = RETOMAR.filial_id)) i
            from RETOMAR order by score desc nulls last, ue desc limit 8) z), '[]'::jsonb)),

    -- ── Dá para ver por vendedor? Só com responsável ou envio pelo CRM ───
    'vendedor', jsonb_build_object(
        'leads', (select count(*) from L join U on U.lead_id = L.id),
        'comResponsavel', (select count(*) from L join U on U.lead_id = L.id where L.responsavel_id is not null),
        'mensagensDaLoja', (select count(*) from lead_mensagens m join L on L.id = m.lead_id
                            where m.empresa_id = v_emp and m.direcao = 'enviada' and m.created_at >= v_desde),
        'mensagensComUsuario', (select count(*) from lead_mensagens m join L on L.id = m.lead_id
                                where m.empresa_id = v_emp and m.direcao = 'enviada' and m.usuario_id is not null and m.created_at >= v_desde))
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.zapintel_atendimento(int, bigint, bigint) from public, anon;
grant execute on function public.zapintel_atendimento(int, bigint, bigint) to authenticated;

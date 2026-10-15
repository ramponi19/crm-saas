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
-- HORÁRIO DA LOJA: o mesmo da esteira de leads — `configuracoes_sistema`,
-- chave `horario` ({inicio, fim, dias}, 0 = domingo), e na falta dele o
-- padrão de `lib/horario-util.ts` (seg–sex, 09:00–18:00). Um só horário para
-- a empresa: as duas lojas da JM abrem igual.
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
  v_base   timestamptz;
  v_hor    jsonb;
  v_ini    int;
  v_fim    int;
  v_dias   int[];
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_base := least(v_desde, v_agora - interval '8 weeks');

  select valor into v_hor from configuracoes_sistema where empresa_id = v_emp and chave = 'horario';
  v_hor := jsonb_build_object('inicio', '09:00', 'fim', '18:00', 'dias', '[1,2,3,4,5]'::jsonb) || coalesce(v_hor, '{}'::jsonb);
  v_ini := split_part(v_hor->>'inicio', ':', 1)::int * 60 + split_part(v_hor->>'inicio', ':', 2)::int;
  v_fim := split_part(v_hor->>'fim', ':', 1)::int * 60 + split_part(v_hor->>'fim', ':', 2)::int;
  v_dias := array(select jsonb_array_elements_text(v_hor->'dias')::int);

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.responsavel_id
    from leads l
    where l.empresa_id = v_emp and l.ativo and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  -- Uma passada só: a direção anterior e a próxima resposta da loja vêm por
  -- janela. Ordenada ao contrário, "as linhas antes desta" são as mensagens
  -- DEPOIS dela — e a menor data de loja entre elas é a resposta.
  MS as materialized (
    select m.lead_id, m.direcao, m.created_at, m.usuario_id,
           lag(m.direcao) over (partition by m.lead_id order by m.created_at, m.id) dir_ant,
           min(case when m.direcao = 'enviada' then m.created_at end) over (
             partition by m.lead_id order by m.created_at desc, m.id desc
             rows between unbounded preceding and 1 preceding) resposta
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp and m.created_at >= v_base
  ),
  T as materialized (
    select MS.lead_id, L.filial_id, MS.created_at chegou,
           extract(epoch from MS.resposta - MS.created_at) / 60 espera,
           extract(dow from MS.created_at at time zone 'America/Sao_Paulo')::int dow,
           extract(hour from MS.created_at at time zone 'America/Sao_Paulo')::int hora,
           (extract(hour from MS.created_at at time zone 'America/Sao_Paulo') * 60
            + extract(minute from MS.created_at at time zone 'America/Sao_Paulo'))::int minuto
    from MS join L on L.id = MS.lead_id
    where MS.direcao = 'recebida' and MS.dir_ant is distinct from 'recebida'
  ),
  TH as (
    select T.*, (T.dow = any (v_dias) and T.minuto >= v_ini and T.minuto < v_fim) aberto
    from T
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
    'horario', v_hor,
    'horarioConfigurado', exists (select 1 from configuracoes_sistema where empresa_id = v_emp and chave = 'horario'),

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
        'mensagensDaLoja', (select count(*) from MS where direcao = 'enviada' and created_at >= v_desde),
        'mensagensComUsuario', (select count(*) from MS where direcao = 'enviada' and usuario_id is not null and created_at >= v_desde))
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.zapintel_atendimento(int, bigint, bigint) from public, anon;
grant execute on function public.zapintel_atendimento(int, bigint, bigint) to authenticated;

-- O TEMPO DE RESPOSTA DO ZAPINTEL — UMA CONTA SÓ, PARA TODAS AS TELAS.
--
-- Aplicada no banco em 15/10/2026. Pedido do Lucas: *"dashboard tempo de
-- resposta ta puxando segunda a sabado 8-20 nao esta puxando igual vc fez em
-- atendimento"*. O dashboard tinha a regra dele (seg–sáb, 8h–20h, mediana só
-- das respondidas, "% em até 15 min") e a tela Atendimento outra (horário da
-- loja, sem resposta conta como espera, "% em até 5 min"). Duas regras para o
-- mesmo número só servem para divergir — foi exatamente o defeito que matou
-- Performance I e II (quatro "tempos de resposta" diferentes).
--
-- Agora as duas telas leem daqui:
--
--   zapintel_horario(empresa)  o horário da loja: `configuracoes_sistema`,
--                              chave `horario` — o mesmo da esteira de leads —
--                              e na falta dele o padrão de lib/horario-util.ts
--                              (seg–sex, 09:00–18:00).
--   zapintel_turnos(...)       cada vez que o cliente volta a falar (a primeira
--                              mensagem de uma sequência dele), quanto esperou
--                              pela próxima mensagem da loja, e se a loja
--                              estava aberta naquele momento.
--
-- As MÉTRICAS também são uma só, e quem lê aplica igual:
--   mediana  da espera, contando quem ficou sem resposta como 24 h (1440 min)
--            — tirá-los deixaria a mediana bonita justamente quando a loja some;
--   ate5     % respondidos em menos de 5 minutos;
--   mais4h   % que esperaram 4 h ou mais (ou não tiveram resposta).
-- Só entram turnos com a loja ABERTA. Fora do horário é outro número.

create or replace function public.zapintel_horario(p_emp bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('inicio', '09:00', 'fim', '18:00', 'dias', '[1,2,3,4,5]'::jsonb)
         || coalesce((select valor from configuracoes_sistema where empresa_id = p_emp and chave = 'horario'), '{}'::jsonb)
         || jsonb_build_object('configurado', exists (select 1 from configuracoes_sistema where empresa_id = p_emp and chave = 'horario'))
$$;

create or replace function public.zapintel_turnos(p_emp bigint, p_lojas bigint[], p_desde timestamptz)
returns table (lead_id bigint, filial_id bigint, chegou timestamptz, espera numeric, dow int, hora int, aberto boolean)
language sql
stable
security definer
set search_path = public
as $$
  with
  -- `materialized` em H e HH (15/10/2026): sem ele o Postgres embutia o horário
  -- na junção final e chamava zapintel_horario() UMA VEZ POR TURNO — 11 mil
  -- chamadas em 8 semanas, 1,3 s. Com ele, 0,27 s e a mesma saída linha a linha.
  H as materialized (select zapintel_horario(p_emp) h),
  HH as materialized (
    select split_part(h->>'inicio', ':', 1)::int * 60 + split_part(h->>'inicio', ':', 2)::int ini,
           split_part(h->>'fim', ':', 1)::int * 60 + split_part(h->>'fim', ':', 2)::int fim,
           array(select jsonb_array_elements_text(h->'dias')::int) dias
    from H
  ),
  L as (
    select l.id, l.filial_id from leads l
    where l.empresa_id = p_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (p_lojas)
  ),
  -- Conversas que tiveram mensagem no período — e delas o HISTÓRICO INTEIRO.
  -- Cortar as mensagens na data fazia a primeira do período parecer "o cliente
  -- voltou a falar" mesmo quando ele já estava falando: o dashboard (7 dias)
  -- contava 1.581 vezes e a tela Atendimento, no mesmo período, 1.564.
  -- Com o histórico, o resultado não depende de quem chama nem de onde corta.
  ATIVOS as (
    select distinct m.lead_id from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = p_emp and m.created_at >= p_desde
  ),
  -- Uma passada só: a direção anterior e a próxima resposta da loja vêm por
  -- janela. Ordenada ao contrário, "as linhas antes desta" são as mensagens
  -- DEPOIS dela — e a menor data de loja entre elas é a resposta.
  MS as (
    select m.lead_id, m.direcao, m.created_at,
           lag(m.direcao) over (partition by m.lead_id order by m.created_at, m.id) dir_ant,
           min(case when m.direcao = 'enviada' then m.created_at end) over (
             partition by m.lead_id order by m.created_at desc, m.id desc
             rows between unbounded preceding and 1 preceding) resposta
    from lead_mensagens m join ATIVOS A on A.lead_id = m.lead_id
    where m.empresa_id = p_emp
  ),
  T as (
    select MS.lead_id, L.filial_id, MS.created_at chegou,
           (extract(epoch from MS.resposta - MS.created_at) / 60)::numeric espera,
           extract(dow from MS.created_at at time zone 'America/Sao_Paulo')::int dow,
           extract(hour from MS.created_at at time zone 'America/Sao_Paulo')::int hora,
           (extract(hour from MS.created_at at time zone 'America/Sao_Paulo') * 60
            + extract(minute from MS.created_at at time zone 'America/Sao_Paulo'))::int minuto
    from MS join L on L.id = MS.lead_id
    where MS.direcao = 'recebida' and MS.dir_ant is distinct from 'recebida'
      and MS.created_at >= p_desde
  )
  select T.lead_id, T.filial_id, T.chegou, T.espera, T.dow, T.hora,
         (T.dow = any (HH.dias) and T.minuto >= HH.ini and T.minuto < HH.fim) aberto
  from T, HH
$$;

-- Só as funções do ZapIntel chamam estas (rodam como dono); ninguém de fora.
revoke all on function public.zapintel_horario(bigint) from public, anon, authenticated;
revoke all on function public.zapintel_turnos(bigint, bigint[], timestamptz) from public, anon, authenticated;

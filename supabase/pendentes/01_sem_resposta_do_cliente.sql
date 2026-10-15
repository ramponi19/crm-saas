-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS, E SÓ DEPOIS DO DEPLOY 74139b3
-- (o front precisa conhecer a classe "sem_resposta": components/zapintel/rotulos.ts).
--
-- O que faz: nas três funções do ZapIntel, lead sem ficha passa a ser
--   "sem_analise"  se o cliente falou, ou
--   "sem_resposta" se só a loja escreveu.
-- Testado em 15/10/2026 numa transação desfeita: funil sem_analise 21,
-- sem_resposta 55; lista e robô com os mesmos números.
--
-- Pré-condição conferida pelo próprio script: as três funções ainda têm a
-- expressão antiga (se não tiverem, ele para sem mudar nada).
--
-- VOLTA ATRÁS: rodar 01_sem_resposta_do_cliente.volta.sql.
do $$
declare d text;
  cls_o text := $q$coalesce(F.cls0, 'sem_analise') cls$q$;
  cls_n text := $q$coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls$q$;
begin
  d := pg_get_functiondef('public.zapintel_dashboard(bigint,bigint,text)'::regprocedure);
  if position(cls_o in d) = 0 then raise exception 'zapintel_dashboard não está no estado esperado'; end if;
  d := replace(d, cls_o, cls_n);
  d := replace(d, $q$'semAnalise', (select count(*) from X where not tem_ficha and ur is not null)$q$, $q$'semAnalise', (select count(*) from X where cls = 'sem_analise')$q$);
  d := replace(d, $q$'semResposta', (select count(*) from X where not tem_ficha and ur is null)$q$, $q$'semResposta', (select count(*) from X where cls = 'sem_resposta')$q$);
  execute d;
  d := pg_get_functiondef('public.zapintel_dashboard_lista(text,text,bigint,bigint,text)'::regprocedure);
  if position(cls_o in d) = 0 then raise exception 'zapintel_dashboard_lista não está no estado esperado'; end if;
  execute replace(d, cls_o, cls_n);
  d := pg_get_functiondef('public.zapintel_leads_lista(jsonb,text,int,int,bigint,bigint,text)'::regprocedure);
  if position(cls_o in d) = 0 then raise exception 'zapintel_leads_lista não está no estado esperado'; end if;
  execute replace(d, cls_o, cls_n);
end $$;

-- VOLTA ATRÁS de 01_sem_resposta_do_cliente.sql: devolve as três funções ao
-- estado anterior (lead sem ficha = "sem_analise", rodapé conta pelo `ur`).
do $$
declare d text;
  cls_n text := $q$coalesce(F.cls0, 'sem_analise') cls$q$;
  cls_o text := $q$coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls$q$;
begin
  d := pg_get_functiondef('public.zapintel_dashboard(bigint,bigint,text)'::regprocedure);
  d := replace(d, cls_o, cls_n);
  d := replace(d, $q$'semAnalise', (select count(*) from X where cls = 'sem_analise')$q$, $q$'semAnalise', (select count(*) from X where not tem_ficha and ur is not null)$q$);
  d := replace(d, $q$'semResposta', (select count(*) from X where cls = 'sem_resposta')$q$, $q$'semResposta', (select count(*) from X where not tem_ficha and ur is null)$q$);
  execute d;
  d := pg_get_functiondef('public.zapintel_dashboard_lista(text,text,bigint,bigint,text)'::regprocedure);
  execute replace(d, cls_o, cls_n);
  d := pg_get_functiondef('public.zapintel_leads_lista(jsonb,text,int,int,bigint,bigint,text)'::regprocedure);
  execute replace(d, cls_o, cls_n);
end $$;

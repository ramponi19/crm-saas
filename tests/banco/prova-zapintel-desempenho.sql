-- PROVA no banco LOCAL da migração 20261110000200_zapintel_desempenho (10/11/2026). Só no banco local.
--
--   psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres" -X -A -t -q \
--        -v arquivo=supabase/migrations/20261110000200_zapintel_desempenho.sql -f tests/banco/prova-zapintel-desempenho.sql
--   (para a volta: -v arquivo=supabase/scripts/volta/volta-zapintel-desempenho.sql)
--
-- Numa transação desfeita no fim: o now() é o mesmo do começo ao fim, então as funções do ZapIntel
-- rodam ANTES e DEPOIS de aplicar o arquivo com o mesmo relógio, e o resultado de cada chamada (JM,
-- empresa 1, várias combinações de loja, período, filtro e ordem) tem de sair IGUAL.
begin;
set local client_min_messages = warning;
select set_config('request.jwt.claims', '{"sub":"3c7b4bba-9b95-4126-84b1-5b91b385ea6e","role":"authenticated"}', true);

create temp table saidas(fase text, chamada text, saida text) on commit drop;
create temp table chamadas(n serial, chamada text, sql text) on commit drop;
insert into chamadas(chamada, sql) values
  ('dashboard rede',            $q$select public.zapintel_dashboard(null, 1)::text$q$),
  ('dashboard Mogi',            $q$select public.zapintel_dashboard(3, 1)::text$q$),
  ('dashboard Jaguariúna',      $q$select public.zapintel_dashboard(6, 1)::text$q$),
  ('lista classe hot',          $q$select public.zapintel_dashboard_lista('classe', 'hot', null, 1)::text$q$),
  ('lista esperando',           $q$select public.zapintel_dashboard_lista('esperando', null, null, 1)::text$q$),
  ('lista sem_registro',        $q$select public.zapintel_dashboard_lista('sem_registro', null, null, 1)::text$q$),
  ('lista desatualizadas',      $q$select public.zapintel_dashboard_lista('desatualizadas', null, null, 1)::text$q$),
  ('lista perfil',              $q$select public.zapintel_dashboard_lista('perfil', 'Pesquisando', null, 1)::text$q$),
  ('lista inatividade 3-7',     $q$select public.zapintel_dashboard_lista('inatividade', '3-7', null, 1)::text$q$),
  ('lista inatividade 30+',     $q$select public.zapintel_dashboard_lista('inatividade', '30+', null, 1)::text$q$),
  ('lista pendencias',          $q$select public.zapintel_dashboard_lista('pendencias', null, null, 1)::text$q$),
  ('lista objecao',             $q$select public.zapintel_dashboard_lista('objecao', 'Preço e dinheiro', null, 1)::text$q$),
  ('lista sinal',               $q$select public.zapintel_dashboard_lista('sinal', 'Cliente da casa', null, 1)::text$q$),
  ('lista modelo',              $q$select public.zapintel_dashboard_lista('modelo', '15 pro max', null, 1)::text$q$),
  ('leads padrão',              $q$select public.zapintel_leads_lista('{}', 'prioridade', 1, 50, null, 1)::text$q$),
  ('leads esperando Mogi',      $q$select public.zapintel_leads_lista('{"esperando": true}', 'recentes', 1, 50, 3, 1)::text$q$),
  ('leads parado 3-7',          $q$select public.zapintel_leads_lista('{"parado": "3-7"}', 'parados', 1, 50, null, 1)::text$q$),
  ('leads busca iphone p2',     $q$select public.zapintel_leads_lista('{"busca": "iphone"}', 'score', 2, 50, null, 1)::text$q$),
  ('resumo',                    $q$select public.zapintel_resumo(1)::text$q$),
  ('análises pendentes',        $q$select coalesce(jsonb_agg(to_jsonb(a) order by a.lead_id), '[]')::text from public.zapintel_analises_pendentes(1, 'p2') a$q$),
  ('insights 30d rede',         $q$select public.zapintel_insights(30, null, 1)::text$q$),
  ('insights 7d Mogi',          $q$select public.zapintel_insights(7, 3, 1)::text$q$),
  ('insights tudo',             $q$select public.zapintel_insights(null, null, 1)::text$q$),
  ('pós-venda rede',            $q$select public.zapintel_posvenda(null, 1)::text$q$),
  ('pós-venda Jaguariúna',      $q$select public.zapintel_posvenda(6, 1)::text$q$),
  ('atendimento 30d',           $q$select public.zapintel_atendimento(30, null, 1)::text$q$),
  ('atendimento 7d Jaguariúna', $q$select public.zapintel_atendimento(7, 6, 1)::text$q$),
  ('conversa_calc 30d',         $q$select public.zapintel_conversa_calc(1, array[3, 6, 0]::bigint[], 30)::text$q$),
  ('leads com conversa',        $q$select coalesce(jsonb_agg(to_jsonb(c)), '[]')::text from public.zapintel_leads_com_conversa(1) c$q$);

do $$ declare c record; s text; begin
  for c in select * from chamadas order by n loop execute c.sql into s; insert into saidas values ('antes', c.chamada, s); end loop;
end $$;

\i :arquivo

do $$ declare c record; s text; begin
  for c in select * from chamadas order by n loop execute c.sql into s; insert into saidas values ('depois', c.chamada, s); end loop;
end $$;

select case when a.saida = d.saida then 'OK   '
            when a.saida::jsonb = d.saida::jsonb then 'OK*  '
            else 'FALHOU ' end
       || c.chamada || ' (' || coalesce(length(a.saida), 0) || ' caracteres)'
from chamadas c
join saidas a on a.chamada = c.chamada and a.fase = 'antes'
join saidas d on d.chamada = c.chamada and d.fase = 'depois'
order by c.n;
select 'funções com work_mem 16MB: ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'zapintel%' and 'work_mem=16MB' = any (p.proconfig);
select 'chamadas a zapintel_funil_interno restantes: ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'zapintel%' and p.proname <> 'zapintel_funil_interno'
   and pg_get_functiondef(p.oid) like '%zapintel_funil_interno(%';
rollback;

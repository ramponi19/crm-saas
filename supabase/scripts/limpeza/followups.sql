-- Item 2.4 pelo operador da limpeza (sql-followups). Autocommit, numa sessão só.
\set ON_ERROR_STOP 1
\pset footer off
-- 1. As tarefas do gerador que ninguém concluiu (critério: origem automação, ligada a uma
--    marca do gerador, não concluída). Guardadas antes de a tabela das marcas sair.
create temp table zz_tarefas_gerador as
  select t.id from public.tarefas t
   where t.origem = 'automacao' and not t.concluida
     and exists (select 1 from public.followups_gerados f where f.tarefa_id = t.id);
select count(*) as tarefas_a_apagar from zz_tarefas_gerador;
select count(*) as tarefas_antes from public.tarefas;

-- 2. Funções sem followups_gerados e a tabela fora.
\i 'D:/Empresa TI/CRM-SaaS/supabase/migrations/20261021002200_followups_gerados.sql'
select to_regclass('public.followups_gerados') is null as tabela_saiu,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prosrc ilike '%followups_gerados%') as funcoes_que_ainda_citam;

-- 3. Apaga em lotes de 500, COMMIT e 1 s de pausa entre lotes (nunca um DELETE único).
\timing on
do $$
declare n int; total int := 0; lotes int := 0;
begin
  loop
    delete from public.tarefas where id in (select id from zz_tarefas_gerador limit 500);
    get diagnostics n = row_count;
    delete from zz_tarefas_gerador where id not in (select id from public.tarefas);
    exit when n = 0;
    total := total + n; lotes := lotes + 1;
    commit;
    perform pg_sleep(1);
  end loop;
  raise notice 'tarefas apagadas: % em % lotes', total, lotes;
end $$;
\timing off
select count(*) as tarefas_depois, count(*) filter (where origem = 'automacao') as automacao_restantes,
       count(*) filter (where origem = 'automacao' and concluida) as automacao_concluidas from public.tarefas;

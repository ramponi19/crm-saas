-- Limpeza de 20/10, item 2.4: sai a régua de follow-up (cron gerar-followups) e a tabela
-- que dava idempotência a ela.
--
-- Três funções ainda escreviam em followups_gerados: fundir_clientes (remapeia o lead da
-- marca), propagar_filial_do_lead (gatilho que só existe em old_leads) e hard_delete_empresa.
-- Sem tirar essas linhas, as três passariam a falhar quando chamadas. A troca é feita sobre
-- a definição atual do banco (pg_get_functiondef), removendo só o comando que cita a tabela;
-- se sobrar qualquer menção, aborta sem mexer em nada.
--
-- As 1.112 tarefas que o gerador criou e ninguém concluiu saem antes, em lotes, pelo script
-- supabase/scripts/limpeza/followups.sql (que aplica este arquivo no meio).
do $$
declare
  f record;
  d text;
  n text;
begin
  for f in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('fundir_clientes', 'propagar_filial_do_lead', 'hard_delete_empresa')
       and p.prosrc ilike '%followups_gerados%'
  loop
    d := pg_get_functiondef(f.oid);
    n := regexp_replace(d, '\n[^\n]*(update|delete from)\s+(public\.)?followups_gerados\M[^;]*;[^\n]*', '', 'gi');
    if n = d or n ~* 'followups_gerados' then
      raise exception 'nao consegui tirar followups_gerados de %', f.oid::regprocedure;
    end if;
    execute n;
  end loop;
end $$;

drop table if exists public.followups_gerados;

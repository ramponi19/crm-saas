-- =====================================================================================
-- VOLTA DO CORTE, passo 1 de 3: esvazia o schema public SEM apagar o schema.
--
-- Por que não `drop schema public cascade`: os default privileges do public em produção
-- são de dois donos, postgres e supabase_admin (19/10/2026). Apagar o schema leva os de
-- supabase_admin, e o postgres não consegue recriá-los. Esvaziando, o schema e as regras
-- de grant ficam; só os objetos saem.
--
-- O CASCADE leva junto o que outros schemas têm apoiado no public (policies de storage e
-- realtime, gatilho de auth.users) — o passo 3 recria a partir do externos.sql capturado
-- antes do corte. Objetos de extensão ficam (não há extensão no public em produção).
--
--   passo 1: psql "<conexão>" -X -v ON_ERROR_STOP=1 -f volta-limpar-public.sql
--   passo 2: pg_restore -d "<conexão>" --single-transaction --exit-on-error -n public <public.dump>
--   passo 3: psql "<conexão>" -X -v ON_ERROR_STOP=1 -f externos.sql
-- =====================================================================================
\set ON_ERROR_STOP on
begin;
drop schema if exists migracao cascade;
do $$
declare r record;
begin
  -- views primeiro (dependem de tabela), depois tabelas, sequências soltas, funções e tipos
  for r in select c.relname, c.relkind from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop %s if exists public.%I cascade', case r.relkind when 'm' then 'materialized view' else 'view' end, r.relname);
  end loop;
  for r in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'f')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;
  for r in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop sequence if exists public.%I cascade', r.relname);
  end loop;
  for r in select p.oid::regprocedure::text assinatura, p.prokind from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop %s if exists %s cascade', case r.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end, r.assinatura);
  end loop;
  for r in select t.typname from pg_type t
            where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd', 'c')
              and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
              and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;
-- conferência: o public tem de estar vazio (fora objetos de extensão)
do $$
declare n int;
begin
  select count(*) into n from pg_class c where c.relnamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  n := n + (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'));
  if n > 0 then raise exception 'public ainda tem % objetos', n; end if;
end $$;
commit;

-- hard_delete_empresa(3) como o superadmin, sobre a cópia DEPOIS do script de migração (core v1 +
-- old_*). Passa se: não dá erro, a empresa some e nenhuma tabela de public fica com linha da
-- empresa 3 (órfã). superadmin_logs é a exceção de propósito: a trilha fica, com empresa_id nulo.
-- Tudo é desfeito no fim.
--   psql -v ON_ERROR_STOP=1 -d <copia> -f supabase/testes/hard_delete_empresa.sql
\set ON_ERROR_STOP on
begin;
create temp table antes (tabela text primary key, n bigint);
create temp table depois (tabela text primary key, n bigint);
create temp table logs_antes as select id from superadmin_logs where empresa_id = 3;

do $$
declare r record; v bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
           where s.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'superadmin_logs' loop
    execute format('select count(*) from public.%I where empresa_id = 3', r.relname) into v;
    if v > 0 then insert into antes values (r.relname, v); end if;
  end loop;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from usuarios where is_super_admin limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select hard_delete_empresa(3);
reset role;

do $$
declare r record; v bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
           where s.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'superadmin_logs' loop
    execute format('select count(*) from public.%I where empresa_id = 3', r.relname) into v;
    if v > 0 then insert into depois values (r.relname, v); end if;
  end loop;
end $$;

select 'apagadas: ' || coalesce(sum(n), 0) || ' linhas em ' || count(*) || ' tabelas (' ||
       coalesce(string_agg(tabela || ' ' || n, ', ' order by n desc), '') || ')' as resultado from antes
union all select 'empresa 3 existe: ' || count(*) from empresas where id = 3
union all select 'órfãs (tabelas com linha da empresa 3): ' || count(*) ||
                 coalesce(' → ' || string_agg(tabela || ' ' || n, ', '), '') from depois
union all select 'superadmin_logs da empresa 3 preservados (empresa_id nulo): ' ||
                 (select count(*) from superadmin_logs s join logs_antes l on l.id = s.id where s.empresa_id is null) ||
                 ' de ' || (select count(*) from logs_antes);
rollback;

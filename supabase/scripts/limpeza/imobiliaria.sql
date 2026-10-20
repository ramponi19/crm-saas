-- Item 2.5 pelo operador da limpeza (sql-imobiliaria): apaga o tenant 3 (Imobiliária).
-- Autocommit, numa sessão só. O dump do public de 20/10 10:42 tem tudo o que sai aqui.
\set ON_ERROR_STOP 1
\pset footer off
select (select count(*) from public.negocios where empresa_id = 3) negocios,
       (select count(*) from public.contatos where empresa_id = 3) contatos,
       (select count(*) from public.mensagens where empresa_id = 3) mensagens,
       (select count(*) from public.integracao_eventos where empresa_id = 3) integracao_eventos,
       (select slug from public.empresas where id = 3) slug;

-- 1. O log do C2S (integracao_eventos, ~11 mil linhas com payload) sairia todo de uma vez na
--    cascata; sai antes, em lotes de 500 com pausa de 1 s.
\timing on
do $$
declare n int; total int := 0; lotes int := 0;
begin
  loop
    delete from public.integracao_eventos
     where ctid = any (array(select ctid from public.integracao_eventos where empresa_id = 3 limit 500));
    get diagnostics n = row_count;
    exit when n = 0;
    total := total + n; lotes := lotes + 1;
    commit;
    perform pg_sleep(1);
  end loop;
  raise notice 'integracao_eventos do tenant 3 apagados: % em % lotes', total, lotes;
end $$;

-- 2. hard_delete_empresa exige um superadmin identificado (auth.uid()): a sessão assume o
--    único superadmin só dentro desta transação.
begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id::text from public.usuarios where is_super_admin limit 1), 'role', 'authenticated')::text,
                  true) is not null as identificado;
select public.hard_delete_empresa(3);
commit;
\timing off

-- 3. Sobrou alguma linha do tenant 3 em qualquer tabela ou view com empresa_id?
do $$
declare r record; c bigint; total bigint := 0;
begin
  for r in select cl.relname from pg_attribute a join pg_class cl on cl.oid = a.attrelid
            where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('r', 'v', 'p')
              and a.attname = 'empresa_id' and not a.attisdropped
  loop
    execute format('select count(*) from public.%I where empresa_id = 3', r.relname) into c;
    if c > 0 then raise notice 'SOBROU: % = %', r.relname, c; total := total + c; end if;
  end loop;
  raise notice 'linhas restantes do tenant 3 (tabelas e views): %', total;
end $$;
select (select count(*) from public.empresas where id = 3) empresa_3,
       (select count(*) from public.empresas where slug = 'imobiliaria-cf893076') slug;

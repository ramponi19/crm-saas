-- Impressão digital do esquema (public + cron.job), por tipo. Mesma consulta no local e na produção; complete com:
--   select tipo, md5(string_agg(grupo || ':' || h, ',' order by grupo collate "C")) h, count(*) grupos, sum(n) itens from grupos group by tipo order by tipo;
-- Ignora tabelas _backup*, objetos de extensão, \r nos corpos e o host das rotinas (o ritual troca pelo app local).
with
ext as (select objid from pg_depend where deptype = 'e'),
tabs as (
  select c.oid, c.relname::text relname, c.relkind::text relkind, c.relrowsecurity, c.relforcerowsecurity, coalesce(c.relacl::text, '') acl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p','f','S') and c.relname not like '\_backup%'
     and c.oid not in (select objid from ext)),
linhas as (
  select 'tabela' tipo, relname grupo, relkind || '|' || relrowsecurity::text || '|' || relforcerowsecurity::text || '|' || acl x from tabs
  union all
  select 'coluna', t.relname, a.attname::text || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text || '|' ||
         coalesce(pg_get_expr(d.adbin, d.adrelid), '') || '|' || a.attgenerated::text || '|' || a.attidentity::text || '|' || coalesce(a.attacl::text, '')
    from tabs t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select 'restricao', t.relname, co.conname::text || '|' || pg_get_constraintdef(co.oid) from tabs t join pg_constraint co on co.conrelid = t.oid
  union all
  select 'indice', t.relname, pg_get_indexdef(i.indexrelid) from tabs t join pg_index i on i.indrelid = t.oid
  union all
  select 'gatilho', t.relname, tg.tgname::text || '|' || tg.tgenabled::text || '|' || pg_get_triggerdef(tg.oid) from tabs t join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
  union all
  select 'politica', p.tablename::text, p.policyname::text || '|' || p.permissive || '|' || p.roles::text || '|' || p.cmd || '|' || coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')
    from pg_policies p where p.schemaname = 'public' and p.tablename not like '\_backup%'
  union all
  select 'visao', t.relname, pg_get_viewdef(t.oid) from tabs t where t.relkind in ('v','m')
  union all
  select 'funcao', p.proname::text, pg_get_function_identity_arguments(p.oid) || '|' ||
         md5(replace(pg_get_functiondef(p.oid), E'\r', '')) || '|' || coalesce(p.proacl::text, '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.oid not in (select objid from ext)
  union all
  select 'cron', j.jobname::text, j.schedule || '|' || replace(replace(j.command, E'\r', ''), 'http://host.docker.internal:3011', 'https://crm-saas-beta.vercel.app') || '|' || j.active::text
    from cron.job j
),
grupos as (select tipo, grupo, md5(string_agg(x, E'\n' order by x collate "C")) h, count(*) n from linhas group by tipo, grupo)

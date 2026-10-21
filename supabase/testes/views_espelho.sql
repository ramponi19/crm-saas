-- Views de public que espelham UMA tabela, com as mesmas colunas na mesma ordem (as views de
-- módulo do core v1: `garantias_assistencias` = `assistencia_garantias`, ...). Saída "view|tabela".
-- Usado por scripts/tipos-espelho.mjs para gerar types/views-espelho.ts.
with deps as (
  select v.relname vname, v.oid void, array_agg(distinct t.oid) toids
    from pg_class v
    join pg_rewrite r on r.ev_class = v.oid
    join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
    join pg_class t on t.oid = d.refobjid and t.oid <> v.oid and t.relkind in ('r', 'p')
                   and t.relnamespace = 'public'::regnamespace
   where v.relnamespace = 'public'::regnamespace and v.relkind = 'v'
   group by 1, 2)
select d.vname || '|' || c.relname
  from deps d join pg_class c on c.oid = d.toids[1]
 where array_length(d.toids, 1) = 1
   and (select array_agg(attname order by attnum) from pg_attribute where attrelid = d.void and attnum > 0 and not attisdropped)
     = (select array_agg(attname order by attnum) from pg_attribute where attrelid = d.toids[1] and attnum > 0 and not attisdropped)
 order by 1;

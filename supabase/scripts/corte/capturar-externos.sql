-- =====================================================================================
-- CORTE, passo (b): captura o que o dump do schema public NÃO leva e a volta precisa.
--
-- A volta (volta-limpar-public.sql + pg_restore) apaga os objetos do public com CASCADE.
-- Junto vão objetos de OUTROS schemas que dependem de funções/tabelas do public — em
-- produção (19/10/2026): 8 policies de storage.objects, a policy do ZapIntel em
-- realtime.messages e o gatilho on_auth_user_created de auth.users. A publicação
-- supabase_realtime também perde as tabelas do public. Nada disso está no dump -n public.
--
-- Este arquivo gera o SQL que recria tudo isso, a partir do banco ANTES do corte:
--   psql "<conexão>" -X -q -A -t -v ON_ERROR_STOP=1 -f capturar-externos.sql -o externos.sql
-- e o externos.sql gerado é aplicado no fim da volta. Só lê.
--
-- As definições saem com nomes relativos ao search_path da captura (get_empresa_id(), não
-- public.get_empresa_id()); por isso o arquivo gerado fixa o mesmo search_path.
-- Em produção o postgres não é dono de storage.objects, auth.users nem realtime.messages, mas
-- pode criar policy neles (supautils.policy_grants) e gatilho em auth.users (privilégio TRIGGER)
-- — conferido em 19/10/2026. Numa cópia sem supautils, aplicar como superusuário.
-- =====================================================================================
with publico as (
  select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
  union select c.oid from pg_class c where c.relnamespace = 'public'::regnamespace
  union select t.oid from pg_type t where t.typnamespace = 'public'::regnamespace
),
pols as (
  select distinct pol.oid, pc.relnamespace::regnamespace::text esquema, pc.relname tabela, pol.polname
    from pg_depend d join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
    join pg_class pc on pc.oid = pol.polrelid
   where d.refobjid in (select oid from publico) and pc.relnamespace <> 'public'::regnamespace
),
trgs as (
  select distinct tg.oid, tc.relnamespace::regnamespace::text esquema, tc.relname tabela, tg.tgname
    from pg_depend d join pg_trigger tg on d.classid = 'pg_trigger'::regclass and tg.oid = d.objid
    join pg_class tc on tc.oid = tg.tgrelid
   where d.refobjid in (select oid from publico) and tc.relnamespace <> 'public'::regnamespace
)
select linha from (
  select 1 ordem, '-- gerado por capturar-externos.sql em ' || now()::text || ' (' || current_database() || ')' linha
  union all select 2, 'begin;' || chr(10) || 'set local search_path to ' || current_setting('search_path') || ';'
  union all
  select 3, format('drop policy if exists %I on %I.%I;', p.policyname, p.schemaname, p.tablename) || chr(10) ||
            format('create policy %I on %I.%I as %s for %s to %s%s%s;', p.policyname, p.schemaname, p.tablename,
                   p.permissive, p.cmd,
                   (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(p.roles) r),
                   coalesce(' using (' || p.qual || ')', ''), coalesce(' with check (' || p.with_check || ')', ''))
    from pols x join pg_policies p on p.schemaname = x.esquema and p.tablename = x.tabela and p.policyname = x.polname
  union all
  select 4, format('drop trigger if exists %I on %I.%I;', t.tgname, t.esquema, t.tabela) || chr(10) || pg_get_triggerdef(t.oid) || ';'
    from trgs t
  union all
  select 5, format('alter publication %I add table %I.%I;', pt.pubname, pt.schemaname, pt.tablename)
    from pg_publication_tables pt where pt.schemaname = 'public'
  union all select 6, 'commit;'
) x order by ordem, linha;

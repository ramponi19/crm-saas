-- Equivalente local do advisor do Supabase para o core v1 (roda em qualquer cópia).
-- Parte A: as 16 tabelas do core. Cada consulta devolve ZERO linhas quando está tudo certo.
-- Parte B: a dívida que já vem de produção (tabelas antigas), só contada, para comparar.

create temp table _core(tabela text primary key) on commit drop;
insert into _core values ('empresa_branding'),('empresa_modulos'),('empresa_menu'),('empresa_dados_contrato'),
  ('presets_onboarding'),('campos_personalizados'),('canais'),('contatos'),('contato_identidades'),('contato_fusoes'),
  ('negocios'),('negocio_historico'),('conversas'),('mensagens'),('itens'),('eventos');

create temp view _sem_rls as
  select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

create temp view _sem_policy as
  select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

create temp view _fk_sem_indice as
  select cl.relname as tabela, c.conname as fk
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where c.contype = 'f' and n.nspname = 'public'
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey);

-- ---------------------------------------------------------------- A. core (tem de dar zero)
select 'core: sem RLS' as problema, tabela, null as detalhe from _sem_rls where tabela in (select tabela from _core)
union all
select 'core: sem policy', tabela, null from _sem_policy where tabela in (select tabela from _core)
union all
select 'core: FK sem índice', tabela, fk from _fk_sem_indice where tabela in (select tabela from _core)
union all
select 'core: tabela faltando', tabela, null from _core
 where not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = _core.tabela)
union all
select 'core: ação sem policy', k.tabela, a.acao
  from _core k cross join (values ('r'), ('a'), ('w'), ('d')) a(acao)
 where exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = k.tabela)
   and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || k.tabela)::regclass and p.polcmd = a.acao)
union all
select 'core: mais de uma policy na ação', k.tabela, p.polcmd::text
  from _core k join pg_policy p on p.polrelid = ('public.' || k.tabela)::regclass
 group by k.tabela, p.polcmd having count(*) > 1
union all
select 'core: empresa_id sem NOT NULL/FK', k.tabela, null
  from _core k
 where k.tabela <> 'presets_onboarding'
   and not exists (
     select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.conrelid = ('public.' || k.tabela)::regclass and c.contype = 'f' and a.attname = 'empresa_id'
        and a.attnotnull and c.confrelid = 'public.empresas'::regclass)
union all
select 'core: policy chama get_empresa_id() por linha', c.relname, p.polname
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname in (select tabela from _core)
   and regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                      'SELECT (public\.)?get_empresa_id\(\)', '', 'g') ~ 'get_empresa_id\(\)'
union all
select 'core: função core_* executável', p.proname, r.rolname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) r(rolname)
 where n.nspname = 'public' and p.proname like 'core\_%'
   and has_function_privilege(r.rolname, p.oid, 'execute');

-- ---------------------------------------------------------------- B. dívida que já vem de produção
select (select count(*) from _sem_rls where tabela not in (select tabela from _core)) as antigas_sem_rls,
       (select count(*) from _sem_policy where tabela not in (select tabela from _core)) as antigas_sem_policy,
       (select count(*) from _fk_sem_indice where tabela not in (select tabela from _core)) as antigas_fk_sem_indice;

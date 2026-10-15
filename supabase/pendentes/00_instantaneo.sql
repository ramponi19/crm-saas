-- PASSO 00 — INSTANTÂNEO ANTES DAS MIGRAÇÕES 01–04. Só cria tabelas no schema
-- `backup` (não exposto na API); não altera nada do que está em uso.
--
-- Guarda o estado exato de tudo que 01–04 mexem, para recuperar mesmo que um
-- `.volta.sql` falhe: todas as políticas (public + storage), as permissões de
-- EXECUTE das funções que a 04 altera e o código das 3 funções que a 01 altera.
-- Não depende de backup do Supabase (não verificado: painel → Database → Backups).
set local lock_timeout = '5s';

create table backup.politicas_pre_20261015 as
select n.nspname::text esquema, c.relname::text tabela, p.polname::text politica, p.polcmd::text comando,
       p.polpermissive permissiva, p.polroles::regrole[]::text[] papeis,
       pg_get_expr(p.polqual, p.polrelid) usando, pg_get_expr(p.polwithcheck, p.polrelid) checa
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage');

create table backup.permissoes_funcoes_pre_20261015 as
select p.oid::regprocedure::text funcao,
       has_function_privilege('anon', p.oid, 'execute') anon,
       has_function_privilege('authenticated', p.oid, 'execute') logado,
       p.proacl::text acl
from pg_proc p where p.pronamespace = 'public'::regnamespace;

create table backup.funcoes_zapintel_pre_20261015 as
select p.oid::regprocedure::text funcao, pg_get_functiondef(p.oid) definicao
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('zapintel_dashboard', 'zapintel_dashboard_lista', 'zapintel_leads_lista');

revoke all on backup.politicas_pre_20261015, backup.permissoes_funcoes_pre_20261015,
  backup.funcoes_zapintel_pre_20261015 from anon, authenticated;

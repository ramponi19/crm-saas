-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS.
--
-- 96 políticas de RLS chamavam get_empresa_id() / is_super_admin() UMA VEZ POR
-- LINHA. As duas são STABLE (mesmo valor dentro da mesma consulta), então
-- `(select f())` — calculado uma vez — dá exatamente o mesmo resultado.
-- O mesmo conserto já está em produção em leads e lead_mensagens (15/10).
--
-- Testado em 15/10/2026, em transações desfeitas, por grupo, comparando o
-- conteúdo visível (hash de todas as linhas) de cada tabela para 7 perfis:
-- dono, admin, vendedor com loja, vendedor sem loja, outra empresa, empresa de
-- prévia/superadmin e anônimo.
--   grupo 1 (25 tabelas, só empresa) ......... 30 políticas, 175 comparações, 0 diferenças, 97 -> 38 ms
--   grupo 2 (23 tabelas, empresa + loja) ...... 25 políticas, 161 comparações, 0 diferenças, 82 -> 64 ms
--                                               + gravação: outra empresa barrada, própria passa (antes e depois)
--   grupos 3-7 (22 tabelas) ................... 35 políticas, 154 comparações, 0 diferenças
--                                               integracao_eventos 15,2 s -> 8,1 s (7 perfis, com hash)
--   grupo 8 (superadmin: usuarios, planos…) .... 6 políticas, 35 comparações, 0 diferenças, 44 -> 14 ms
--
-- NÃO mexe em is_empresa_admin(empresa_id): depende da linha.
-- Guarda as definições atuais em backup.rls_politicas_20261015 ANTES de mudar.
-- VOLTA ATRÁS: 03_rls_uma_vez_por_consulta.volta.sql (lê esse backup).
set local lock_timeout = '5s';  -- cada ALTER POLICY trava a tabela por instantes; se alguma estiver ocupada, falha tudo e nada muda

-- Pré-condição: exatamente as 96 políticas testadas em 15/10, e o backup ainda não existe.
do $$ declare n int; begin
  select count(*) into n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ '(?<!SELECT )(get_empresa_id|is_super_admin)\(\)';
  if n <> 96 then raise exception '03: esperava 96 políticas, achou % — nada foi alterado', n; end if;
  if to_regclass('backup.rls_politicas_20261015') is not null then raise exception '03: backup já existe (já aplicada?) — nada foi alterado'; end if;
end $$;

create table backup.rls_politicas_20261015 as
select c.relname::text tabela, p.polname::text politica,
       pg_get_expr(p.polqual, p.polrelid) usando, pg_get_expr(p.polwithcheck, p.polrelid) checa
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relnamespace = 'public'::regnamespace
  and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
      ~ '(?<!SELECT )(get_empresa_id|is_super_admin)\(\)';
revoke all on backup.rls_politicas_20261015 from anon, authenticated;

do $$
declare pol record; e1 text; e2 text; n int := 0;
begin
  for pol in select * from backup.rls_politicas_20261015 loop
    e1 := regexp_replace(regexp_replace(pol.usando, '(?<!SELECT )get_empresa_id\(\)', '(select get_empresa_id())', 'g'), '(?<!SELECT )is_super_admin\(\)', '(select is_super_admin())', 'g');
    e2 := regexp_replace(regexp_replace(pol.checa,  '(?<!SELECT )get_empresa_id\(\)', '(select get_empresa_id())', 'g'), '(?<!SELECT )is_super_admin\(\)', '(select is_super_admin())', 'g');
    execute format('alter policy %I on public.%I', pol.politica, pol.tabela)
      || coalesce(' using (' || e1 || ')', '') || coalesce(' with check (' || e2 || ')', '');
    n := n + 1;
  end loop;
  raise notice '% políticas atualizadas', n;
end $$;

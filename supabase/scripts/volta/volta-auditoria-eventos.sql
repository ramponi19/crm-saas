-- VOLTA da 20261125000300_auditoria_eventos (etapa 1.1a).
-- Só enquanto nenhuma função depender de auditar()/auditar_emp() (antes da 20261125000400 e da 1.1b).
-- Depois disso, a volta é só do app: a tabela e as funções ficam (são aditivas).
-- O que foi auditado é guardado em ops.auditoria_eventos_volta antes do drop.
begin;
create schema if not exists ops;
create table if not exists ops.auditoria_eventos_volta as select * from public.auditoria_eventos;
drop trigger if exists empresas_expurgar_auditoria on public.empresas;
drop function if exists public.empresas_expurgar_auditoria();
drop function if exists public.auditar(text, text, text, jsonb, jsonb, text, text);
drop function if exists public.auditar_emp(bigint, text, text, text, jsonb, jsonb, text, text, bigint);
drop table if exists public.auditoria_eventos;   -- leva os gatilhos de imutabilidade junto
drop function if exists public.auditoria_eventos_imutavel();
commit;

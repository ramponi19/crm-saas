-- =====================================================================================
-- TODA VIEW EM public É security_invoker — e o banco recusa a que não for.
--
-- O FURO (20/10/2026, 20:56:47 → 20:59:31): a migração 20261021002800 recriou leads e
-- lead_mensagens com CREATE OR REPLACE VIEW sem `with (security_invoker = true)`. O replace
-- APAGA as opções que não forem repetidas: as views passaram a rodar como o dono (postgres,
-- BYPASSRLS) e a RLS de loja parou de valer por elas — um vendedor de Jaguariúna lia 1.885 cards
-- e 61.762 mensagens de Mogi. Corrigido em produção às 20:59:31 com ALTER VIEW; esta migração é o
-- registro disso e a trava para não acontecer de novo.
--
-- storage_orfaos nunca teve a opção (anterior a hoje). Quem a lê é a retenção (cron, service_role,
-- que tem select em storage.objects e ignora RLS), então security_invoker não muda nada para ela.
--
-- A TRAVA: event trigger no fim de todo CREATE VIEW / ALTER VIEW. Se qualquer view de public
-- estiver sem security_invoker=true, o comando falha — e a migração inteira volta. No build,
-- scripts/check-views.mjs faz a mesma conferência lendo os arquivos de migração.
-- =====================================================================================

alter view public.leads set (security_invoker = true);
alter view public.lead_mensagens set (security_invoker = true);
alter view public.storage_orfaos set (security_invoker = true);

create or replace function ops.exigir_security_invoker()
  returns event_trigger
  language plpgsql
  set search_path to 'pg_catalog', 'pg_temp'
as $$
declare
  v_sem text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_sem
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not exists (select 1 from unnest(coalesce(c.reloptions, '{}'::text[])) o
                      where o ~* '^security_invoker=(true|on|yes|1)$');
  if v_sem is not null then
    raise exception 'view em public sem security_invoker=true: %', v_sem
      using hint = 'Use create or replace view ... with (security_invoker = true) as ... — o replace apaga as opções que não forem repetidas.',
            errcode = '42501';
  end if;
end $$;
revoke execute on function ops.exigir_security_invoker() from public;

drop event trigger if exists exigir_security_invoker;
create event trigger exigir_security_invoker on ddl_command_end
  when tag in ('CREATE VIEW', 'ALTER VIEW')
  execute function ops.exigir_security_invoker();

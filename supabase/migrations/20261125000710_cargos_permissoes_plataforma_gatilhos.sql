-- ETAPA 1.1b, parte 2 de 2 (repo: laço final de supabase/migrations/20261125000700_cargos_permissoes.sql).
-- Sem drop trigger (que pede AccessExclusiveLock): só cria onde ainda não existe; lock_timeout curto para falhar em vez de travar o app.
set local lock_timeout = '3s';
do $$
declare t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'empresa_id'
       and c.table_name not in ('auditoria_eventos', 'acessos', 'superadmin_logs', 'rate_limit', 'historico_bruto',
                                'zapintel_conversa_cache', 'diagnostico_canais', 'rotinas_execucoes_empresas')
       and c.table_name not like '\_backup%'
     order by 1
  loop
    if not exists (select 1 from pg_trigger where tgname = 'zz_plataforma_auditar' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger zz_plataforma_auditar after insert or update or delete on public.%I for each row execute function public.plataforma_auditar_escrita()', t);
    end if;
  end loop;
end $$;

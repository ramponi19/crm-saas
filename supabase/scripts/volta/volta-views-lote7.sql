-- Volta da 20261105000900_drop_views_lote7: recria canais_conectados como estava na produção em
-- 05/11/2026 (colunas, security_invoker, grants: authenticated e service_role, sem anon).
-- Junto: Instant Rollback do app e republicar a Edge webhook-leads da versão anterior (v70).
begin;
create view public.canais_conectados with (security_invoker = true) as
  select id, empresa_id, tipo, external_id, waba_id, ig_user_id, nome_exibicao, access_token_enc,
         token_expira_em, data_access_expira_em, coexistencia, status, ultimo_erro, ultimo_erro_em,
         conectado_em, ultima_msg_em, sync_contatos_em, sync_historico_em, sync_request_ids,
         sync_historico_pct, criado_por, created_at, updated_at, filial_id, via
    from public.canais;
grant all on public.canais_conectados to authenticated, service_role;
commit;

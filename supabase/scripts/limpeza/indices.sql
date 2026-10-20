-- Item 2.2 pelo operador da limpeza (sql-indices). Autocommit: CONCURRENTLY, um por vez.
\timing on
\i 'D:/Empresa TI/CRM-SaaS/supabase/migrations/20261021002000_indices.sql'
\timing off
select indexrelid::regclass::text as indice, indisvalid as valido from pg_index
 where indrelid = 'public.tarefas'::regclass and indexrelid::regclass::text in ('tarefas_responsavel_id_idx', 'tarefas_filial_id_idx');
select count(*) as restam_dos_8 from pg_indexes where schemaname = 'public' and indexname in
 ('idx_rastr_visitas_tid', 'idx_rastr_eventos_capi', 'idx_cobrancas_provider_ref', 'payment_webhook_eventos_lookup',
  'idx_empresas_stripe_customer', 'idx_empresas_stripe_sub', 'idx_lancamentos_status', 'idx_lancamentos_tipo');

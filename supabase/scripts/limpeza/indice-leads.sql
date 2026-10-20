-- Item 2.8 pelo operador da limpeza (sql-indice-leads). Autocommit.
\timing on
\i 'D:/Empresa TI/CRM-SaaS/supabase/migrations/20261021002500_negocios_principal_idx.sql'
\timing off
select indexrelid::regclass::text as indice, indisvalid as valido, pg_size_pretty(pg_relation_size(indexrelid)) as tamanho
  from pg_index where indexrelid = 'public.negocios_contato_principal_idx'::regclass;

-- VOLTA ATRÁS de 02_contratos_bucket.sql: a política exatamente como estava em 15/10/2026.
drop policy if exists contratos_leitura_do_tenant on storage.objects;
drop policy if exists contratos_delete_do_tenant on storage.objects;
create policy contratos_leitura on storage.objects for select using (bucket_id = 'contratos');

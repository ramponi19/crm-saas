-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS.
--
-- Bucket `contratos` = imagens de FUNDO dos modelos de contrato (61 arquivos,
-- só da JM em 15/10/2026). Não guarda contrato assinado nem dado de cliente.
--
-- Hoje: política `contratos_leitura` dá SELECT a TODOS os papéis. Medido em
-- 15/10 (transação desfeita): o dono da IMOBILIÁRIA lista os 61 fundos da JM.
-- O bucket precisa continuar PÚBLICO: o contrato emitido é HTML que usa o fundo
-- por URL (lib/contrato-modelo.ts) e é aberto/impresso no navegador — o
-- download por /object/public/ não depende de política nenhuma.
--
-- Depois (testado na mesma transação):
--   dono JM 61, vendedor JM 61, dono Imobiliária 0, anônimo bloqueado.
-- E a exclusão passa a funcionar na pasta da própria empresa: hoje não há
-- política de DELETE e a rota que apaga os fundos de um modelo excluído
-- (app/api/contrato-documentos) falha calada, deixando arquivo órfão.
--
-- VOLTA ATRÁS: 02_contratos_bucket.volta.sql.
set local lock_timeout = '5s';  -- não fica preso atrás de upload em andamento: falha e nada muda

-- Pré-condição: o estado de 15/10 (política antiga presente, novas ausentes).
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'contratos_leitura')
     or exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname in ('contratos_leitura_do_tenant', 'contratos_delete_do_tenant'))
  then raise exception '02: storage.objects não está no estado esperado — nada foi alterado'; end if;
end $$;

drop policy if exists contratos_leitura on storage.objects;
create policy contratos_leitura_do_tenant on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = (select get_empresa_id())::text);
create policy contratos_delete_do_tenant on storage.objects for delete to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = (select get_empresa_id())::text);

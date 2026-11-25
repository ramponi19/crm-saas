-- Rotina 'automacoes-hora' do pg_cron, como está na produção (jobid 4, criada em 04/11/2026 pelo
-- supabase/scripts/automatize-cron.sql, fora das migrações). Entra aqui só para o replay das migrações ficar igual
-- à produção (conferência de esquema de 25/11/2026). NÃO foi aplicada na produção como migração: lá ela já existe
-- com este mesmo comando (md5 76bba1ced754d3640162060e47af3a21). cron.schedule com o mesmo nome só atualiza.
-- Pré-requisito em ambiente novo: o segredo 'cron_secret' no Vault (ver o script acima). No ritual local o endereço
-- de produção é trocado pelo app local (scripts/teste-local.sh).
select cron.schedule('automacoes-hora', '17 * * * *', $job$
  select net.http_get(
    url := 'https://crm-saas-beta.vercel.app/api/cron/automacoes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  );
  $job$);

-- AUTOMATIZE: job do pg_cron de hora em hora (decisões do Lucas, 04/11/2026).
--
-- PRÉ-REQUISITOS, nesta ordem:
--   1. migração 20261105000100_automatize e 20261105000200_pg_net aplicadas;
--   2. o segredo no Vault, criado PELO LUCAS no SQL Editor do Supabase com o MESMO valor
--      do CRON_SECRET da Vercel (Production). O Claude não vê nem digita o valor:
--        select vault.create_secret('<CRON_SECRET da Vercel>', 'cron_secret',
--          'CRON_SECRET do app: o pg_cron chama /api/cron/automacoes');
--      Conferir sem revelar: select name, created_at from vault.secrets where name = 'cron_secret';
--
-- O job lê o segredo do Vault NA HORA (o texto do job em cron.job não tem o segredo).
-- Minuto 17 de toda hora: nunca no mesmo minuto da retenção (retencao-diaria = 0 7 * * * UTC,
-- 04:00 de Brasília). A rota processa em lotes, é idempotente e registra a rodada em eventos.
-- Volta: select cron.unschedule('automacoes-hora');

select cron.schedule(
  'automacoes-hora',
  '17 * * * *',
  $job$
  select net.http_get(
    url := 'https://crm-saas-beta.vercel.app/api/cron/automacoes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

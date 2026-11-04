-- AUTOMATIZE: o pg_cron chama /api/cron/automacoes de hora em hora por HTTP (pg_net).
-- DDL: segue o gate (IOwait abaixo de 10% no momento, senão 18h). Volta: drop extension pg_net.
create extension if not exists pg_net with schema extensions;

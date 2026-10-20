-- Retenção em lotes de 500 (não 5.000) com pausa de 1 s, também no cron.
--
-- A 20261021001000 agendou `call ops.purgar_retencao()`, que usa o padrão de 5.000
-- por lote. Em 20/10 um lote de 500 linhas do historico_bruto (~15 KB de TOAST cada)
-- já passou de 2 min com a loja aberta. Lote menor é o mesmo trabalho em passos
-- curtos — mesmo de madrugada.
--
-- Só troca o comando do job: não é DDL de tabela, mas só aplicar fora do expediente
-- (regra do 05-RUNBOOK-CORTE.md).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'retencao-diaria') then
    perform cron.alter_job(
      job_id  := (select jobid from cron.job where jobname = 'retencao-diaria'),
      command := 'call ops.purgar_retencao(500, 1)');
  end if;
end $$;

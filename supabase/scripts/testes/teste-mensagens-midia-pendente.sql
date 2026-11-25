-- Teste da 20261125000200_mensagens_midia_pendente. Transação desfeita (termina com RAISE).
-- Confere: colunas e padrões, a trava dos valores de midia_status, o índice parcial, o job do pg_cron só com
-- pendente, e que a mensagem antiga (sem os campos) continua igual.
do $teste$
declare
  r jsonb := '{}';
  e text;
  v_msg bigint;
begin
  r := r || jsonb_build_object(
    't1_colunas', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                    where table_schema = 'public' and table_name = 'mensagens'
                      and column_name in ('midia_status', 'midia_ref', 'midia_expira_em', 'midia_tentativas')),
    't1_tentativas_padrao', (select column_default from information_schema.columns
                    where table_schema = 'public' and table_name = 'mensagens' and column_name = 'midia_tentativas'),
    't2_indice', exists (select 1 from pg_indexes where indexname = 'mensagens_midia_pendente_idx'),
    't3_job', (select schedule from cron.job where jobname = 'resgatar-midias'),
    't3_job_so_com_pendente', (select command like '%midia_status = ''pendente''%' from cron.job where jobname = 'resgatar-midias'));

  -- uma mensagem qualquer (a mais recente) para testar a trava e o estado
  select id into v_msg from mensagens order by id desc limit 1;
  if v_msg is null then
    r := r || jsonb_build_object('t4_sem_mensagem_no_banco', true);
  else
    r := r || jsonb_build_object('t4_antiga_sem_estado', (select midia_status is null and midia_tentativas = 0 from mensagens where id = v_msg));
    update mensagens set midia_status = 'pendente', midia_ref = 'wa-teste', midia_expira_em = now() + interval '7 days' where id = v_msg;
    r := r || jsonb_build_object('t5_pendente_entra_no_indice',
      (select count(*) from mensagens where midia_status = 'pendente' and midia_expira_em > now()) >= 1);
    update mensagens set midia_status = 'indisponivel' where id = v_msg;
    r := r || jsonb_build_object('t5_indisponivel_aceito', (select midia_status from mensagens where id = v_msg));
    begin update mensagens set midia_status = 'qualquer' where id = v_msg; e := 'gravou';
    exception when check_violation then e := 'RECUSADO'; end;
    r := r || jsonb_build_object('t6_valor_invalido', e);
  end if;

  raise exception 'RESULTADO_MIDIA_PENDENTE %', r::text;
end $teste$;

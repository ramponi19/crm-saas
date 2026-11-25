-- VOLTA da 20261125000600_rotinas_execucoes (entrega 1.1r).
-- Ordem: voltar o APP primeiro (a rota /api/cron/[job] chama rotina_execucao_abrir/fechar; sem as funções ela
-- só registra um aviso e segue). Depois este script devolve o comando ORIGINAL dos jobs (lido da produção em
-- 25/11/2026) e desagenda o conferidor. As tabelas e funções ficam (só acrescentaram; nada as usa sem os jobs).
select cron.schedule('posvenda-rotina-diaria', '10 * * * *', $c$ select public.posvenda_rotina_diaria() $c$);
select cron.schedule('liberacao-diaria-esteira', '5 * * * *', $c$ select public.core_liberar_lotes_do_dia() $c$);
select cron.schedule('zapintel-conversa-aquecer', '0 5 * * *',
  $c$select public.zapintel_conversa_aquecer(m.empresa_id) from public.empresa_modulos m where m.modulo = 'inteligencia' and m.ativo$c$);
select cron.unschedule('rotinas-conferir') where exists (select 1 from cron.job where jobname = 'rotinas-conferir');
-- Conferir: select jobname, command from cron.job order by jobid;

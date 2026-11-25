-- VOLTA de 20261125000200_mensagens_midia_pendente.sql. Rodar DEPOIS de voltar a Edge (a v87 não escreve
-- nessas colunas) e o app (o app novo só lê; sem as colunas, a consulta do chat quebraria — volte o app antes).
-- Mensagens que estiverem pendentes voltam a ser texto sem arquivo, como era antes.
select cron.unschedule('resgatar-midias') where exists (select 1 from cron.job where jobname = 'resgatar-midias');
update public.mensagens set tipo = 'texto' where midia_status in ('pendente', 'indisponivel') and midia_url is null;
drop index if exists public.mensagens_midia_pendente_idx;
alter table public.mensagens drop constraint if exists mensagens_midia_status_chk;
alter table public.mensagens
  drop column if exists midia_tentativas,
  drop column if exists midia_expira_em,
  drop column if exists midia_ref,
  drop column if exists midia_status;

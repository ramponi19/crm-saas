-- Volta da 20261105000100_automatize. Políticas antigas lidas da produção em 04/11/2026.
-- ATENÇÃO: apaga a fila e o histórico de execuções (automacao_execucoes). Rodar só com o
-- app de antes no ar (Instant Rollback) e com o job do pg_cron desligado
-- (select cron.unschedule('automacoes-hora');).
begin;
drop function if exists public.automacao_reservar(integer);
drop table if exists public.automacao_execucoes;

-- automações com ação nova não cabem no check antigo: desligadas e convertidas em tarefa.
update public.automacoes set acao = 'criar_tarefa', ativo = false
 where acao in ('enviar_modelo', 'atribuir_responsavel');
alter table public.automacoes drop constraint if exists automacoes_modelo_check;
alter table public.automacoes drop constraint if exists automacoes_espera_dias_check;
alter table public.automacoes drop column if exists modelo_id;
alter table public.automacoes drop column if exists espera_dias;
alter table public.automacoes drop constraint if exists automacoes_acao_check;
alter table public.automacoes add constraint automacoes_acao_check
  check (acao = any (array['criar_tarefa', 'enviar_whatsapp_template', 'notificar_gestor']));

alter table public.contatos drop column if exists opt_out_em;

drop policy if exists automacoes_leitura on public.automacoes;
drop policy if exists automacoes_escrita on public.automacoes;
create policy automacoes_tenant on public.automacoes for all to public
  using (empresa_id = get_empresa_id()) with check (empresa_id = get_empresa_id());
drop policy if exists cadencias_leitura on public.cadencias;
drop policy if exists cadencias_escrita on public.cadencias;
create policy cad_tenant on public.cadencias for all to public
  using (empresa_id = get_empresa_id()) with check (empresa_id = get_empresa_id());
drop policy if exists cadencia_passos_leitura on public.cadencia_passos;
drop policy if exists cadencia_passos_escrita on public.cadencia_passos;
create policy cadp_tenant on public.cadencia_passos for all to public
  using (empresa_id = get_empresa_id()) with check (empresa_id = get_empresa_id());
commit;

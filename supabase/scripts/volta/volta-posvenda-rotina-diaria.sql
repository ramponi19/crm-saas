-- Volta da 20261124002400_posvenda_rotina_diaria.
select cron.unschedule('posvenda-rotina-diaria');
-- Chamados: a leitura volta a ser só do responsável e dos administradores (políticas da 20261124000200).
drop policy if exists posvenda_chamados_leitura on public.posvenda_chamados;
create policy posvenda_chamados_leitura on public.posvenda_chamados for select to authenticated
  using (empresa_id = (select get_empresa_id()) and (responsavel_id = (select auth.uid()) or is_empresa_admin(empresa_id)));
drop policy if exists posvenda_chamado_eventos_leitura on public.posvenda_chamado_eventos;
create policy posvenda_chamado_eventos_leitura on public.posvenda_chamado_eventos for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and exists (select 1 from public.posvenda_chamados c where c.id = chamado_id
                      and (c.responsavel_id = (select auth.uid()) or is_empresa_admin(c.empresa_id))));
-- posvenda_chamado_mover: rodar de novo a definição de supabase/migrations/20261124001700_posvenda_acoes.sql.
-- core_sem_ofertas_pelo_botao: trocar de volta regexp_replace(v_texto, '\{\{\s*nome\s*\}\}', ..., 'gi') por replace(v_texto, '{{nome}}', ...).
drop function if exists public.posvenda_rotina_diaria(timestamptz);
drop function if exists public.posvenda_rotina_loja(bigint, bigint, timestamptz);
drop function if exists public.posvenda_chamado_visivel(bigint, bigint, uuid);
drop function if exists public.posvenda_status_pausa(bigint, bigint, text);
drop function if exists public.posvenda_horas_entre(bigint, bigint, timestamptz, timestamptz);
-- A tabela posvenda_rotina_execucoes e a coluna posvenda_chamados.sla_pausado_desde ficam (histórico; sem uso sem as funções).

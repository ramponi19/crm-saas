-- =====================================================================================
-- 1.2 (sincronização, roda ANTES do deploy): o ZapIntel passa a ser o módulo 'inteligencia'
-- de empresa_modulos (origem addon), como o core v1 desenhou. Até aqui era a tabela à parte
-- complementos_empresa (zapintel_ativo), e o corte (20/10) copiou só as empresas LIGADAS.
--
-- Esta migração copia o estado de TODAS as empresas (ligada e desligada), troca a trava do
-- banco (zapintel_escopo, por onde passam todas as RPCs e rotas do ZapIntel) e o job do pg_cron
-- 'zapintel-conversa-aquecer'. Não apaga nada. O DROP vem em 20261022000200, depois do deploy.
-- =====================================================================================

insert into public.empresa_modulos (empresa_id, modulo, origem, instalado_em, ativo)
select c.empresa_id, 'inteligencia', 'addon', c.criado_em, c.zapintel_ativo
  from public.complementos_empresa c
on conflict (empresa_id, modulo) do update set ativo = excluded.ativo, updated_at = now();

-- A trava: troca exatamente a linha que lia complementos_empresa.
do $$
declare
  v_def  text := pg_get_functiondef('public.zapintel_escopo(bigint, bigint)'::regprocedure);
  v_de   text := 'select 1 from complementos_empresa where empresa_id = v_emp and zapintel_ativo';
  v_para text := 'select 1 from empresa_modulos where empresa_id = v_emp and modulo = ''inteligencia'' and ativo';
begin
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'zapintel_escopo: esperava 1 leitura de complementos_empresa';
  end if;
  execute replace(v_def, v_de, v_para);
end $$;

-- O job da madrugada aquece o cálculo de conversa das empresas com o ZapIntel ligado.
do $$
declare v_job bigint;
begin
  if to_regprocedure('cron.alter_job(bigint, text, text, text, text, boolean)') is null then
    raise notice 'sem pg_cron (cópia local): job não alterado';
    return;
  end if;
  select jobid into v_job from cron.job where jobname = 'zapintel-conversa-aquecer';
  if v_job is null then raise notice 'job zapintel-conversa-aquecer não existe'; return; end if;
  perform cron.alter_job(v_job, command :=
    'select public.zapintel_conversa_aquecer(m.empresa_id) from public.empresa_modulos m where m.modulo = ''inteligencia'' and m.ativo');
end $$;

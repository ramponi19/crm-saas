-- VOLTA da M3 (20261123000600_corrigir_data_venda): tira a RPC e devolve o gatilho da M1 sem a exceção 3.
-- Antes: o app que chama corrigir_data_venda (botão "Corrigir data da venda") precisa ter voltado.
-- As linhas 'data_venda_corrigida' do histórico e as datas já corrigidas ficam (nada é desfeito nos dados).
drop function if exists public.corrigir_data_venda(bigint, date, text);

create or replace function public.core_negocio_ganho_protegido()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Entrar no ganho sem data: a data é agora (a Edge usa ganho_em para a janela de pós-venda).
  if new.status = 'ganho' and new.ganho_em is null and (tg_op = 'INSERT' or old.status is distinct from 'ganho') then
    new.ganho_em := now();
  end if;
  if tg_op = 'INSERT' or old.status is distinct from 'ganho' then return new; end if;

  -- Daqui em diante o negócio JÁ ERA ganho.
  if new.status = 'ganho' and (old.ganho_em is null or new.ganho_em is not distinct from old.ganho_em) then
    return new;  -- continua ganho, com a mesma data (ou preenchendo a que faltava)
  end if;

  -- Exceção 1: a RPC reabrir_negocio marcou ESTA transação com ESTE negócio.
  if coalesce(current_setting('nexus.reabrir_negocio', true), '') = old.id::text then
    return new;
  end if;

  -- Exceção 2: a junção de negócios (chave de serviço) arquiva o que sai e leva o fechamento para
  -- o histórico do que fica — o ganho não some, muda de negócio.
  if current_user = 'service_role'
     and new.dados ? '_juntado'
     and coalesce(new.dados -> '_lead' ->> 'ativo', 'true') = 'false' then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'GANHO_PROTEGIDO: o negócio ' || old.id || ' é uma venda fechada e não pode sair do ganho nem ter a data do ganho alterada.',
    hint = 'Use reabrir_negocio(negocio_id, motivo) — só dono ou administrador.';
end $function$;
revoke all on function public.core_negocio_ganho_protegido() from public, anon, authenticated;

-- conferência: o corpo voltou a ser o da M1
do $c$ begin
  if md5((select prosrc from pg_proc where oid = 'public.core_negocio_ganho_protegido()'::regprocedure)) <> '6d9c6eeb9cb543356ad91b4f4327ffc4' then
    raise exception 'volta M3: o gatilho não voltou ao corpo da M1';
  end if;
end $c$;

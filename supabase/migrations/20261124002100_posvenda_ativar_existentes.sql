-- ENTREGA C, ETAPA C6 — ATIVAÇÃO SOBRE AS VENDAS QUE JÁ EXISTEM (Lucas, 24/11/2026). Universal.
--
-- Ao ligar o módulo numa empresa que já vende, as vendas antigas entram na régua: para cada ganho cujo passo mais
-- longo das réguas ativas ainda não passou, em ordem de data (a recompra cancela os passos "do produto" da compra
-- anterior na ordem certa), chama a mesma posvenda_iniciar_jornadas do gatilho do ganho. Por isso:
--   - só passos FUTUROS nascem (o que já passou não entra), com o responsável da D9, o teto diário e o horário da loja;
--   - é idempotente: venda que já tem jornada é pulada (rodar de novo não duplica);
--   - exige o módulo ligado e ao menos uma régua ativa (senão não faz nada e diz por quê).
-- Só o servidor chama (service_role). Devolve o resumo: vendas lidas, jornadas e passos criados, por passo e por mês.
--
-- Volta: supabase/scripts/volta/volta-posvenda-ativar-existentes.sql
-- Teste: supabase/scripts/testes/teste-posvenda-ativar-existentes.sql

create or replace function public.posvenda_ativar_existentes(p_empresa bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_max int; v_hoje date; r record; v_lidas int := 0; v_jor int := 0; v_antes bigint; v_ini timestamptz := clock_timestamp();
begin
  if not public.core_modulo_ligado(p_empresa, 'posvenda') then
    return jsonb_build_object('feito', false, 'motivo', 'o módulo Pós-venda não está ligado nesta empresa');
  end if;
  select max(pp.dia_offset) into v_max
    from public.posvenda_cadencia_passos pp join public.posvenda_cadencias c on c.id = pp.cadencia_id
   where c.empresa_id = p_empresa and c.ativo and pp.ativo;
  if v_max is null then
    return jsonb_build_object('feito', false, 'motivo', 'nenhuma régua ativa com passos');
  end if;
  v_hoje := public.posvenda_dia_local(p_empresa, now());
  select count(*) into v_antes from public.posvenda_acompanhamentos where empresa_id = p_empresa;

  for r in
    select n.id from public.negocios n
     where n.empresa_id = p_empresa and n.status = 'ganho' and n.ganho_em is not null
       and public.posvenda_dia_local(p_empresa, n.ganho_em) + v_max >= v_hoje
       and not exists (select 1 from public.posvenda_jornadas j where j.negocio_id = n.id and j.status in ('ativa', 'pausada'))
     order by n.ganho_em, n.id
  loop
    v_lidas := v_lidas + 1;
    if public.posvenda_iniciar_jornadas(r.id) is not null then v_jor := v_jor + 1; end if;
  end loop;

  return jsonb_build_object(
    'feito', true, 'vendas_lidas', v_lidas, 'jornadas_criadas', v_jor,
    'passos_criados', (select count(*) from public.posvenda_acompanhamentos where empresa_id = p_empresa) - v_antes,
    'segundos', round(extract(epoch from clock_timestamp() - v_ini)::numeric, 1));
end $$;

revoke all on function public.posvenda_ativar_existentes(bigint) from public, anon, authenticated;
grant execute on function public.posvenda_ativar_existentes(bigint) to service_role;

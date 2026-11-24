-- Teste da M3 (corrigir_data_venda + exceção 3 no gatilho da M1). Roda em produção SEM deixar rastro:
-- termina com RAISE (a transação inteira é desfeita). Antes da migração aplicada, rodar na MESMA chamada:
-- [corpo de 20261123000600_corrigir_data_venda.sql] + este arquivo (a parte "volta" no fim confere o arquivo de volta).
-- Empresa 5 (Nexus Demonstração): dono f47a8e4f…, admin 96867cc0…, funil 10 (73 novo, 76 convertido), loja 1.
-- Empresa 1 (JM): vendedora f4ec6a87…, negócio ganho 426.
create temp table _r (k text primary key, v jsonb) on commit drop;
create temp table _h (negocio bigint) on commit drop;

do $teste$
declare
  v_dono5 constant text := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_adm5  constant text := '96867cc0-8331-4c79-be63-09a313b35ea0';
  v_vend1 constant text := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  c bigint; a bigint; b bigint; ab bigint; r jsonb; e text; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  g426 timestamptz := (select ganho_em from negocios where id = 426);
  procedure_ok boolean;
begin
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M3 corrigir data') returning id into c;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, created_at, dados)
  values (5, 1, c, 10, 76, 'ganho', '2026-11-20 15:00-03', '2026-10-01 10:00-03', '{"_lead":{"ativo":true}}') returning id into a;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, c, 10, 76, 'ganho', '2026-11-10 12:00-03', '{"_lead":{"ativo":true}}') returning id into b;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, c, 10, 73, 'aberto', '{"_lead":{"ativo":true}}') returning id into ab;

  -- 1. dono corrige com motivo: continua ganho, mesma etapa, data nova ao meio-dia, histórico completo
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);
  r := corrigir_data_venda(a, '2026-10-15', 'venda foi em 15/10 pelo pedido do grupo');
  insert into _r values ('t1_retorno', r - 'negocio_id');
  insert into _r select 't1_negocio', jsonb_build_object('status', status, 'etapa', etapa_id, 'ganho_em', ganho_em,
      'meio_dia_sp', ganho_em = timestamptz '2026-10-15 12:00 America/Sao_Paulo') from negocios where id = a;
  insert into _r select 't1_historico', jsonb_build_object('acao', acao, 'por_usuario', por_usuario, 'detalhe', detalhe - 'ganho_em_novo' - 'ganho_em_anterior')
    from negocio_historico where negocio_id = a and acao = 'data_venda_corrigida';
  insert into _r values ('t1_marca_limpa_depois', to_jsonb(coalesce(current_setting('nexus.corrigir_data_venda', true), '')));

  -- 1b. administrador também pode
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm5, 'role', 'authenticated')::text, true);
  r := corrigir_data_venda(b, '2026-11-05', 'registrado com atraso pela equipe');
  insert into _r select 't1b_admin', jsonb_build_object('status', status, 'ganho_em', ganho_em) from negocios where id = b;

  -- 2. sem motivo
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);
  begin perform corrigir_data_venda(a, '2026-10-16', null); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t2_motivo_nulo', to_jsonb(e));
  begin perform corrigir_data_venda(a, '2026-10-16', '   '); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t2_motivo_vazio', to_jsonb(e));
  begin perform corrigir_data_venda(a, '2026-10-16', 'abc'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t2_motivo_curto', to_jsonb(e));

  -- 3. vendedora (JM, no negócio da própria JM) e dono da 5 em negócio de outra empresa
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vend1, 'role', 'authenticated')::text, true);
  begin perform corrigir_data_venda(426, '2026-07-30', 'tentativa da vendedora'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t3_vendedora', to_jsonb(e));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);
  begin perform corrigir_data_venda(426, '2026-07-30', 'tentativa de outra empresa'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t3_outra_empresa', to_jsonb(e));
  insert into _r values ('t3_426_intacto', to_jsonb((select ganho_em from negocios where id = 426) = g426));

  -- 4. negócio que não está ganho
  begin perform corrigir_data_venda(ab, '2026-10-16', 'não é venda ainda'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t4_aberto', to_jsonb(e));

  -- 5. datas: futura, nula, antes de 2024, igual; antiga mas válida (avisos); hoje (instante atual)
  begin perform corrigir_data_venda(a, v_hoje + 1, 'data no futuro'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t5_futura', to_jsonb(e));
  begin perform corrigir_data_venda(a, null, 'sem data nenhuma'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t5_nula', to_jsonb(e));
  begin perform corrigir_data_venda(a, '2023-12-31', 'antes de dois mil e vinte e quatro'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t5_antes_2024', to_jsonb(e));
  begin perform corrigir_data_venda(a, '2026-10-15', 'mesma data de agora'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t5_igual', to_jsonb(e));
  r := corrigir_data_venda(a, '2024-01-02', 'venda antiga, antes do Nexus');
  insert into _r values ('t5_antiga_com_avisos', r -> 'avisos');
  r := corrigir_data_venda(b, v_hoje, 'a venda foi hoje mesmo');
  insert into _r values ('t5_hoje_instante_atual', to_jsonb((select ganho_em = now() from negocios where id = b)));

  -- 6. a exceção do gatilho vale SÓ para o negócio marcado, e só para a data
  perform set_config('nexus.corrigir_data_venda', a::text, true);
  begin update negocios set ganho_em = '2026-09-01 12:00-03' where id = b; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t6_outro_negocio_mesma_transacao', to_jsonb(e));
  begin update negocios set status = 'aberto', ganho_em = '2026-09-01 12:00-03' where id = a; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t6_status_junto', to_jsonb(e));
  begin update negocios set status = 'perdido' where id = a; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t6_so_status', to_jsonb(e));
  begin update negocios set etapa_id = 73, ganho_em = '2026-09-01 12:00-03' where id = a; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t6_etapa_junto', to_jsonb(e));
  begin update negocios set ganho_em = null where id = a; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t6_zerar_data', to_jsonb(e));
  perform set_config('nexus.corrigir_data_venda', '', true);
  insert into _r select 't6_a_intacto', jsonb_build_object('status', status, 'etapa', etapa_id, 'data', (ganho_em at time zone 'America/Sao_Paulo')::date) from negocios where id = a;

  -- 7. UPDATE direto da data, sem a marca: barrado
  begin update negocios set ganho_em = '2026-09-01 12:00-03' where id = a; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  insert into _r values ('t7_update_direto', to_jsonb(e));

  -- 8. permissões
  insert into _r values ('t8_permissoes', jsonb_build_object(
    'anon', has_function_privilege('anon', 'public.corrigir_data_venda(bigint,date,text)', 'execute'),
    'authenticated', has_function_privilege('authenticated', 'public.corrigir_data_venda(bigint,date,text)', 'execute'),
    'gatilho_authenticated', has_function_privilege('authenticated', 'public.core_negocio_ganho_protegido()', 'execute')));

  -- 9. o que a M1 já fazia continua igual: reabrir com motivo; entrar no ganho preenche a data
  r := reabrir_negocio(b, 'regressão da M1 no teste da M3');
  insert into _r select 't9_reabrir', jsonb_build_object('status', status, 'ganho_em', ganho_em) from negocios where id = b;
  update negocios set status = 'ganho', etapa_id = 76 where id = ab;
  insert into _r select 't9_entrar_no_ganho', jsonb_build_object('status', status, 'ganho_em_preenchido', ganho_em is not null) from negocios where id = ab;

  -- 10. o gancho do pós-venda (M6): sem a função, nada; com ela, é chamada com o negócio
  insert into _r values ('t10_sem_funcao', to_jsonb(to_regprocedure('public.posvenda_reancorar_jornada(bigint)') is null));
  execute 'create function public.posvenda_reancorar_jornada(p bigint) returns void language sql as $f$ insert into pg_temp._h values (p) $f$';
  r := corrigir_data_venda(a, '2026-10-20', 'teste do gancho do pós-venda');
  insert into _r values ('t10_gancho_chamado', to_jsonb((select array_agg(negocio) from _h) = array[a]));
  execute 'drop function public.posvenda_reancorar_jornada(bigint)';
end $teste$;

-- 11. volta: o arquivo de volta tira a RPC e devolve o gatilho ao corpo da M1 (o próprio arquivo confere o md5)
-- [corpo de supabase/scripts/volta/volta-corrigir-data-venda.sql entra aqui]

do $fim$ begin
  insert into _r values ('t11_volta', jsonb_build_object(
    'rpc_existe', to_regprocedure('public.corrigir_data_venda(bigint,date,text)') is not null,
    'gatilho_md5_m1', md5((select prosrc from pg_proc where oid = 'public.core_negocio_ganho_protegido()'::regprocedure)) = '6d9c6eeb9cb543356ad91b4f4327ffc4'));
  raise exception 'RESULTADO_TESTE_M3 %', (select jsonb_object_agg(k, v) from _r)::text;
end $fim$;

-- Teste da 20261124000900_venda_exigida. Empresa 5 (admin 96867cc0…, vendedor 0e5e…0001). Termina com RAISE.
-- Cada caso roda numa subtransação desfeita (pg_temp.tenta), com o papel e a marca pedidos:
--   'ok' = gravou (1 linha ou mais); 'zero_linhas' = a RLS não deixou ver; senão, o código do erro.
-- O runner liga a marca nexus.venda_excecao para a sessão toda (PGOPTIONS); aqui ela é desligada.

create function pg_temp.tenta(p_sql text, p_papel text, p_uid uuid default null, p_marca text default '', p_cab text default '')
returns text language plpgsql as $f$
declare v_n bigint;
begin
  begin
    perform set_config('nexus.venda_excecao', coalesce(p_marca, ''), true);
    perform set_config('request.headers', coalesce(p_cab, ''), true);
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_papel)::text end, true);
    if p_papel <> 'postgres' then execute format('set local role %I', p_papel); end if;
    execute p_sql;
    get diagnostics v_n = row_count;
    raise exception 'DESFAZ %', v_n;
  exception when others then
    if sqlerrm like 'DESFAZ %' then return case when split_part(sqlerrm, ' ', 2)::bigint > 0 then 'ok' else 'zero_linhas' end; end if;
    return split_part(sqlerrm, ':', 1);
  end;
end $f$;

do $t$
declare
  res jsonb := '{}';
  ADM uuid := '96867cc0-8331-4c79-be63-09a313b35ea0';
  VEN uuid := '0e5e0000-0000-4000-8000-000000000001';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  venda text;
  cab_juncao text := '{"x-nexus-venda-excecao":"juncao"}';
  ct bigint; nA bigint; nV bigint; nG bigint;
begin
  perform set_config('nexus.venda_excecao', '', true);
  venda := format('jsonb_build_object(''venda'', jsonb_build_object(''data'', %L, ''categoria_id'', 10, ''condicao'', ''novo'', ''valor'', 4590))', hoje::text);

  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'Venda exigida teste') returning id into ct;
  -- nA: aberto; nV: ganho com venda; nG: ganho antigo sem venda (criado com a marca, como script)
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, ct, 10, 73, 'aberto', '{"_lead":{"ativo":true}}') returning id into nA;
  execute format('insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
                  values (5, 1, %s, 10, 76, ''ganho'', now(), jsonb_build_object(''_lead'', jsonb_build_object(''ativo'', true)) || %s) returning id', ct, venda)
    into nV;
  perform set_config('nexus.venda_excecao', 'semente do teste', true);
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, ct, 10, 76, 'ganho', now() - interval '200 days', '{"_lead":{"ativo":true}}') returning id into nG;
  perform set_config('nexus.venda_excecao', '', true);

  -- ── PASSA ──
  res := res || jsonb_build_object('passa', jsonb_build_object(
    'p1_sessao_admin_entra_com_venda', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76, dados = dados || %s where id = %s', venda, nA), 'authenticated', ADM),
    'p2_sessao_vendedor_entra_com_venda', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76, dados = dados || %s where id = %s', venda, nA), 'authenticated', VEN),
    'p3_servidor_com_cabecalho_juncao', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'service_role', null, '', cab_juncao),
    'p4_script_com_marca', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'postgres', null, 'triagem dos 38'),
    'p5_servidor_com_marca_sql', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'service_role', null, 'pdv'),
    'p6_rpc_corrigir_data_muda_venda', pg_temp.tenta(format('select corrigir_data_venda(%s, %L::date, ''teste: venda foi antes'')', nV, hoje - 3), 'authenticated', ADM),
    'p7_rpc_reabrir_tira_venda', pg_temp.tenta(format('select reabrir_negocio(%s, ''teste: cliente devolveu'')', nV), 'authenticated', ADM),
    'p8_sessao_edita_outra_chave', pg_temp.tenta(format('update negocios set dados = dados || ''{"produto_interessado":"iPhone 17"}'' where id = %s', nV), 'authenticated', ADM),
    'p9_sessao_regrava_ganho_igual', pg_temp.tenta(format('update negocios set status = ''ganho'', dados = dados where id = %s', nV), 'authenticated', VEN),
    'p10_ganho_antigo_sessao_edita_lead', pg_temp.tenta(format('update negocios set dados = jsonb_set(dados, ''{_lead,tratativa}'', ''true'') where id = %s', nG), 'authenticated', ADM),
    'p11_servidor_classifica_ganho_antigo', pg_temp.tenta(format('update negocios set dados = dados || %s where id = %s', venda, nG), 'service_role'),
    'p12_sessao_aberto_sem_venda_outra_etapa', pg_temp.tenta(format('update negocios set etapa_id = 74, dados = jsonb_set(dados, ''{_lead,tratativa}'', ''true'') where id = %s', nA), 'authenticated', VEN)
  ));

  -- ── BARRADO ──
  res := res || jsonb_build_object('barrado', jsonb_build_object(
    'b1_sessao_entra_sem_venda', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'authenticated', ADM),
    'b2_sessao_vendedor_entra_sem_venda', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'authenticated', VEN),
    'b3_sessao_insere_ganho_sem_venda', pg_temp.tenta(format('insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values (5, 1, %s, 10, 76, ''ganho'', ''{}'')', ct), 'authenticated', ADM),
    'b4_servidor_sem_marca', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'service_role'),
    'b5_script_sem_marca', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'postgres'),
    'b6_sessao_forja_cabecalho', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'authenticated', ADM, '', cab_juncao),
    'b7_sessao_forja_marca_sql', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'authenticated', ADM, 'eu mesmo'),
    'b8_servidor_cabecalho_vazio', pg_temp.tenta(format('update negocios set status = ''ganho'', etapa_id = 76 where id = %s', nA), 'service_role', null, '', '{"x-nexus-venda-excecao":"  "}'),
    'b9_sessao_muda_valor_da_venda', pg_temp.tenta(format('update negocios set dados = jsonb_set(dados, ''{venda,valor}'', ''1'') where id = %s', nV), 'authenticated', ADM),
    'b10_vendedor_muda_categoria', pg_temp.tenta(format('update negocios set dados = jsonb_set(dados, ''{venda,categoria_id}'', ''16'') where id = %s', nV), 'authenticated', VEN),
    'b11_sessao_apaga_a_venda', pg_temp.tenta(format('update negocios set dados = dados - ''venda'' where id = %s', nV), 'authenticated', ADM),
    'b12_sessao_cria_venda_em_ganho_antigo', pg_temp.tenta(format('update negocios set dados = dados || %s where id = %s', venda, nG), 'authenticated', ADM),
    'b13_sessao_poe_venda_em_aberto', pg_temp.tenta(format('update negocios set dados = dados || %s where id = %s', venda, nA), 'authenticated', VEN)
  ));

  -- Nada do que foi barrado ficou gravado (cada caso foi desfeito; o estado é o da montagem)
  res := res || jsonb_build_object('estado_final', jsonb_build_object(
    'nA', (select status from negocios where id = nA), 'nV_valor', (select dados -> 'venda' ->> 'valor' from negocios where id = nV),
    'nG_tem_venda', (select dados ? 'venda' from negocios where id = nG)));

  raise exception 'RESULTADO_TESTE_VENDA_EXIGIDA %', res::text;
end $t$;

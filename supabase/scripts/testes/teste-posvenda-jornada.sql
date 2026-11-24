-- Teste da 20261124000400_posvenda_jornada (C3): os casos pedidos pelo Lucas em 24/11/2026.
-- Banco local descartável, JM de teste (empresa 1, loja 3, vendedor M1 …0101, admin A …0201). Termina com RAISE.
-- Réguas de teste: Aparelhos (categorias 1-4, prioridade 100): D+1 whatsapp, D+7 pesquisa, D+90 whatsapp (só
-- seminovo; do aparelho), D+330 ligação (ciclo de troca; do aparelho). Os demais são de relacionamento. Acessórios (6, prioridade 50): D+1 whatsapp, D+30 whatsapp.
-- Geral (sem categorias): D+7 pesquisa, D+330 ligação (ciclo de troca).

-- A venda como a rota grava: negócio aberto → ganho com dados.venda e ganho_em (o gatilho age no UPDATE).
create function pg_temp.vender(p_contato bigint, p_resp uuid, p_quando timestamptz, p_cat int, p_cond text) returns bigint
language plpgsql as $f$
declare v bigint;
begin
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
  values (1, 3, p_contato, 1, 18, 'aberto', p_resp, '{"_lead":{"ativo":true}}') returning id into v;
  update negocios set status = 'ganho', etapa_id = 15, ganho_em = p_quando,
         dados = dados || case when p_cat is null then '{}'::jsonb
                               else jsonb_build_object('venda', jsonb_build_object('data', to_char(p_quando at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
                                      'categoria_id', p_cat, 'condicao', p_cond, 'valor', 1000)) end
   where id = v;
  return v;
end $f$;
-- Os passos de uma venda: {dia_offset: status}
create function pg_temp.passos(p_neg bigint) returns jsonb language sql as $f$
  select coalesce(jsonb_object_agg(pp.dia_offset::text, a.status order by pp.dia_offset), '{}')
    from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id
    join posvenda_jornadas j on j.id = a.jornada_id where j.negocio_id = p_neg and j.status = 'ativa'
$f$;

do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  hoje date := posvenda_dia_local(1, now());
  meio_dia timestamptz;
  c_ap bigint; c_ac bigint; c_ge bigint; p bigint;
  ct bigint; ct2 bigint; n bigint; n2 bigint; n3 bigint; v jsonb; x int;
begin
  meio_dia := (hoje + time '12:00') at time zone 'America/Sao_Paulo';
  insert into posvenda_cadencias (empresa_id, nome, prioridade, filtros) values (1, 'Aparelhos', 100, '{"categorias":[1,2,3,4]}') returning id into c_ap;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, filtros, grupo) values
    (1, c_ap, 1, 1, 'whatsapp', 'D+1 chegou bem?', '{}', 'relacionamento'), (1, c_ap, 2, 7, 'pesquisa', 'D+7 NPS', '{}', 'relacionamento'),
    (1, c_ap, 3, 90, 'whatsapp', 'D+90 bateria', '{"condicao":"seminovo"}', 'aparelho'), (1, c_ap, 4, 330, 'ligacao', 'D+330 troca', '{}', 'aparelho');
  insert into posvenda_cadencias (empresa_id, nome, prioridade, filtros) values (1, 'Acessórios', 50, '{"categorias":[6]}') returning id into c_ac;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values
    (1, c_ac, 1, 1, 'whatsapp', 'D+1 acessório'), (1, c_ac, 2, 30, 'whatsapp', 'D+30 acessório');
  insert into posvenda_cadencias (empresa_id, nome, prioridade, filtros) values (1, 'Geral', 0, '{}') returning id into c_ge;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, grupo) values
    (1, c_ge, 1, 7, 'pesquisa', 'D+7 NPS geral', 'relacionamento'), (1, c_ge, 2, 330, 'ligacao', 'D+330 geral', 'aparelho');

  -- 1. módulo desligado: nada acontece
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 1') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 1, 'novo');
  res := res || jsonb_build_object('1_modulo_desligado_jornadas', (select count(*) from posvenda_jornadas where negocio_id = n));
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);

  -- 2. módulo ligado: régua pela categoria e condição; sem dados.venda → Geral; passos do ganho_em; responsável da C2
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 2a') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 1, 'seminovo');
  res := res || jsonb_build_object('2a_iphone_seminovo', jsonb_build_object(
    'regua', (select c.nome from posvenda_jornadas j join posvenda_cadencias c on c.id = j.cadencia_id where j.negocio_id = n),
    'passos', pg_temp.passos(n),
    'responsaveis', (select jsonb_agg(distinct case when a.responsavel_id = M1 then 'M1' else a.responsavel_id::text end) from posvenda_acompanhamentos a join posvenda_jornadas j on j.id = a.jornada_id where j.negocio_id = n),
    'origens', (select jsonb_agg(distinct a.origem_responsavel) from posvenda_acompanhamentos a join posvenda_jornadas j on j.id = a.jornada_id where j.negocio_id = n),
    'datas_do_ganho', (select bool_and(posvenda_dia_local(1, a.previsto_para) = hoje + pp.dia_offset) from posvenda_acompanhamentos a
                         join posvenda_cadencia_passos pp on pp.id = a.passo_id join posvenda_jornadas j on j.id = a.jornada_id where j.negocio_id = n)));
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 2b') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 1, 'novo');
  res := res || jsonb_build_object('2b_iphone_novo', pg_temp.passos(n));
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 2c') returning id into ct;
  n := pg_temp.vender(ct, null, meio_dia, null, null);
  res := res || jsonb_build_object('2c_sem_dados_venda', jsonb_build_object(
    'regua', (select c.nome from posvenda_jornadas j join posvenda_cadencias c on c.id = j.cadencia_id where j.negocio_id = n),
    'passos', pg_temp.passos(n),
    'origens', (select jsonb_agg(distinct a.origem_responsavel) from posvenda_acompanhamentos a join posvenda_jornadas j on j.id = a.jornada_id where j.negocio_id = n)));
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 2d') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 7, 'novo');   -- perfume: categoria sem régua própria
  res := res || jsonb_build_object('2d_categoria_sem_regua', (select c.nome from posvenda_jornadas j join posvenda_cadencias c on c.id = j.cadencia_id where j.negocio_id = n));

  -- 3. reabrir: pendentes cancelados com motivo; o feito fica.  7. ganho de novo: jornada nova, sem duplicar
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 3') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 1, 'novo');
  update posvenda_acompanhamentos a set status = 'feito', feito_em = now() from posvenda_cadencia_passos pp
   where pp.id = a.passo_id and pp.dia_offset = 1 and a.negocio_id = n;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform reabrir_negocio(n, 'teste da C3: cliente desistiu');
  execute 'reset role';
  res := res || jsonb_build_object('3_reabrir', jsonb_build_object(
    'passos', (select jsonb_object_agg(pp.dia_offset::text, a.status || coalesce(':' || a.motivo, '')) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n),
    'jornada', (select status || ':' || motivo_fim from posvenda_jornadas where negocio_id = n)));
  -- desde a C4 a reabertura tira dados.venda do negócio: o ganho de novo traz a venda nova, como a rota faz
  update negocios set status = 'ganho', etapa_id = 15, ganho_em = meio_dia,
         dados = dados || jsonb_build_object('venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1000))
   where id = n;
  res := res || jsonb_build_object('7_ganho_de_novo', jsonb_build_object(
    'jornadas', (select jsonb_agg(status order by id) from posvenda_jornadas where negocio_id = n),
    'pendentes_novos', pg_temp.passos(n),
    'total_de_passos', (select count(*) from posvenda_acompanhamentos where negocio_id = n)));

  -- 4. corrigir a data da venda: pendentes reancorados; o que cairia no passado vira pulado
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 4') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia, 1, 'seminovo');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform corrigir_data_venda(n, hoje - 20, 'teste da C3: venda foi antes');
  execute 'reset role';
  res := res || jsonb_build_object('4_corrigir_data', jsonb_build_object(
    'passos', (select jsonb_object_agg(pp.dia_offset::text, a.status || coalesce(':' || a.motivo, '')) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n),
    'pendentes_na_data_nova', (select bool_and(posvenda_dia_local(1, a.previsto_para) = (hoje - 20) + pp.dia_offset) from posvenda_acompanhamentos a
                                 join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n and a.status = 'pendente'),
    'atrasados', (select count(*) from posvenda_acompanhamentos where negocio_id = n and status = 'pendente' and posvenda_dia_local(1, previsto_para) < hoje)));

  -- 5. recompra: mesma categoria cancela os passos DO APARELHO da jornada anterior (D+90, D+330); outra categoria não cancela nada
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 5') returning id into ct;
  n := pg_temp.vender(ct, M1, meio_dia - interval '60 days', 1, 'seminovo');   -- D+90 e D+330 ainda pela frente
  n2 := pg_temp.vender(ct, M1, meio_dia, 2, 'novo');                           -- iPad: OUTRA categoria (2)
  res := res || jsonb_build_object('5a_outra_categoria_aparelho', jsonb_build_object('anterior', pg_temp.passos(n)));
  n3 := pg_temp.vender(ct, M1, meio_dia, 1, 'novo');                           -- iPhone de novo: MESMA categoria (1)
  res := res || jsonb_build_object('5b_mesma_categoria', jsonb_build_object(
    'anterior', (select jsonb_object_agg(pp.dia_offset::text, a.status || coalesce(':' || a.motivo, '')) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n),
    'ipad_intacto', pg_temp.passos(n2)));
  perform pg_temp.vender(ct, M1, meio_dia, 6, 'novo');                         -- acessório depois do iPhone
  res := res || jsonb_build_object('5c_acessorio_nao_cancela', jsonb_build_object(
    'iphone_novo', pg_temp.passos(n3),
    'cancelados_por_recompra', (select count(*) from posvenda_acompanhamentos a join posvenda_jornadas j on j.id = a.jornada_id where j.contato_id = ct and a.motivo = 'recompra')));

  -- 6. duas vendas no mesmo dia (iPhone + capa): uma jornada por venda, o D+1 não duplica
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C3 caso 6') returning id into ct2;
  n := pg_temp.vender(ct2, M1, meio_dia, 1, 'novo');
  n2 := pg_temp.vender(ct2, M1, meio_dia, 6, 'novo');
  res := res || jsonb_build_object('6_mesmo_dia', jsonb_build_object(
    'jornadas', (select count(*) from posvenda_jornadas where contato_id = ct2),
    'd1_pendentes_do_cliente', (select count(*) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id
                                 where a.contato_id = ct2 and pp.dia_offset = 1 and a.status = 'pendente'),
    'capa', pg_temp.passos(n2),
    'capa_d1_aponta_para_o_do_iphone', (select a.juntado_a = (select a2.id from posvenda_acompanhamentos a2 join posvenda_cadencia_passos p2 on p2.id = a2.passo_id where a2.negocio_id = n and p2.dia_offset = 1)
                                          from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n2 and pp.dia_offset = 1)));

  -- 6b. reabrir o iPhone: o D+1 dele é cancelado e o da capa, que estava juntado, volta para a fila
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform reabrir_negocio(n, 'teste da C3: iPhone devolvido');
  execute 'reset role';
  res := res || jsonb_build_object('6b_reabrir_o_iphone_promove_a_capa', jsonb_build_object(
    'capa', pg_temp.passos(n2),
    'd1_pendentes_do_cliente', (select count(*) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id
                                 where a.contato_id = ct2 and pp.dia_offset = 1 and a.status = 'pendente')));

  raise exception 'RESULTADO_TESTE_C3 %', res::text;
end $t$;

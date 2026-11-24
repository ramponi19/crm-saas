-- Teste da 20261124000300_posvenda_responsavel (C2): os 10 casos pedidos pelo Lucas em 24/11/2026.
-- Banco local descartável, JM de teste (empresa 1). Lojas: 3 = matriz, 6 = Jaguariúna.
--   Matriz: M1 (…0101), M2 (…0102), SL = vendedor sem loja (…0103, conta como matriz)
--   Jaguariúna: VJ (f4ec…, a vendedora) e J2 (…0104)
--   Administradores: A (…0201) e B (…0202). Dono (owner): a632… ("conta da empresa")
-- A ordem da roleta é a ordem dos UUIDs: matriz M1, M2, SL; Jaguariúna J2, VJ; administradores A, B.
-- Os nomes no resultado vêm da tabela _n. Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  SL uuid := '0e5e0000-0000-4000-8000-000000000103'; J2 uuid := '0e5e0000-0000-4000-8000-000000000104';
  VJ uuid := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  A uuid := '0e5e0000-0000-4000-8000-000000000201'; B uuid := '0e5e0000-0000-4000-8000-000000000202';
  DONO uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  hoje date := posvenda_dia_local(1, now());
  D date; D2 date;
  ct bigint; n1 bigint; n2 bigint; n3 bigint; n4 bigint; n5 bigint; n6 bigint;
  c_cad bigint; c_passo bigint; c_jor bigint; a1 bigint; a2 bigint; a3 bigint; ch bigint; st bigint;
  r record; lista jsonb; i int; v int;
begin
  create temp table _n (u uuid primary key, n text) on commit drop;
  insert into _n values (M1,'M1'),(M2,'M2'),(SL,'SL'),(J2,'J2'),(VJ,'VJ'),(A,'A'),(B,'B'),(DONO,'DONO');
  D := posvenda_proximo_dia_util(1, 3, hoje);         -- próximo dia útil (futuro)
  D2 := posvenda_proximo_dia_util(1, 3, D);
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true) on conflict (empresa_id, modulo) do update set ativo = true;
  insert into filiais (empresa_id, nome, matriz) values (1, 'Loja nova sem vendedor (teste)', false) returning id into i;

  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'TESTE C2') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n1;    -- vendedor M1
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n2;        -- sem vendedor, matriz
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, 6, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n3;        -- sem vendedor, Jaguariúna
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', A, '{"_lead":{"ativo":true}}') returning id into n4;     -- administrador como responsável
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M2, '{"_lead":{"ativo":true}}') returning id into n5;    -- vendedor M2
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, i, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n6;        -- loja sem vendedor
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua de teste C2') returning id into c_cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, c_cad, 1, 1, 'whatsapp', 'D+1') returning id into c_passo;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ct, n1, c_cad, now()) returning id into c_jor;

  -- 1. vendedor ativo do negócio
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n1, D);
  res := res || jsonb_build_object('1_vendedor_ativo', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem, 'mesmo_dia', r.dia = D));

  -- 2. responsável padrão da loja (opcional) preenchido: vale antes da roleta
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.responsavel_padrao', jsonb_build_object('empresa', null, 'lojas', jsonb_build_object('3', M2)));
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n2, D);
  res := res || jsonb_build_object('2_padrao_da_loja', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  delete from configuracoes_sistema where empresa_id = 1 and chave = 'posvenda.responsavel_padrao';

  -- 3. roleta da matriz (com o vendedor sem loja) e de Jaguariúna, cada uma com seu contador
  lista := '[]';
  for v in 1..4 loop select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n2, D); lista := lista || to_jsonb((select n from _n where u = r.responsavel_id)); end loop;
  res := res || jsonb_build_object('3a_roleta_matriz', lista, '3a_origem', r.origem);
  lista := '[]';
  for v in 1..3 loop select * into r from posvenda_resolver_responsavel(1, 6, 'acompanhamento', n3, D); lista := lista || to_jsonb((select n from _n where u = r.responsavel_id)); end loop;
  res := res || jsonb_build_object('3b_roleta_jaguariuna', lista,
    '3c_contadores', (select jsonb_object_agg(chave, (select n from _n where u = ultimo_usuario_id)) from posvenda_roleta where empresa_id = 1));

  -- 4. administrador como responsável do ganho → roleta da loja (não fica com ele)
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n4, D);
  res := res || jsonb_build_object('4_admin_responsavel_vai_para_roleta', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));

  -- 5. vendedor ausente: fora da roleta; passo dele que vence na ausência vai para a roleta; depois da volta fica
  update empresa_usuarios set ausente = true, ausente_em = now() where empresa_id = 1 and usuario_id = M1;
  lista := '[]';
  for v in 1..3 loop select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n2, D); lista := lista || to_jsonb((select n from _n where u = r.responsavel_id)); end loop;
  res := res || jsonb_build_object('5a_ausente_fora_da_roleta', lista);
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n1, hoje + 10);
  res := res || jsonb_build_object('5b_passo_depois_da_volta_fica', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n1, hoje);
  res := res || jsonb_build_object('5c_passo_vencendo_vai_para_roleta', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, c_jor, c_passo, ct, n1, M1, 'vendedor', (hoje + time '12:00') at time zone 'America/Sao_Paulo') returning id into a1;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, c_jor, c_passo, ct, n1, M1, 'vendedor', ((hoje + 10) + time '12:00') at time zone 'America/Sao_Paulo') returning id into a2;
  v := posvenda_reavaliar_vencendo(1);
  res := res || jsonb_build_object('5d_reavaliar_na_ausencia', jsonb_build_object(
    'movidos', v,
    'vencendo', (select jsonb_build_object('resp', (select n from _n where u = responsavel_id), 'origem', origem_responsavel, 'observacao', observacao like '%reatribuído%') from posvenda_acompanhamentos where id = a1),
    'depois_da_volta', (select (select n from _n where u = responsavel_id) from posvenda_acompanhamentos where id = a2)));
  update empresa_usuarios set ausente = false, ausente_em = null where empresa_id = 1 and usuario_id = M1;

  -- 6. teto diário (1 por dia, só neste teste)
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.teto_diario', '{"empresa": 1, "lojas": {}}');
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, c_jor, c_passo, ct, n5, M2, 'vendedor', (D + time '10:00') at time zone 'America/Sao_Paulo') returning id into a3;
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n5, D);
  res := res || jsonb_build_object('6a_cliente_proprio_dia_util_seguinte', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem, 'dia_util_seguinte', r.dia = D2));
  update posvenda_roleta set ultimo_usuario_id = M1 where empresa_id = 1 and chave = 'loja:3';   -- o próximo seria M2, que está cheio
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', n2, D);
  res := res || jsonb_build_object('6b_roleta_passa_ao_proximo', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem, 'mesmo_dia', r.dia = D));
  delete from configuracoes_sistema where empresa_id = 1 and chave = 'posvenda.teto_diario';

  -- 7. loja sem vendedor ativo e negócio sem loja → administradores
  select * into r from posvenda_resolver_responsavel(1, i, 'acompanhamento', n6, D);
  res := res || jsonb_build_object('7a_loja_sem_vendedor', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  select * into r from posvenda_resolver_responsavel(1, null, 'acompanhamento', n2, D);
  res := res || jsonb_build_object('7b_negocio_sem_loja', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));

  -- 8. NPS até 6 e chamados → roleta entre os administradores
  lista := '[]';
  for v in 1..3 loop select * into r from posvenda_resolver_responsavel(1, 3, 'administradores', n1, D); lista := lista || to_jsonb((select n from _n where u = r.responsavel_id)); end loop;
  res := res || jsonb_build_object('8_nps_e_chamados_roleta_admins', lista, '8_origem', r.origem);

  -- 9. desativar usuário → pendências redistribuídas (gatilho em empresa_usuarios, módulo ligado)
  insert into posvenda_chamado_status (empresa_id, nome, tipo) values (1, 'Aberto', 'aberto') returning id into st;
  insert into posvenda_chamados (empresa_id, filial_id, numero, contato_id, status_id, titulo, responsavel_id, origem_responsavel)
    values (1, 3, 1, ct, st, 'Chamado de teste', A, 'administradores') returning id into ch;
  update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = M2;
  res := res || jsonb_build_object('9a_vendedor_desligado', (select jsonb_build_object('resp', (select n from _n where u = responsavel_id), 'origem', origem_responsavel, 'observacao', observacao like '%reatribuído%') from posvenda_acompanhamentos where id = a3));
  update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = A;
  res := res || jsonb_build_object('9b_admin_desligado_chamado', jsonb_build_object(
    'resp', (select (select n from _n where u = responsavel_id) from posvenda_chamados where id = ch),
    'evento', (select count(*) from posvenda_chamado_eventos where chamado_id = ch and tipo = 'atribuicao')));

  -- 10. a conta owner só entra sem nenhum admin
  select * into r from posvenda_resolver_responsavel(1, 3, 'administradores', n1, D);
  res := res || jsonb_build_object('10a_com_um_admin', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = B;
  select * into r from posvenda_resolver_responsavel(1, 3, 'administradores', n1, D);
  res := res || jsonb_build_object('10b_sem_admin_cai_no_dono', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem),
    '10c_chamado_foi_para_o_dono', (select (select n from _n where u = responsavel_id) from posvenda_chamados where id = ch));

  raise exception 'RESULTADO_TESTE_C2 %', res::text;
end $t$;

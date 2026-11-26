-- Teste da 20261126000500_aviso_dono_e_contador_pendentes (P2 + contador da aba "Custo pendente").
-- Semente (empresa 1 = JM de teste, lojas 3 e 6): dono a632…; admins …0201 e …0202; vendedores …0101 e …0102.
-- Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; e text;
  v_dono1 constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  v_adm1  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  v_adm2  constant uuid := '0e5e0000-0000-4000-8000-000000000202';
  v_m1    constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  c_dono1 bigint; c_adm1 bigint; c_vend1 bigint; prod bigint; n int;
begin
  execute 'set constraints all immediate';
  select id into c_dono1 from empresa_cargos where empresa_id = 1 and sistema;
  select id into c_adm1  from empresa_cargos where empresa_id = 1 and nome = 'Administrador';
  select id into c_vend1 from empresa_cargos where empresa_id = 1 and nome = 'Vendedor';
  -- o admin A vira Dono (segundo Dono da empresa) — como script
  update empresa_usuarios set cargo_id = c_dono1 where empresa_id = 1 and usuario_id = v_adm1;

  -- 1. um Administrador não mexe em Dono (SO_DONO) e nenhum aviso nasce
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm2::text, 'role', 'authenticated')::text, true);
  begin perform usuario_cargo_trocar(v_adm1, c_adm1); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('1_admin_em_dono', e, '1_avisos', (select count(*) from usuario_avisos));

  -- 2. o Dono rebaixa o outro Dono → 1 aviso para o afetado, nenhum para quem mudou
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  perform usuario_cargo_trocar(v_adm1, c_adm1);
  r := r || jsonb_build_object('2_dono_rebaixa_dono', jsonb_build_object(
    'afetado', (select count(*) from usuario_avisos where usuario_id = v_adm1),
    'autor', (select count(*) from usuario_avisos where usuario_id = v_dono1),
    'aviso', (select jsonb_build_array(tipo, titulo, texto, empresa_id, lido_em is null, dados ? 'cargo_antes', dados ? 'por') from usuario_avisos where usuario_id = v_adm1),
    'auditoria', (select count(*) from auditoria_eventos where empresa_id = 1 and entidade = 'usuario' and entidade_id = v_adm1::text and acao = 'trocar_cargo')));

  -- 3. o Dono muda o cargo de quem NÃO era Dono → sem aviso
  perform usuario_cargo_trocar(v_m1, c_adm1);
  perform usuario_cargo_trocar(v_m1, c_vend1);
  r := r || jsonb_build_object('3_nao_dono_sem_aviso', (select count(*) from usuario_avisos where usuario_id = v_m1));

  -- 4. RLS: cada um vê só os seus; o afetado marca como lido; não muda o texto; ninguém cria aviso pela API
  execute 'set local role authenticated';
  r := r || jsonb_build_object('4_dono_ve', (select count(*) from usuario_avisos));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('4_afetado_ve', (select count(*) from usuario_avisos));
  update usuario_avisos set lido_em = now() where usuario_id = v_adm1;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('4_marcou_lido', n);
  begin update usuario_avisos set titulo = 'x' where usuario_id = v_adm1; e := 'passou'; exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('4_mudar_texto', e);
  begin insert into usuario_avisos (empresa_id, usuario_id, tipo, titulo) values (1, v_adm1, 'x', 'x'); e := 'passou'; exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('4_criar_pela_api', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('4_outro_ve', (select count(*) from usuario_avisos));
  execute 'reset role';

  -- 5. contador da aba: 3 pendentes em 2 lojas → total 3 (antes: 2, o número de lojas)
  perform set_config('request.jwt.claims', '', true);
  insert into estoque_produtos (empresa_id, nome) values (1, 'Contador teste') returning id into prod;
  insert into estoque_unidades (empresa_id, filial_id, produto_id, status) values (1, 3, prod, 'disponivel'), (1, 3, prod, 'disponivel'), (1, 6, prod, 'disponivel');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('5_resumo', estoque_custos_pendentes_resumo(),
                               '5_lista', (select count(*) from estoque_custos_pendentes(null)));
  raise exception 'RESULTADO_TESTE_AVISO_DONO %', r::text;
end $teste$;

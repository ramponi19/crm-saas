-- Teste da 20261125000700_cargos_permissoes (etapa 1.1b): matriz cargos × ações, empresa ativa, Dono nunca
-- falta, Consulta só lê, plataforma fora dos cargos e auditada sem valores (D-A1).
-- Bloco que termina com RAISE: tudo é desfeito; o resultado volta em RESULTADO_TESTE_CARGOS {...}.
-- Semente (empresa 1 = JM de teste, lojas 3 matriz e 6): dono a632db2c…; admins …0201 e …0202; vendedores M1 …0101
-- e M2 …0102 (loja 3), …0104 (loja 6). Empresa 5: dono f47a8e4f…; vendedor …0001 (vira superadmin no fim).
do $teste$
declare
  r jsonb := '{}';
  e text;
  v jsonb;
  v_n int;
  v_id bigint;
  v_dono1 constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  v_adm1  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  v_adm2  constant uuid := '0e5e0000-0000-4000-8000-000000000202';
  v_m1    constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  v_m2    constant uuid := '0e5e0000-0000-4000-8000-000000000102';
  v_j2    constant uuid := '0e5e0000-0000-4000-8000-000000000104';
  v_dono5 constant uuid := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_vd5   constant uuid := '0e5e0000-0000-4000-8000-000000000001';
  c_dono1 bigint; c_adm1 bigint; c_vend1 bigint; c_cons1 bigint; c_tec1 bigint; c_coord bigint;
  sess text;
begin
  execute 'set constraints all immediate';   -- a guarda do Dono é adiada: aqui ela dispara na hora
  select id into c_dono1 from empresa_cargos where empresa_id = 1 and sistema;
  select id into c_adm1  from empresa_cargos where empresa_id = 1 and nome = 'Administrador';
  select id into c_vend1 from empresa_cargos where empresa_id = 1 and nome = 'Vendedor';
  select id into c_cons1 from empresa_cargos where empresa_id = 1 and nome = 'Consulta';
  select id into c_tec1  from empresa_cargos where empresa_id = 1 and nome = 'Técnico';

  -- 1. semente: 5 cargos por empresa; todo vínculo com cargo; papel = papel de base do cargo (nada mudou)
  r := r || jsonb_build_object(
    't1_cargos_por_empresa', (select jsonb_object_agg(empresa_id, n) from (select empresa_id, count(*) n from empresa_cargos where empresa_id in (1, 5) group by 1) x),
    't1_vinculo_sem_cargo', (select count(*) from empresa_usuarios where cargo_id is null),
    't1_papel_diferente_do_cargo', (select count(*) from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.role <> c.papel_base),
    't1_dono_jm', (select c.nome from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.usuario_id = v_dono1),
    't1_admin_jm', (select c.nome from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.usuario_id = v_adm1),
    't1_vendedor_jm', (select c.nome from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.usuario_id = v_m1));

  -- 2. matriz de permissões (sessão simulada pelo auth.uid())
  for sess in select unnest(array[v_dono1::text, v_adm1::text, v_m1::text]) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', sess, 'role', 'authenticated')::text, true);
    r := r || jsonb_build_object('t2_' || case sess when v_dono1::text then 'dono' when v_adm1::text then 'admin' else 'vendedor' end,
      jsonb_build_object(
        'equipe_cargos', tem_permissao('equipe.cargos'), 'config_editar', tem_permissao('config.editar'),
        'auditoria_ver', tem_permissao('auditoria.ver'), 'ver_custo', tem_permissao('estoque.ver_custo'),
        'preco_variante', tem_permissao('estoque.preco_variante'), 'leads_outros', tem_permissao('core.ver_leads_outros'),
        'rede', tem_permissao('lojas.ver_rede'), 'pode_escrever', sessao_pode_escrever(),
        'lojas', (select jsonb_agg(x order by x) from unnest(filiais_visiveis()) x)));
  end loop;

  -- 3. Consulta: M2 vira Consulta → papel vendedor, fora da roleta, lê a rede, não grava nada
  update empresa_usuarios set cargo_id = c_cons1 where usuario_id = v_m2 and empresa_id = 1;
  r := r || jsonb_build_object('t3_consulta_vinculo',
    (select jsonb_build_object('papel', role, 'roleta', participa_roleta) from empresa_usuarios where usuario_id = v_m2 and empresa_id = 1));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m2::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object(
    't3_consulta_pode_escrever', sessao_pode_escrever(),
    't3_consulta_lojas', (select jsonb_agg(x order by x) from unnest(filiais_visiveis()) x),
    't3_consulta_le_contatos', (select count(*) > 0 from contatos),
    't3_consulta_ver_custo', tem_permissao('estoque.ver_custo'),
    't3_consulta_financeiro', tem_permissao('core.ver_financeiro'));
  begin
    with u as (update contatos set nome = nome where empresa_id = 1 returning 1) select count(*) into v_n from u;
    e := v_n::text;
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t3_consulta_update_contatos', e);
  begin
    insert into etiquetas (empresa_id, nome) values (1, 'consulta grava?'); e := 'gravou';
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t3_consulta_insert', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m1::text, 'role', 'authenticated')::text, true);
  with u as (update contatos set nome = nome where empresa_id = 1 returning 1) select count(*) into v_n from u;
  r := r || jsonb_build_object('t3_vendedor_update_contatos_grava', v_n > 0);
  execute 'reset role';

  -- 4. Dono nunca falta
  begin
    update empresa_usuarios set cargo_id = c_adm1 where usuario_id = v_dono1 and empresa_id = 1; e := 'tirou o único dono';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t4_tirar_unico_dono', e);
  begin
    update empresa_usuarios set ativo = false where usuario_id = v_dono1 and empresa_id = 1; e := 'desativou o único dono';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t4_desativar_unico_dono', e);
  update empresa_usuarios set cargo_id = c_dono1 where usuario_id = v_adm2 and empresa_id = 1;
  update empresa_usuarios set cargo_id = c_adm1 where usuario_id = v_dono1 and empresa_id = 1;
  r := r || jsonb_build_object('t4_trocar_de_dono',
    jsonb_build_object('antigo', (select role from empresa_usuarios where usuario_id = v_dono1 and empresa_id = 1),
                       'novo', (select role from empresa_usuarios where usuario_id = v_adm2 and empresa_id = 1)));
  update empresa_usuarios set cargo_id = c_dono1 where usuario_id = v_dono1 and empresa_id = 1;
  update empresa_usuarios set cargo_id = c_adm1 where usuario_id = v_adm2 and empresa_id = 1;

  -- 5. app antigo grava só o papel: o cargo acompanha
  insert into empresa_usuarios (empresa_id, usuario_id, role, ativo, filial_id) values (1, v_vd5, 'tecnico', true, 3);
  r := r || jsonb_build_object('t5_insert_por_papel', (select c.nome from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.usuario_id = v_vd5 and eu.empresa_id = 1));
  update empresa_usuarios set role = 'admin' where usuario_id = v_vd5 and empresa_id = 1;
  r := r || jsonb_build_object('t5_update_por_papel', (select c.nome from empresa_usuarios eu join empresa_cargos c on c.id = eu.cargo_id where eu.usuario_id = v_vd5 and eu.empresa_id = 1));
  begin
    update empresa_usuarios set cargo_id = (select id from empresa_cargos where empresa_id = 5 and nome = 'Vendedor') where usuario_id = v_vd5 and empresa_id = 1;
    e := 'aceitou cargo de outra empresa';
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t5_cargo_de_outra_empresa', e);

  -- 6. empresa ativa: com dois vínculos e sem escolha, nulo; escolhe pela RPC; não muda por UPDATE direto
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vd5::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t6_dois_vinculos_sem_escolha', coalesce(get_empresa_id()::text, 'nulo'),
    't6_contexto_empresas', jsonb_array_length(sessao_contexto() -> 'empresas'));
  perform trocar_empresa_ativa(1);
  r := r || jsonb_build_object('t6_depois_de_escolher', get_empresa_id());
  begin perform trocar_empresa_ativa(10); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6_sem_vinculo', e);
  begin update usuarios set empresa_ativa_id = 5 where id = v_vd5; e := 'mudou direto'; exception when others then e := 'recusado'; end;
  r := r || jsonb_build_object('t6_update_direto', e,
    't6_auditada', (select count(*) from auditoria_eventos where usuario_id = v_vd5 and acao = 'trocar_empresa'));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t6_um_vinculo_igual_antes', get_empresa_id());

  -- 7. contexto da sessão (o que o app lê numa chamada só)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m1::text, 'role', 'authenticated')::text, true);
  v := sessao_contexto();
  r := r || jsonb_build_object('t7_vendedor', jsonb_build_object('empresa', v -> 'empresa_id', 'papel', v -> 'papel', 'cargo', v -> 'cargo' -> 'nome',
    'somente_leitura', v -> 'somente_leitura', 'plataforma', v -> 'plataforma', 'permissoes', v -> 'permissoes'));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m2::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t7_consulta_somente_leitura', sessao_contexto() -> 'somente_leitura');

  -- 8. RPCs de cargo: só com equipe.cargos; Dono intocável; cargo em uso não se apaga; auditado
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  v_id := cargo_salvar(null, 'Gerente teste', 'cargo do teste', array['core.ver_relatorios', 'estoque.ver_custo']);
  r := r || jsonb_build_object('t8_criado', (select jsonb_build_object('papel', papel_base, 'perms', (select jsonb_agg(permissao order by permissao) from empresa_cargo_permissoes where cargo_id = v_id))
                                              from empresa_cargos where id = v_id),
    't8_auditado', (select count(*) from auditoria_eventos where entidade = 'cargo' and entidade_id = v_id::text and acao = 'criar'));
  begin perform cargo_salvar(c_dono1, 'Dono', null, array['core.excluir']); e := 'editou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_editar_dono', e);
  begin perform cargo_salvar(null, 'X', null, array['nao.existe']); e := 'criou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_permissao_invalida', e);
  begin perform cargo_apagar(c_vend1); e := 'apagou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_apagar_em_uso', e);
  perform usuario_cargo_trocar(v_m1, v_id);
  r := r || jsonb_build_object('t8_trocar_cargo', (select role from empresa_usuarios where usuario_id = v_m1 and empresa_id = 1),
    't8_troca_auditada', (select count(*) from auditoria_eventos where entidade = 'usuario' and entidade_id = v_m1::text and acao = 'trocar_cargo'));
  begin perform usuario_cargo_trocar(v_dono1, c_adm1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_dono_troca_o_proprio', e);

  -- 8b. Administrador edita cargos (já editava na tela de Permissões), com as travas de quem não é Dono
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm1::text, 'role', 'authenticated')::text, true);
  begin perform cargo_salvar(null, 'Do admin', null, array['core.ver_relatorios']); e := 'criou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_cria_cargo', e);
  begin perform usuario_cargo_trocar(v_j2, c_dono1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_poe_dono', e);
  begin perform usuario_cargo_trocar(v_dono1, c_vend1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_tira_dono', e);
  begin perform usuario_cargo_trocar(v_adm2, c_vend1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_troca_outro_admin', e);
  begin perform usuario_cargo_trocar(v_j2, c_adm1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_promove_a_admin', e);
  begin perform usuario_cargo_trocar(v_adm1, c_vend1); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_admin_troca_o_proprio', e);
  perform usuario_cargo_trocar(v_j2, c_tec1);
  r := r || jsonb_build_object('t8_admin_troca_vendedor', (select role from empresa_usuarios where usuario_id = v_j2 and empresa_id = 1));
  perform usuario_cargo_trocar(v_j2, c_vend1);

  -- 8c. quem edita cargos sem ter tudo (um "Coordenador") não concede o que não tem
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  c_coord := cargo_salvar(null, 'Coordenador teste', null, array['equipe.cargos', 'core.ver_relatorios']);
  perform usuario_cargo_trocar(v_m1, c_coord);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m1::text, 'role', 'authenticated')::text, true);
  begin perform cargo_salvar(null, 'Com custo', null, array['estoque.ver_custo']); e := 'criou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_coord_concede_o_que_nao_tem', e);
  begin perform usuario_cargo_trocar(v_j2, v_id); e := 'trocou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_coord_da_cargo_maior', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  perform usuario_cargo_trocar(v_m1, c_vend1);

  -- 9. 1.1h parte 2 (H1b/H1c): a tela antiga de Permissões e a coluna empresas.permissoes saíram; o cargo é a fonte.
  r := r || jsonb_build_object('t9_coluna_permissoes_saiu', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'empresas' and column_name = 'permissoes'));

  -- 10. configuração: config.editar (admin grava; vendedor não)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm1::text, 'role', 'authenticated')::text, true);
  begin perform config_salvar('core', 'teste_cargo', '1'); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t10_admin_config', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m2::text, 'role', 'authenticated')::text, true);
  begin perform config_salvar('core', 'teste_cargo', '2'); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t10_consulta_config', e);

  -- 11. auditoria: o vendedor não lê; o admin lê
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_m2::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t11_consulta_le_auditoria', (select count(*) from auditoria_eventos));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t11_admin_le_auditoria', (select count(*) > 0 from auditoria_eventos));
  execute 'reset role';

  -- 12. plataforma: superadmin sem vínculo; entra (auditado), grava (auditado sem valores), sai (auditado)
  execute 'alter table usuarios disable trigger trg_prevent_privilege_escalation';
  delete from empresa_usuarios where usuario_id = v_vd5;
  update usuarios set is_super_admin = true where id = v_vd5;
  execute 'alter table usuarios enable trigger trg_prevent_privilege_escalation';
  begin
    insert into empresa_usuarios (empresa_id, usuario_id, role, ativo) values (1, v_vd5, 'owner', true); e := 'criou vínculo';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t12_superadmin_vinculo', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vd5::text, 'role', 'authenticated')::text, true);
  perform set_impersonation(1);
  update contatos set nome = nome || ' (plataforma)' where id = (select min(id) from contatos where empresa_id = 1);
  perform plataforma_registrar_acesso('/leads');
  perform plataforma_registrar_acesso('/leads');   -- a segunda, no mesmo minuto, não grava
  perform encerrar_impersonacao();
  r := r || jsonb_build_object(
    't12_acoes', (select jsonb_agg(acao order by id) from auditoria_eventos where impersonado_por = v_vd5),
    't12_escrita_sem_valores', (select depois from auditoria_eventos where impersonado_por = v_vd5 and acao = 'plataforma_update' limit 1),
    't12_escrita_entidade', (select split_part(entidade_id, ':', 1) from auditoria_eventos where impersonado_por = v_vd5 and acao = 'plataforma_update' limit 1),
    't12_contexto_fora', (sessao_contexto() ->> 'empresa_id') is null);

  raise exception 'RESULTADO_TESTE_CARGOS %', r::text;
end $teste$;

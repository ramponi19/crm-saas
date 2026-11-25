-- Teste da 20261125000300_auditoria_eventos (etapa 1.1a). Bloco que termina com RAISE: a transação inteira é
-- desfeita e o resultado volta na mensagem (RESULTADO_TESTE_AUDITORIA {...}).
-- Usuários da semente: a632db2c… dono da JM de teste (empresa 1); f4ec6a87… vendedora da JM (loja 6);
-- f47a8e4f… dono da Demonstração (empresa 5); 0e5e…0001 vendedor da Demonstração (vira superadmin só aqui).
do $teste$
declare
  r jsonb := '{}';
  e text;
  v_id bigint;
  v_n int;
  v_dono1 constant text := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  v_vend1 constant text := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  v_dono5 constant text := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_super constant uuid := '0e5e0000-0000-4000-8000-000000000001';
begin
  -- 1. auditar() pela sessão do dono da JM: empresa e usuário vêm da sessão
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1, 'role', 'authenticated')::text, true);
  v_id := auditar('config', 'core.teste', 'alterar', '{"valor": 1}', '{"valor": 2}', 'teste', 'teste-auditoria');
  select jsonb_build_object('empresa', empresa_id, 'usuario', usuario_id, 'impersonado', impersonado_por,
                            'entidade', entidade, 'acao', acao, 'antes', antes, 'depois', depois, 'origem', origem)
    into strict r from (select * from auditoria_eventos where id = v_id) a;
  r := jsonb_build_object('t1_linha', r);

  -- 2. auditar_emp com a empresa explícita (servidor): usuário da sessão, sem impersonação
  v_id := auditar_emp(5, 'cargo', '9', 'criar', null, '{"nome": "x"}', null, 'teste-auditoria', null);
  r := r || jsonb_build_object('t2_empresa_explicita', (select empresa_id from auditoria_eventos where id = v_id));

  -- 3. sem sessão: auditar() recusa (não há empresa); auditar_emp grava com usuário nulo (job)
  perform set_config('request.jwt.claims', '', true);
  begin perform auditar('config', 'x', 'alterar'); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  v_id := auditar_emp(1, 'job', 'rotina', 'rodar');
  r := r || jsonb_build_object('t3_sem_sessao_auditar', e,
    't3_job_usuario_nulo', (select usuario_id is null from auditoria_eventos where id = v_id));

  -- 4. imutável: UPDATE e DELETE recusados por qualquer caminho (inclusive o dono do banco, aqui)
  begin update auditoria_eventos set acao = 'outra' where id = v_id; e := 'alterou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t4_update', e);
  begin delete from auditoria_eventos where id = v_id; e := 'apagou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t4_delete', e);
  begin truncate auditoria_eventos; e := 'truncou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t4_truncate', e);

  -- 5. privilégios: nenhum papel da API escreve; ninguém da API chama auditar/auditar_emp, exceto o servidor
  r := r || jsonb_build_object(
    't5_authenticated_insert', has_table_privilege('authenticated', 'public.auditoria_eventos', 'insert'),
    't5_authenticated_update', has_table_privilege('authenticated', 'public.auditoria_eventos', 'update'),
    't5_authenticated_delete', has_table_privilege('authenticated', 'public.auditoria_eventos', 'delete'),
    't5_service_insert', has_table_privilege('service_role', 'public.auditoria_eventos', 'insert'),
    't5_service_delete', has_table_privilege('service_role', 'public.auditoria_eventos', 'delete'),
    't5_anon_select', has_table_privilege('anon', 'public.auditoria_eventos', 'select'),
    't5_auditar_authenticated', has_function_privilege('authenticated', 'public.auditar(text,text,text,jsonb,jsonb,text,text)', 'execute'),
    't5_auditar_emp_authenticated', has_function_privilege('authenticated', 'public.auditar_emp(bigint,text,text,text,jsonb,jsonb,text,text,bigint)', 'execute'),
    't5_auditar_emp_service', has_function_privilege('service_role', 'public.auditar_emp(bigint,text,text,text,jsonb,jsonb,text,text,bigint)', 'execute'));

  -- 6. leitura pela RLS: o dono da JM vê as da JM e não as da Demonstração; a vendedora não vê nada
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object(
    't6_dono1_ve_jm', (select count(*) > 0 from auditoria_eventos where empresa_id = 1),
    't6_dono1_ve_demo', (select count(*) from auditoria_eventos where empresa_id = 5));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vend1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t6_vendedora_ve', (select count(*) from auditoria_eventos));
  begin
    insert into auditoria_eventos (empresa_id, entidade, acao) values (1, 'x', 'y'); e := 'inseriu';
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t6_vendedora_insere_direto', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t6_dono5_ve_jm', (select count(*) from auditoria_eventos where empresa_id = 1),
                               't6_dono5_ve_demo', (select count(*) > 0 from auditoria_eventos where empresa_id = 5));
  execute 'reset role';

  -- 7. superadmin impersonando a JM: a linha sai com impersonado_por
  execute 'alter table usuarios disable trigger trg_prevent_privilege_escalation';   -- a semente não tem superadmin; só aqui (desfeito)
  update usuarios set is_super_admin = true, impersonando_empresa_id = 1, impersonando_expires_at = now() + interval '1 hour'
   where id = v_super;
  execute 'alter table usuarios enable trigger trg_prevent_privilege_escalation';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  v_id := auditar('config', 'core.teste', 'alterar');
  r := r || jsonb_build_object('t7_impersonando',
    (select jsonb_build_object('empresa', empresa_id, 'impersonado_por_e_ele', impersonado_por = v_super, 'usuario_e_ele', usuario_id = v_super)
       from auditoria_eventos where id = v_id));
  -- impersonação vencida: não marca
  execute 'alter table usuarios disable trigger trg_prevent_privilege_escalation';
  update usuarios set impersonando_expires_at = now() - interval '1 minute' where id = v_super;
  execute 'alter table usuarios enable trigger trg_prevent_privilege_escalation';
  v_id := auditar_emp(1, 'config', 'core.teste', 'alterar');
  r := r || jsonb_build_object('t7_vencida_sem_marca', (select impersonado_por is null from auditoria_eventos where id = v_id));

  -- 8. exclusão da empresa expurga só a auditoria dela (o gatilho de empresas); aqui simulado com a marca
  select count(*) into v_n from auditoria_eventos where empresa_id = 5;
  perform set_config('nexus.auditoria_expurgo', '5', true);
  delete from auditoria_eventos where empresa_id = 5;
  perform set_config('nexus.auditoria_expurgo', '', true);
  r := r || jsonb_build_object('t8_expurgo_so_da_empresa', v_n > 0 and not exists (select 1 from auditoria_eventos where empresa_id = 5)
                                                           and exists (select 1 from auditoria_eventos where empresa_id = 1),
    't8_gatilho_em_empresas', exists (select 1 from pg_trigger where tgname = 'empresas_expurgar_auditoria' and not tgisinternal));
  begin
    perform set_config('nexus.auditoria_expurgo', '5', true);
    delete from auditoria_eventos where empresa_id = 1; e := 'apagou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  perform set_config('nexus.auditoria_expurgo', '', true);
  r := r || jsonb_build_object('t8_marca_de_outra_empresa', e);

  raise exception 'RESULTADO_TESTE_AUDITORIA %', r::text;
end $teste$;

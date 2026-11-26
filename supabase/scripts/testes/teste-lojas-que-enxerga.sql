-- Teste da 5a (20261126001000/0010: lojas que enxerga). Semente: empresa 1 (JM de teste, lojas 3 matriz e 6); dono a632…;
-- admin …0201; vendedor M1 …0101 (loja 3); J2 …0104 (loja 6); …0103 sem loja (vale a matriz). Termina com RAISE.
do $teste$
declare
  r jsonb := '{}'; e text; m_sem jsonb; m_com jsonb; v jsonb; n0 bigint; n1 bigint; outra bigint;
  DONO constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  ADM  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1   constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  u record;
begin
  -- 1. matriz de acesso (visíveis e atuação de cada vínculo ativo da empresa 1) sem lista e com a semente: iguais
  delete from empresa_usuario_lojas where empresa_id = 1;
  m_sem := '{}';
  for u in select usuario_id from empresa_usuarios where empresa_id = 1 and ativo order by usuario_id loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u.usuario_id::text, 'role', 'authenticated')::text, true);
    m_sem := m_sem || jsonb_build_object(u.usuario_id::text, jsonb_build_object('ve', filiais_visiveis(), 'atua', filiais_atuacao_de(u.usuario_id, 1)));
  end loop;
  insert into public.empresa_usuario_lojas (empresa_id, usuario_id, filial_id, criado_por)
  select eu.empresa_id, eu.usuario_id,
         coalesce(eu.filial_id, (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.matriz and f.ativo limit 1)), null
    from public.empresa_usuarios eu left join public.empresa_cargos c on c.id = eu.cargo_id
   where eu.ativo and (select count(*) from public.filiais f where f.empresa_id = eu.empresa_id and f.ativo) >= 2
     and eu.role not in ('owner', 'admin') and not coalesce(c.sistema, false)
     and not exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = eu.cargo_id and cp.permissao = 'lojas.ver_rede')
     and not exists (select 1 from public.usuarios u2 where u2.id = eu.usuario_id and u2.is_super_admin)
     and coalesce(eu.filial_id, (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.matriz and f.ativo limit 1)) is not null
  on conflict do nothing;
  m_com := '{}';
  for u in select usuario_id from empresa_usuarios where empresa_id = 1 and ativo order by usuario_id loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u.usuario_id::text, 'role', 'authenticated')::text, true);
    m_com := m_com || jsonb_build_object(u.usuario_id::text, jsonb_build_object('ve', filiais_visiveis(), 'atua', filiais_atuacao_de(u.usuario_id, 1)));
  end loop;
  r := r || jsonb_build_object('1_matriz_igual', m_sem = m_com, '1_vinculos', (select count(*) from jsonb_object_keys(m_com)),
    '1_com_lista', (select count(distinct usuario_id) from empresa_usuario_lojas where empresa_id = 1));

  -- 2. o dono dá as duas lojas ao vendedor de Mogi (auditado); ele passa a ver e atuar nas duas; grava na principal
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  select count(*) into n0 from auditoria_eventos where entidade = 'usuario_lojas';
  v := usuario_lojas_salvar(M1, array[3, 6]::bigint[], null);
  select count(*) into n1 from auditoria_eventos where entidade = 'usuario_lojas';
  r := r || jsonb_build_object('2_salvo', v, '2_auditado', n1 - n0,
    '2_auditoria', (select jsonb_build_object('antes', antes, 'depois', depois, 'usuario', usuario_id = DONO) from auditoria_eventos where entidade = 'usuario_lojas' order by id desc limit 1));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('2_m1_todas', jsonb_build_object('ve', filiais_visiveis(), 'atua', filiais_atuacao(), 'grava', filial_gravacao(1)));
  update usuarios set filial_atual_id = 6 where id = M1;   -- loja da lista: o gatilho da 0910 aceita
  r := r || jsonb_build_object('2_m1_topo_6', jsonb_build_object('ve', filiais_visiveis(), 'grava', filial_gravacao(1)));
  execute 'set local role authenticated';
  begin insert into tarefas (empresa_id, filial_id, titulo) values (1, 6, 'Tarefa na loja 6'); e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  execute 'reset role';
  r := r || jsonb_build_object('2_m1_grava_na_6', e);
  update usuarios set filial_atual_id = null where id = M1;

  -- 3. recusas
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  begin perform usuario_lojas_salvar(M1, array[3, 6]::bigint[], null); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_vendedor_salva', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ADM::text, 'role', 'authenticated')::text, true);
  begin perform usuario_lojas_salvar(DONO, array[3]::bigint[], null); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_admin_mexe_no_dono', e);
  select id into outra from filiais where empresa_id <> 1 limit 1;
  begin perform usuario_lojas_salvar(M1, array[3, outra]::bigint[], null); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_loja_de_outra_empresa', e);
  begin perform usuario_lojas_salvar(M1, array[3]::bigint[], 6); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_principal_fora', e);

  -- 4. o admin tira a loja 6 e muda a principal; lista vazia volta à regra antiga (só a principal)
  v := usuario_lojas_salvar(M1, array[6]::bigint[], 6);
  r := r || jsonb_build_object('4_so_a_6', v);
  v := usuario_lojas_salvar(M1, array[]::bigint[], 3);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('4_sem_lista', jsonb_build_object('salvo', v, 've', filiais_visiveis(), 'atua', filiais_atuacao()));
  raise exception 'RESULTADO_TESTE_LOJAS_QUE_ENXERGA %', r::text;
end $teste$;

-- Teste da 20261124001000_conta_servico. JM de teste (empresa 1; lojas 3 = matriz e 6) e Nexus Demonstração (5).
--   Matriz: M1 (…0101), M2 (…0102), SL = vendedor sem loja (…0103, conta como matriz). Jaguariúna: VJ (f4ec…), J2 (…0104).
--   Administradores A (…0201) e B (…0202); dono a632…. Termina com RAISE: nada fica gravado.

-- Cópias FIÉIS das funções de antes (C2), para provar "empresa sem marca = igual a hoje".
create function pg_temp.vend_antigo(p_empresa bigint, p_filial bigint)
returns uuid[] language sql stable as $$
  with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo)
  select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
     and eu.role = 'vendedor' and eu.usuario_id is not null
     and ((select count(*) from lojas) < 2
          or eu.filial_id = p_filial
          or (eu.filial_id is null and p_filial = (select id from lojas where matriz order by id limit 1)))
$$;
create function pg_temp.adm_antigo(p_empresa bigint, out ids uuid[], out eh_dono boolean)
language plpgsql stable as $$
begin
  select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
   where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not coalesce(ausente, false);
  eh_dono := false;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null;
  end if;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'owner' and usuario_id is not null;
    eh_dono := true;
  end if;
end $$;

do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  SL uuid := '0e5e0000-0000-4000-8000-000000000103'; J2 uuid := '0e5e0000-0000-4000-8000-000000000104';
  VJ uuid := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  A uuid := '0e5e0000-0000-4000-8000-000000000201'; B uuid := '0e5e0000-0000-4000-8000-000000000202';
  DONO uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  hoje date := posvenda_dia_local(1, now());
  D date;
  ct bigint; nSL bigint; nM1 bigint; nJ2 bigint; nSem bigint;
  c_cad bigint; c_passo bigint; c_jor bigint; c_jor6 bigint; a1 bigint; a2 bigint;
  r record; lista jsonb; v int; iguais int := 0; difs jsonb := '[]'; e bigint; f bigint;
begin
  create temp table _n (u uuid primary key, n text) on commit drop;
  insert into _n values (M1,'M1'),(M2,'M2'),(SL,'SL'),(J2,'J2'),(VJ,'VJ'),(A,'A'),(B,'B'),(DONO,'DONO');
  D := posvenda_proximo_dia_util(1, 3, hoje);

  -- 1. Nenhuma marca: as funções novas dão o mesmo que as antigas, em todas as empresas e lojas
  for e in select id from empresas order by id loop
    for f in select id from filiais where empresa_id = e union all select null loop
      if posvenda_vendedores_da_loja(e, f) = pg_temp.vend_antigo(e, f) then iguais := iguais + 1;
      else difs := difs || jsonb_build_object('empresa', e, 'loja', f); end if;
    end loop;
    if (select to_jsonb(x) from posvenda_administradores(e) x) = (select to_jsonb(x) from pg_temp.adm_antigo(e) x) then iguais := iguais + 1;
    else difs := difs || jsonb_build_object('empresa', e, 'admins', true); end if;
  end loop;
  res := res || jsonb_build_object('1_sem_marca_igual_a_hoje', jsonb_build_object('diferentes', difs, 'conferidos_maior_que_zero', iguais > 0));

  -- montagem: negócios e uma régua mínima (como no teste da C2)
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'TESTE CONTA SERVICO') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', SL, '{"_lead":{"ativo":true}}') returning id into nSL;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into nM1;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 6, ct, 1, 18, 'aberto', J2, '{"_lead":{"ativo":true}}') returning id into nJ2;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into nSem;
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua de teste conta de serviço') returning id into c_cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, c_cad, 1, 1, 'whatsapp', 'D+1') returning id into c_passo;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ct, nSL, c_cad, now()) returning id into c_jor;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 6, ct, nJ2, c_cad, now()) returning id into c_jor6;

  -- 2. Conta de serviço sem loja (SL) sai da roleta da matriz
  res := res || jsonb_build_object('2a_matriz_antes', (select jsonb_agg((select n from _n where u = x)) from unnest(posvenda_vendedores_da_loja(1, 3)) x));
  update empresa_usuarios set conta_servico = true where empresa_id = 1 and usuario_id = SL;   -- módulo desligado: gatilho não age
  res := res || jsonb_build_object('2b_matriz_depois', (select jsonb_agg((select n from _n where u = x)) from unnest(posvenda_vendedores_da_loja(1, 3)) x));
  lista := '[]';
  for v in 1..4 loop select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nSem, D); lista := lista || to_jsonb((select n from _n where u = r.responsavel_id)); end loop;
  res := res || jsonb_build_object('2c_roleta_matriz_4_vezes', lista);

  -- 3. Passo de negócio da conta de serviço vai para a roleta da loja (não para ela)
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nSL, D);
  res := res || jsonb_build_object('3_negocio_da_conta_servico', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));

  -- 4. participa_roleta = false: sai da roleta, mas continua com o próprio cliente
  update empresa_usuarios set participa_roleta = false where empresa_id = 1 and usuario_id = M1;
  res := res || jsonb_build_object('4a_matriz_sem_M1', (select jsonb_agg((select n from _n where u = x)) from unnest(posvenda_vendedores_da_loja(1, 3)) x));
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nM1, D);
  res := res || jsonb_build_object('4b_cliente_do_M1', jsonb_build_object('resp', (select n from _n where u = r.responsavel_id), 'origem', r.origem));
  update empresa_usuarios set participa_roleta = true where empresa_id = 1 and usuario_id = M1;

  -- 5. Administradores (1300): participa_roleta NÃO os tira do NPS baixo e dos chamados; conta de serviço sim; sem nenhum, o dono
  update empresa_usuarios set participa_roleta = false where empresa_id = 1 and usuario_id = A;
  res := res || jsonb_build_object('5a_admin_fora_da_roleta_continua', (select jsonb_agg((select n from _n where u = x)) from unnest((posvenda_administradores(1)).ids) x));
  update empresa_usuarios set conta_servico = true where empresa_id = 1 and usuario_id = B;
  select * into r from posvenda_administradores(1);
  res := res || jsonb_build_object('5b_conta_servico_sai', jsonb_build_object('ids', (select jsonb_agg((select n from _n where u = x)) from unnest(r.ids) x), 'eh_dono', r.eh_dono));
  update empresa_usuarios set participa_roleta = true where empresa_id = 1 and usuario_id = A;
  update empresa_usuarios set conta_servico = false where empresa_id = 1 and usuario_id = B;

  -- 6. Passo que vence hoje com a conta de serviço como responsável: a reavaliação passa para a roleta
  update empresa_usuarios set conta_servico = true where empresa_id = 1 and usuario_id = J2;     -- módulo desligado
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 6, c_jor6, c_passo, ct, nJ2, J2, 'vendedor', (hoje + time '10:00') at time zone 'America/Sao_Paulo') returning id into a1;
  perform posvenda_reavaliar_vencendo(1, hoje);
  res := res || jsonb_build_object('6_reavaliacao', (select jsonb_build_object('resp', (select n from _n where u = responsavel_id), 'origem', origem_responsavel) from posvenda_acompanhamentos where id = a1));
  update empresa_usuarios set conta_servico = false where empresa_id = 1 and usuario_id = J2;

  -- 7. Com o módulo ligado, MARCAR como conta de serviço redistribui as pendências (gatilho)
  update empresa_usuarios set conta_servico = false where empresa_id = 1 and usuario_id = SL;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, c_jor, c_passo, ct, nSL, SL, 'vendedor', (D + time '10:00') at time zone 'America/Sao_Paulo') returning id into a2;
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true) on conflict (empresa_id, modulo) do update set ativo = true;
  update empresa_usuarios set conta_servico = true where empresa_id = 1 and usuario_id = SL;
  res := res || jsonb_build_object('7_marcar_redistribui', (select jsonb_build_object('resp', (select n from _n where u = responsavel_id), 'origem', origem_responsavel,
                                       'observacao', observacao like '%reatribuído%') from posvenda_acompanhamentos where id = a2));
  -- e desmarcar não mexe em nada
  update empresa_usuarios set conta_servico = false where empresa_id = 1 and usuario_id = SL;
  res := res || jsonb_build_object('7b_desmarcar_nao_volta', (select (select n from _n where u = responsavel_id) from posvenda_acompanhamentos where id = a2));

  raise exception 'RESULTADO_TESTE_CONTA_SERVICO %', res::text;
end $t$;

-- Teste da 20261124002100_posvenda_ativar_existentes. JM de teste (empresa 1, loja 3, vendedor M1). Termina com RAISE.
-- Vendas antigas ganhas ANTES de o módulo ligar (sem jornada); depois liga e ativa.
do $t$
declare
  res jsonb := '{}'; M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  hoje date := posvenda_dia_local(1, now()); cad bigint; ct bigint; n bigint; n_rec bigint; ids bigint[] := '{}'; k int; v jsonb;
begin
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  update posvenda_cadencias set ativo = false where empresa_id = 1;   -- só a régua deste teste conta
  -- 4 vendas: há 2 dias, 20 dias, 100 dias (categoria 1) e 400 dias (fora: o passo mais longo é D+330)
  foreach k in array array[2, 20, 100, 400] loop
    insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Ativar ' || k) returning id into ct;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
      values (1, 3, ct, 1, 18, 'ganho', M1, ((hoje - k) + time '12:00') at time zone 'America/Sao_Paulo',
              jsonb_build_object('_lead', jsonb_build_object('ativo', true),
                'venda', jsonb_build_object('data', (hoje - k)::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1000)))
      returning id into n;
    ids := ids || n;
    if k = 100 then n_rec := ct; end if;
  end loop;
  -- recompra: o cliente de 100 dias comprou de novo há 10 dias (mesma categoria) → o D+330 da compra antiga é cancelado
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, n_rec, 1, 18, 'ganho', M1, ((hoje - 10) + time '12:00') at time zone 'America/Sao_Paulo',
            jsonb_build_object('_lead', jsonb_build_object('ativo', true),
              'venda', jsonb_build_object('data', (hoje - 10)::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1000)))
    returning id into n;
  ids := ids || n;

  res := res || jsonb_build_object('1_sem_modulo', posvenda_ativar_existentes(1) -> 'motivo');
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  res := res || jsonb_build_object('2_sem_regua', posvenda_ativar_existentes(1) -> 'motivo');

  insert into posvenda_cadencias (empresa_id, nome, prioridade, filtros) values (1, 'Régua ativação', 10, '{"categorias":[1]}') returning id into cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, grupo) values
    (1, cad, 1, 1, 'whatsapp', 'D+1', 'relacionamento'), (1, cad, 2, 7, 'pesquisa', 'D+7', 'relacionamento'),
    (1, cad, 3, 30, 'whatsapp', 'D+30', 'relacionamento'), (1, cad, 4, 330, 'ligacao', 'D+330', 'produto');

  v := posvenda_ativar_existentes(1);
  res := res || jsonb_build_object('3_ativou', jsonb_build_object('vendas_lidas_4_ou_mais', (v ->> 'vendas_lidas')::int >= 4, 'jornadas_4_ou_mais', (v ->> 'jornadas_criadas')::int >= 4,
    'passos_por_venda', (select jsonb_object_agg(x.dias, x.passos) from (
        select (hoje - posvenda_dia_local(1, nn.ganho_em))::text dias,
               (select jsonb_agg(pp.titulo || ':' || a.status order by pp.dia_offset) from posvenda_acompanhamentos a
                  join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = nn.id) passos
          from negocios nn where nn.id = any(ids)) x),
    'so_futuros', (select bool_and(posvenda_dia_local(1, a.previsto_para) >= hoje) from posvenda_acompanhamentos a
                    where a.negocio_id = any(ids) and a.status = 'pendente')));
  -- 4. de novo: nada novo
  v := posvenda_ativar_existentes(1);
  res := res || jsonb_build_object('4_de_novo_sem_passos', v -> 'passos_criados');
  res := res || jsonb_build_object('5_so_servidor', has_function_privilege('authenticated', 'posvenda_ativar_existentes(bigint)', 'execute'));
  raise exception 'RESULTADO_TESTE_ATIVAR %', res::text;
end $t$;

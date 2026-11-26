-- VOLTA da 20261126000800_custo_so_nos_satelites_funcoes: as três peças voltam ao corpo de antes (tempo 3 da 1.1f):
-- concluir_encomenda grava o custo do acessório pela coluna antiga (a porta de entrada leva ao satélite); compras_pedido_salvar
-- idem; vendas_valor_guarda volta a vigiar valor_custo. Só vale enquanto as colunas antigas existirem (antes da 1.1g).
begin;
set local lock_timeout = '5s';

create or replace function public.concluir_encomenda(
  p_venda_id   bigint,
  p_pagamentos jsonb default '[]'::jsonb,
  p_acessorios jsonb default '[]'::jsonb,
  p_origem     text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_emp      bigint := get_empresa_id();
  v          vendas_vendas%rowtype;
  v_grupo    uuid;
  v_ids      bigint[];
  v_pend     bigint[];
  v_primeira bigint;
  v_total    numeric;
  v_pago     numeric;
  v_forma    text;
  v_formas   int;
  v_baixou   int := 0;
  p          jsonb;
  a          jsonb;
  v_valor    numeric;
  v_parc     int;
  v_novos    bigint[] := '{}';
  v_id_novo  bigint;
begin
  if v_uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  if v_emp is null then raise exception 'Sem empresa na sessão' using errcode = '42501'; end if;
  if not sessao_pode_escrever() then
    raise exception 'A empresa está em modo somente leitura' using errcode = '42501';
  end if;
  if p_origem is not null and p_origem not in ('encomenda', 'historico') then
    raise exception 'Origem inválida: %', p_origem using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_pagamentos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_acessorios, '[]'::jsonb)) <> 'array' then
    raise exception 'Pagamentos e acessórios precisam ser listas' using errcode = '22023';
  end if;

  -- A venda: da empresa de quem chama E de uma loja que essa pessoa enxerga. Mesma mensagem
  -- para "não existe" e "é de outro": não confirmar a existência de venda alheia.
  select * into v from vendas_vendas where id = p_venda_id for update;
  if not found or v.empresa_id <> v_emp
     or not (coalesce(v.filial_id, 0) = any (filiais_visiveis())) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if v.status not in ('encomenda', 'pendente_entrega') then
    raise exception 'Esta venda não está pendente de entrega (situação: %)', coalesce(v.status, 'sem situação')
      using errcode = '22023';
  end if;

  -- Encomenda antiga (antes de 16/09/2026) não tem grupo: ganha um agora, para o acessório e o
  -- pagamento da entrega ficarem amarrados a ela.
  v_grupo := v.grupo_pdv;
  if v_grupo is null then
    v_grupo := gen_random_uuid();
    update vendas_vendas set grupo_pdv = v_grupo where id = v.id;
  end if;

  -- Trava o fechamento inteiro (todas as linhas do grupo) antes de somar.
  perform 1 from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo for update;
  select array_agg(id order by id),
         array_agg(id order by id) filter (where status in ('encomenda', 'pendente_entrega')),
         min(id)
    into v_ids, v_pend, v_primeira
    from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo;

  -- Acessórios levados na entrega: uma venda própria no mesmo grupo (é o que mantém o relatório
  -- por produto certo — a capinha não vira "parte do iPhone").
  for a in select * from jsonb_array_elements(coalesce(p_acessorios, '[]'::jsonb)) loop
    v_valor := round(coalesce((a->>'valor')::numeric, 0), 2);
    if v_valor <= 0 or coalesce(btrim(a->>'descricao'), '') = '' then
      raise exception 'Acessório sem descrição ou sem valor' using errcode = '22023';
    end if;
    insert into vendas_vendas (empresa_id, filial_id, grupo_pdv, cliente_id, vendedor_id, usuario_id,
                               valor_venda, valor_custo, canal_venda, status, data_venda, observacoes,
                               concluida_em, concluida_por, concluida_via)
    values (v_emp, v.filial_id, v_grupo, v.cliente_id, v_uid, v_uid,
            v_valor, 0, coalesce(v.canal_venda, 'encomenda'), 'concluida', now(),
            'Acessório: ' || left(btrim(a->>'descricao'), 200),
            now(), v_uid, p_origem)
    returning id into v_id_novo;
    v_novos := v_novos || v_id_novo;
  end loop;

  -- O dinheiro recebido agora, na primeira venda do fechamento (onde o sinal também está).
  for p in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    v_valor := round(coalesce((p->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;
    if coalesce(p->>'forma', '') not in ('dinheiro', 'pix', 'debito', 'credito', 'link') then
      raise exception 'Forma de pagamento inválida: %', coalesce(p->>'forma', '(vazia)') using errcode = '22023';
    end if;
    v_parc := case when p->>'forma' in ('credito', 'link') then greatest(1, coalesce((p->>'parcelas')::int, 1)) end;
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago,
                                   parcelas, bandeira_cartao, valor_com_juros)
    values (v_emp, v.filial_id, v_primeira, p->>'forma', v_valor,
            v_parc,
            case when p->>'forma' = 'credito' then coalesce(nullif(p->>'bandeira', ''), 'visa_master') end,
            case when (p->>'valor_com_juros')::numeric > v_valor then round((p->>'valor_com_juros')::numeric, 2) end);
  end loop;

  -- A conta: tudo o que o fechamento vale x tudo o que foi pago nele (sinal + agora).
  select coalesce(sum(valor_venda) filter (where status not in ('cancelada', 'devolvido')), 0)
    into v_total
    from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo;
  select coalesce(sum(valor_pago), 0) into v_pago
    from vendas_pagamentos where venda_id = any (v_ids || v_novos);

  if v_pago + 0.009 < v_total then
    raise exception 'Saldo em aberto: %', vendas_moeda(v_total - v_pago)
      using errcode = 'P0001',
            detail = format('Total %s, pago %s.', vendas_moeda(v_total), vendas_moeda(v_pago));
  end if;

  -- Forma resumida na venda (o detalhe fica em vendas_pagamentos): só quando entrou dinheiro agora.
  select count(distinct e->>'forma'), min(e->>'forma'),
         max(case when e->>'forma' in ('credito', 'link') then coalesce((e->>'parcelas')::int, 1) end)
    into v_formas, v_forma, v_parc
    from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e
   where coalesce((e->>'valor')::numeric, 0) > 0;

  -- Conclui. H1 (24/11/2026): a data da venda NÃO muda — a da conclusão fica em concluida_em.
  -- A série do aparelho só existe na unidade: copiada para a venda se ela não tiver.
  update vendas_vendas vv
     set status          = 'concluida',
         concluida_em    = now(),
         concluida_por   = v_uid,
         concluida_via   = p_origem,
         numero_serie    = coalesce(nullif(vv.numero_serie, ''),
                             (select coalesce(nullif(u.imei, ''), nullif(u.numero_serie, ''))
                                from estoque_unidades u
                               where u.id = vv.unidade_id and u.empresa_id = v_emp)),
         forma_pagamento = case when v_formas = 1 then v_forma
                                when v_formas > 1 then 'multiplo'
                                else vv.forma_pagamento end,
         parcelas        = case when v_formas = 1 and v_parc > 1 then v_parc
                                when v_formas >= 1 then null
                                else vv.parcelas end
   where vv.id = any (v_pend);

  -- A peça sai do estoque.
  with b as (
    update estoque_unidades u set status = 'vendido'
     where u.empresa_id = v_emp
       and u.id in (select unidade_id from vendas_vendas where id = any (v_pend) and unidade_id is not null)
       and u.status is distinct from 'vendido'
    returning u.id
  ) select count(*) into v_baixou from b;

  return jsonb_build_object(
    'venda_ids', to_jsonb(v_ids || v_novos),
    'concluidas', to_jsonb(v_pend),
    'total', round(v_total, 2),
    'pago', round(v_pago, 2),
    'baixou', v_baixou
  );
end $$;
revoke all on function public.concluir_encomenda(bigint, jsonb, jsonb, text) from public, anon;
grant execute on function public.concluir_encomenda(bigint, jsonb, jsonb, text) to authenticated;

create or replace function public.compras_pedido_salvar(p jsonb)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.get_empresa_id(); v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_ve boolean := coalesce(public.tem_permissao('estoque.ver_custo'), false);
  v_filial bigint := nullif(p ->> 'filial_id', '')::bigint;
  v_hoje date;
begin
  if v_emp is null or auth.uid() is null then raise exception 'SEM_EMPRESA' using errcode = '42501'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = '42501'; end if;
  if v_filial is not null and not (public.filiais_visiveis() @> array[v_filial]) then
    raise exception 'LOJA_NAO_VISIVEL' using errcode = '42501';
  end if;
  v_hoje := (now() at time zone coalesce(public.empresa_fuso(v_emp), 'America/Sao_Paulo'))::date;   -- o dia da loja
  if v_id is null then
    insert into public.compras_pedidos (empresa_id, filial_id, fornecedor_id, descricao, valor_total, status, observacoes, usuario_id, data_pedido)
    values (v_emp, v_filial, nullif(p ->> 'fornecedor_id', '')::bigint, p ->> 'descricao',
            case when v_ve then nullif(p ->> 'valor_total', '')::numeric end, coalesce(p ->> 'status', 'pendente'), p ->> 'observacoes',
            auth.uid(), coalesce(to_date(nullif(p ->> 'data_pedido', ''), 'YYYY-MM-DD'), v_hoje))
    returning id into v_id;
  else
    update public.compras_pedidos
       set fornecedor_id = coalesce(nullif(p ->> 'fornecedor_id', '')::bigint, fornecedor_id),
           descricao = coalesce(p ->> 'descricao', descricao),
           valor_total = case when v_ve and p ? 'valor_total' then nullif(p ->> 'valor_total', '')::numeric else valor_total end,
           status = coalesce(p ->> 'status', status), observacoes = coalesce(p ->> 'observacoes', observacoes)
     where id = v_id and empresa_id = v_emp and public.filiais_visiveis() @> array[coalesce(filial_id, 0)];
    if not found then raise exception 'PEDIDO_NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.compras_pedido_salvar(jsonb) from public, anon;
grant execute on function public.compras_pedido_salvar(jsonb) to authenticated;

create or replace function public.vendas_valor_guarda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.valor_venda, new.valor_custo, new.desconto_valor)
       is not distinct from (old.valor_venda, old.valor_custo, old.desconto_valor) then
    return new;
  end if;
  -- Dentro das funções do banco (SECURITY DEFINER) o current_user é o dono delas: passam.
  if current_user not in ('authenticated', 'anon', 'service_role') then
    return new;
  end if;
  -- H2: concluída não muda de valor, nem por rota do servidor. Só script de operação com a marca.
  if old.status = 'concluida' then
    if coalesce(current_setting('nexus.venda_valor_ajuste', true), '') <> '' then
      return new;
    end if;
    raise exception 'Venda concluída não muda de valor'
      using errcode = '42501',
            hint = 'O valor e o custo ficam congelados na conclusão. Correção só por devolução/cancelamento ou script de operação com nexus.venda_valor_ajuste.';
  end if;
  -- H3: pelo navegador, preço e custo só se ajustam em encomenda.
  if current_user in ('authenticated', 'anon') and old.status is distinct from 'encomenda' then
    raise exception 'Preço e custo só se ajustam em encomenda (situação: %)', coalesce(old.status, 'sem situação')
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.vendas_valor_guarda() from public, anon, authenticated;
create or replace trigger vendas_valor_guarda
  before update of valor_venda, valor_custo, desconto_valor on public.vendas_vendas
  for each row execute function public.vendas_valor_guarda();
commit;

-- PROVA no banco LOCAL da migração 20261125000100 (concluir_encomenda / concluir_venda_pdv / guarda).
-- Transação desfeita no fim: nada fica gravado. Usa a empresa 1 (dono) e um usuário de OUTRA empresa.
--
--   psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres" -X -A -t -q \
--        -f tests/banco/prova-concluir-encomenda.sql
--
-- Cenários pedidos no hotfix:
--   A. entregar com saldo zero (sinal = total)          -> conclui
--   B. entregar com saldo em aberto                     -> recusa "Saldo em aberto", nada gravado
--   C. sinal anterior + saldo pago no ato               -> conclui, 2 pagamentos
--   D. usuário de outra empresa                         -> "Venda não encontrada"
-- E mais: grupo com 2 itens + acessório + série copiada + baixa da peça; guarda contra UPDATE/INSERT
-- de 'concluida' pelo navegador; PDV de balcão com falta, sem falta e com entrega pendente; concluir
-- duas vezes.
-- Ajustes de 24/11/2026 (roteiro §1.1):
--   H1. a conclusão não sobrescreve data_venda (fica em concluida_em)
--   H2. venda concluída não muda de valor/custo/desconto (navegador nem service_role; script com a marca passa)
--   H3. pelo navegador, preço e custo só se ajustam em 'encomenda' (não em pendente_entrega nem em_fechamento)
begin;
create temp table res(n serial, linha text);

-- Troca de usuário: o navegador chega como `authenticated` com o JWT do usuário.
create function pg_temp.como(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function pg_temp.r(t text) returns void language sql as $$ insert into res(linha) values (t) $$;
grant execute on function pg_temp.como(uuid), pg_temp.admin() to authenticated;

do $$
declare
  fil   bigint;
  dono  uuid;
  outro uuid;
  cli   bigint;
  v1 bigint; v2 bigint; v3 bigint; un bigint;
  g uuid;
  r jsonb;
  n int; t numeric; s text;
  imei text := '35' || lpad((floor(random() * 1e13))::bigint::text, 13, '0');
begin
  select id into fil from filiais where empresa_id = 1 and ativo order by matriz desc, id limit 1;
  select eu.usuario_id into dono from empresa_usuarios eu
   where eu.empresa_id = 1 and eu.ativo and eu.role = 'owner'
     and not exists (select 1 from empresa_usuarios x where x.usuario_id = eu.usuario_id and x.empresa_id <> 1 and x.ativo)
   limit 1;
  select eu.usuario_id into outro from empresa_usuarios eu
   where eu.empresa_id <> 1 and eu.ativo
     and not exists (select 1 from empresa_usuarios x where x.usuario_id = eu.usuario_id and x.empresa_id = 1)
   limit 1;
  select id into cli from contatos where empresa_id = 1 order by id limit 1;
  if fil is null or dono is null or outro is null then
    perform pg_temp.r('FALHOU cenário: filial/dono/outro não encontrados'); return;
  end if;
  -- Dono vendo a rede inteira, sem impersonação.
  update usuarios set filial_atual_id = null, impersonando_empresa_id = null, impersonando_expires_at = null where id = dono;

  -- ── A. saldo zero ────────────────────────────────────────────────────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv, data_venda)
  values (1, fil, cli, 1000, 'encomenda', 'encomenda', gen_random_uuid(), now() - interval '5 days') returning id into v1;
  insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'pix', 1000);
  perform pg_temp.como(dono);
  begin
    r := concluir_encomenda(v1, '[]'::jsonb, '[]'::jsonb, 'historico');
    perform pg_temp.admin();
    select count(*) into n from vendas_vendas where id = v1 and status = 'concluida' and concluida_por = dono
       and concluida_via = 'historico' and concluida_em > now() - interval '1 minute';
    perform pg_temp.r(case when n = 1 then 'OK A: saldo zero conclui (quem, quando, via historico gravados)' else 'FALHOU A: não gravou a conclusão' end);
    -- H1 (24/11/2026): a data da venda NÃO vira a da entrega; a conclusão fica só em concluida_em.
    select count(*) into n from vendas_vendas where id = v1
       and data_venda < now() - interval '4 days' and concluida_em > now() - interval '1 minute';
    perform pg_temp.r(case when n = 1 then 'OK H1: data_venda mantida (lançada há 5 dias), concluida_em = agora' else 'FALHOU H1: data_venda foi sobrescrita' end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU A: ' || sqlerrm);
  end;

  -- ── B. saldo em aberto ───────────────────────────────────────────────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv)
  values (1, fil, cli, 1000, 'encomenda', 'encomenda', gen_random_uuid()) returning id into v2;
  perform pg_temp.como(dono);
  begin
    r := concluir_encomenda(v2, '[]'::jsonb, '[]'::jsonb, 'historico');
    perform pg_temp.admin(); perform pg_temp.r('FALHOU B: concluiu sem pagamento');
  exception when others then
    perform pg_temp.admin();
    perform pg_temp.r(case when sqlerrm = 'Saldo em aberto: R$ 1.000,00' then 'OK B: sem pagamento recusa — ' || sqlerrm else 'FALHOU B: mensagem ' || sqlerrm end);
  end;
  -- B2. paga só parte na entrega: recusa e o pagamento parcial NÃO fica.
  perform pg_temp.como(dono);
  begin
    r := concluir_encomenda(v2, '[{"forma":"dinheiro","valor":400}]'::jsonb, '[]'::jsonb, 'encomenda');
    perform pg_temp.admin(); perform pg_temp.r('FALHOU B2: concluiu com R$ 600 faltando');
  exception when others then
    perform pg_temp.admin();
    select count(*) into n from vendas_pagamentos where venda_id = v2;
    select count(*) into t from vendas_vendas where id = v2 and status = 'encomenda';
    perform pg_temp.r(case when sqlerrm = 'Saldo em aberto: R$ 600,00' and n = 0 and t = 1
      then 'OK B2: pagamento parcial recusa e nada fica gravado — ' || sqlerrm
      else format('FALHOU B2: %s / pagamentos=%s / ainda encomenda=%s', sqlerrm, n, t) end);
  end;

  -- ── C. sinal anterior + saldo no ato ─────────────────────────────────────────────────────
  insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v2, 'dinheiro', 300);
  perform pg_temp.como(dono);
  begin
    r := concluir_encomenda(v2, '[{"forma":"credito","valor":700,"parcelas":3,"valor_com_juros":735.50}]'::jsonb, '[]'::jsonb, 'encomenda');
    perform pg_temp.admin();
    select count(*), sum(valor_pago) into n, t from vendas_pagamentos where venda_id = v2;
    select forma_pagamento || '/' || coalesce(parcelas::text, '-') into s from vendas_vendas where id = v2 and status = 'concluida';
    perform pg_temp.r(case when n = 2 and t = 1000 and s = 'credito/3'
      then 'OK C: sinal R$ 300 + R$ 700 no ato conclui (2 pagamentos, crédito 3x)'
      else format('FALHOU C: pagamentos=%s soma=%s forma=%s', n, t, s) end);
    select count(*) into n from vendas_pagamentos where venda_id = v2 and valor_com_juros = 735.50 and bandeira_cartao = 'visa_master';
    perform pg_temp.r(case when n = 1 then 'OK C: juros e bandeira do cartão gravados' else 'FALHOU C: juros/bandeira' end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU C: ' || sqlerrm);
  end;

  -- ── D. outra empresa ─────────────────────────────────────────────────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv)
  values (1, fil, cli, 500, 'encomenda', 'encomenda', gen_random_uuid()) returning id into v3;
  perform pg_temp.como(outro);
  begin
    r := concluir_encomenda(v3, '[{"forma":"pix","valor":500}]'::jsonb, '[]'::jsonb, 'historico');
    perform pg_temp.admin(); perform pg_temp.r('FALHOU D: usuário de outra empresa concluiu');
  exception when others then
    perform pg_temp.admin();
    select count(*) into n from vendas_pagamentos where venda_id = v3;
    perform pg_temp.r(case when sqlerrm = 'Venda não encontrada' and n = 0
      then 'OK D: outra empresa recusada — ' || sqlerrm else format('FALHOU D: %s / pagamentos=%s', sqlerrm, n) end);
  end;
  -- D2. o saldo da venda alheia também não aparece.
  perform pg_temp.como(outro);
  begin
    r := encomenda_saldo(v3);
    perform pg_temp.admin(); perform pg_temp.r('FALHOU D2: saldo de venda alheia: ' || r::text);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK D2: encomenda_saldo de outra empresa — ' || sqlerrm);
  end;

  -- ── E. grupo com 2 itens + acessório + série + baixa ────────────────────────────────────
  g := gen_random_uuid();
  insert into estoque_unidades (empresa_id, filial_id, imei, status, ativo, quantidade, preco_custo, preco_venda)
  values (1, fil, imei, 'reservado', true, 1, 0, 1000) returning id into un;
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv, unidade_id)
  values (1, fil, cli, 1000, 'encomenda', 'encomenda', g, un) returning id into v1;
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv)
  values (1, fil, cli, 500, 'encomenda', 'encomenda', g) returning id into v3;
  insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'pix', 200);
  perform pg_temp.como(dono);
  begin
    r := encomenda_saldo(v3);
    perform pg_temp.admin();
    perform pg_temp.r(case when (r->>'total')::numeric = 1500 and (r->>'pago')::numeric = 200 and (r->>'saldo')::numeric = 1300
      then 'OK E: encomenda_saldo do grupo (total 1.500, pago 200, saldo 1.300) pela 2ª linha'
      else 'FALHOU E: saldo ' || r::text end);
    perform pg_temp.como(dono);
    r := concluir_encomenda(v3, '[{"forma":"pix","valor":1380}]'::jsonb, '[{"descricao":"Capinha","valor":80}]'::jsonb, 'encomenda');
    perform pg_temp.admin();
    select count(*) into n from vendas_vendas where grupo_pdv = g and status = 'concluida';
    select count(*) into t from vendas_pagamentos where venda_id = v1;  -- pagamento vai na 1ª linha
    select numero_serie into s from vendas_vendas where id = v1;
    perform pg_temp.r(case when n = 3 and t = 2 and s = imei and (select status from estoque_unidades where id = un) = 'vendido'
      then 'OK E: grupo inteiro concluído (2 itens + acessório), pagamento na 1ª linha, série copiada, peça vendida'
      else format('FALHOU E: concluidas=%s pagamentos_1a=%s serie=%s unidade=%s', n, t, s, (select status from estoque_unidades where id = un)) end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU E: ' || sqlerrm);
  end;
  -- E2. concluir de novo: recusa.
  perform pg_temp.como(dono);
  begin
    r := concluir_encomenda(v3, '[]'::jsonb, '[]'::jsonb, 'historico');
    perform pg_temp.admin(); perform pg_temp.r('FALHOU E2: concluiu duas vezes');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK E2: segunda conclusão recusada — ' || sqlerrm);
  end;

  -- ── F. guarda: o navegador não conclui direto ───────────────────────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, status, canal_venda, grupo_pdv)
  values (1, fil, cli, 300, 'encomenda', 'encomenda', gen_random_uuid()) returning id into v1;
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set status = 'concluida' where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU F: UPDATE direto para concluida passou');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK F: UPDATE direto para concluida barrado — ' || sqlerrm);
  end;
  perform pg_temp.como(dono);
  begin
    -- Sem `status`: cai no default 'concluida', que também é barrado.
    insert into vendas_vendas (empresa_id, filial_id, valor_venda) values (1, fil, 99);
    perform pg_temp.admin(); perform pg_temp.r('FALHOU F2: INSERT concluida (default) passou');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK F2: INSERT com status padrão (concluida) barrado');
  end;
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set observacoes = 'só uma nota' where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('OK F3: UPDATE que não mexe no status segue livre');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU F3: ' || sqlerrm);
  end;

  -- ── G. PDV de balcão ────────────────────────────────────────────────────────────────────
  g := gen_random_uuid();
  perform pg_temp.como(dono);
  begin
    insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id, vendedor_id)
    values (1, fil, 900, 'em_fechamento', 'loja_fisica', g, dono, dono) returning id into v1;
    insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id, vendedor_id, observacoes)
    values (1, fil, 100, 'em_fechamento', 'loja_fisica', g, dono, dono, 'Acessório: Película') returning id into v3;
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'dinheiro', 700);
    begin
      r := concluir_venda_pdv(g, false);
      perform pg_temp.admin(); perform pg_temp.r('FALHOU G: balcão fechou com R$ 300 faltando');
    exception when others then
      perform pg_temp.admin();
      perform pg_temp.r(case when sqlerrm = 'Saldo em aberto: R$ 300,00' then 'OK G: balcão com falta recusado — ' || sqlerrm else 'FALHOU G: ' || sqlerrm end);
    end;
    perform pg_temp.como(dono);
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'pix', 300);
    r := concluir_venda_pdv(g, false);
    perform pg_temp.admin();
    select count(*) into n from vendas_vendas where grupo_pdv = g and status = 'concluida' and concluida_via = 'pdv';
    perform pg_temp.r(case when n = 2 then 'OK G2: balcão pago (dinheiro + pix) conclui as 2 linhas' else format('FALHOU G2: %s concluídas', n) end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU G: ' || sqlerrm);
  end;
  -- G3. entrega pendente: a peça fica pendente_entrega, o acessório conclui.
  g := gen_random_uuid();
  insert into estoque_unidades (empresa_id, filial_id, status, ativo, quantidade, preco_custo, preco_venda)
  values (1, fil, 'reservado', true, 1, 0, 900) returning id into un;
  perform pg_temp.como(dono);
  begin
    insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id, unidade_id)
    values (1, fil, 900, 'em_fechamento', 'loja_fisica', g, dono, un) returning id into v1;
    insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id, observacoes)
    values (1, fil, 100, 'em_fechamento', 'loja_fisica', g, dono, 'Acessório: Fonte') returning id into v3;
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'debito', 1000);
    r := concluir_venda_pdv(g, true);
    perform pg_temp.admin();
    select string_agg(status, ',' order by id) into s from vendas_vendas where grupo_pdv = g;
    perform pg_temp.r(case when s = 'pendente_entrega,concluida' then 'OK G3: entrega pendente — peça pendente_entrega, acessório concluído' else 'FALHOU G3: ' || s end);
    -- e a entrega depois, com o fechamento já pago, conclui sem cobrar de novo.
    perform pg_temp.como(dono);
    r := concluir_encomenda(v1, '[]'::jsonb, '[]'::jsonb, 'historico');
    perform pg_temp.admin();
    perform pg_temp.r(case when (select status from vendas_vendas where id = v1) = 'concluida' and (select status from estoque_unidades where id = un) = 'vendido'
      then 'OK G4: entregar a pendente já paga conclui e baixa a peça' else 'FALHOU G4' end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU G3/G4: ' || sqlerrm);
  end;
  -- G5. o fechamento de balcão de OUTRA pessoa / outra empresa não é encontrado.
  g := gen_random_uuid();
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id)
  values (1, fil, 10, 'em_fechamento', 'loja_fisica', g, dono);
  perform pg_temp.como(outro);
  begin
    r := concluir_venda_pdv(g, false);
    perform pg_temp.admin(); perform pg_temp.r('FALHOU G5: outra empresa fechou venda alheia');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK G5: balcão de outra empresa — ' || sqlerrm);
  end;

  -- ── H2. venda concluída não muda de valor (24/11/2026) ──────────────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, valor_custo, status, canal_venda, grupo_pdv, data_venda)
  values (1, fil, cli, 2000, 1500, 'encomenda', 'encomenda', gen_random_uuid(), now() - interval '3 days') returning id into v1;
  insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v1, 'pix', 2000);
  perform pg_temp.como(dono);
  r := concluir_encomenda(v1, '[]'::jsonb, '[]'::jsonb, 'historico');
  perform pg_temp.admin();
  -- pelo navegador (dono)
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set valor_venda = 1, valor_custo = 0 where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU H2: navegador mudou o valor da venda concluída');
  exception when others then perform pg_temp.admin();
    perform pg_temp.r(case when sqlerrm = 'Venda concluída não muda de valor' then 'OK H2: navegador não muda valor da concluída — ' || sqlerrm else 'FALHOU H2: ' || sqlerrm end);
  end;
  -- pela rota do servidor (service_role), sem a marca
  perform set_config('role', 'service_role', true);
  begin
    update vendas_vendas set valor_custo = 10 where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU H2b: service_role mudou o custo da venda concluída');
  exception when others then perform pg_temp.admin();
    perform pg_temp.r(case when sqlerrm = 'Venda concluída não muda de valor' then 'OK H2b: rota do servidor também não muda — ' || sqlerrm else 'FALHOU H2b: ' || sqlerrm end);
  end;
  -- desconto também é valor
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set desconto_valor = 100 where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU H2c: desconto da venda concluída mudou');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK H2c: desconto da concluída também travado');
  end;
  -- o que não é valor segue livre (vendedor, observação)
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set observacoes = 'nota depois da venda', vendedor_id = dono where id = v1;
    perform pg_temp.admin(); perform pg_temp.r('OK H2d: observação e vendedor da concluída seguem editáveis');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU H2d: ' || sqlerrm);
  end;
  -- script de operação com a marca explícita passa
  perform set_config('role', 'service_role', true);
  perform set_config('nexus.venda_valor_ajuste', 'prova local', true);
  begin
    update vendas_vendas set valor_custo = 1400 where id = v1;
    perform set_config('nexus.venda_valor_ajuste', '', true);
    perform pg_temp.admin();
    perform pg_temp.r(case when (select valor_custo from vendas_vendas where id = v1) = 1400
      then 'OK H2e: script com nexus.venda_valor_ajuste corrige o custo' else 'FALHOU H2e: não gravou' end);
  exception when others then perform set_config('nexus.venda_valor_ajuste', '', true); perform pg_temp.admin(); perform pg_temp.r('FALHOU H2e: ' || sqlerrm);
  end;
  select valor_venda::text into s from vendas_vendas where id = v1;
  perform pg_temp.r(case when s = '2000.00' or s = '2000' then 'OK H2f: valor da concluída intacto (R$ 2.000)' else 'FALHOU H2f: valor = ' || s end);

  -- ── H3. preço e custo só se ajustam em encomenda (24/11/2026) ───────────────────────────
  insert into vendas_vendas (empresa_id, filial_id, cliente_id, valor_venda, valor_custo, status, canal_venda, grupo_pdv)
  values (1, fil, cli, 3000, 0, 'encomenda', 'encomenda', gen_random_uuid()) returning id into v2;
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set valor_venda = 2900, valor_custo = 2500 where id = v2;
    perform pg_temp.admin();
    perform pg_temp.r(case when (select valor_custo from vendas_vendas where id = v2) = 2500
      then 'OK H3: encomenda ajusta preço e custo pelo navegador' else 'FALHOU H3: ajuste não gravou' end);
  exception when others then perform pg_temp.admin(); perform pg_temp.r('FALHOU H3: ' || sqlerrm);
  end;
  -- pendente de entrega (balcão com entrega depois / orçamento aprovado pelo link): recusado
  g := gen_random_uuid();
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id)
  values (1, fil, 800, 'em_fechamento', 'loja_fisica', g, dono) returning id into v3;
  insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, fil, v3, 'pix', 800);
  insert into estoque_unidades (empresa_id, filial_id, status, ativo, quantidade, preco_custo, preco_venda)
  values (1, fil, 'reservado', true, 1, 0, 800) returning id into un;
  update vendas_vendas set unidade_id = un where id = v3;
  perform pg_temp.como(dono);
  r := concluir_venda_pdv(g, true);
  perform pg_temp.admin();
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set valor_venda = 700 where id = v3;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU H3b: pendente_entrega mudou de preço pelo navegador');
  exception when others then perform pg_temp.admin();
    perform pg_temp.r(case when sqlerrm like 'Preço e custo só se ajustam em encomenda%' then 'OK H3b: pendente de entrega recusado — ' || sqlerrm else 'FALHOU H3b: ' || sqlerrm end);
  end;
  -- em fechamento (balcão no meio do fechamento): recusado
  g := gen_random_uuid();
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, status, canal_venda, grupo_pdv, usuario_id)
  values (1, fil, 500, 'em_fechamento', 'loja_fisica', g, dono) returning id into v3;
  perform pg_temp.como(dono);
  begin
    update vendas_vendas set valor_venda = 1 where id = v3;
    perform pg_temp.admin(); perform pg_temp.r('FALHOU H3c: em_fechamento mudou de preço pelo navegador');
  exception when others then perform pg_temp.admin(); perform pg_temp.r('OK H3c: em fechamento recusado');
  end;
end $$;

reset role;
select linha from res order by n;
rollback;

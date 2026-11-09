-- PROVA no banco LOCAL da migração 20261109000500 (únicos por empresa: taxas e ref de cobrança).
-- Transação desfeita no fim. Empresas 1 e 5; precisa de alguma taxa com bandeira na empresa 1.
--
--   PGOPTIONS="-c prova.modo=ida"   psql "host=127.0.0.1 port=54322 ..." -X -A -t -q -f tests/banco/prova-unicos-por-empresa.sql
--   PGOPTIONS="-c prova.modo=volta" ...   (depois de supabase/scripts/volta/volta-unicos-por-empresa.sql)
--
-- Rodado em 09/11/2026: antes, ida, volta e ida — todas as linhas OK. Só no banco local.
begin;
create temp table res(n serial, linha text) on commit drop;
do $$
declare modo text := current_setting('prova.modo'); f text; b text; p int;
begin
  select forma_pagamento, bandeira, parcelas into f, b, p from financeiro_taxas where empresa_id = 1 and bandeira is not null limit 1;
  -- 1. Outra empresa cadastra a mesma taxa que a empresa 1 já tem.
  begin
    insert into financeiro_taxas (empresa_id, forma_pagamento, bandeira, parcelas, percentual_taxa) values (5, f, b, p, 1.5);
    insert into res(linha) values (case when modo='ida' then 'OK empresa 5 cadastra a mesma taxa que a empresa 1' else 'FALHOU (volta) a taxa repetida passou' end);
  exception when unique_violation then
    insert into res(linha) values (case when modo='volta' then 'OK (volta) taxa repetida de outra empresa barrada, como antes' else 'FALHOU taxa da outra empresa barrada: ' || sqlerrm end);
  end;
  -- 2. A mesma empresa continua sem poder repetir a própria taxa.
  begin
    insert into financeiro_taxas (empresa_id, forma_pagamento, bandeira, parcelas, percentual_taxa) values (1, f, b, p, 9);
    insert into res(linha) values ('FALHOU empresa 1 repetiu a própria taxa');
  exception when unique_violation then
    insert into res(linha) values ('OK empresa 1 não repete a própria taxa');
  end;
  -- 3. Cobrança com o provider_ref de outra empresa.
  insert into financeiro_cobrancas (empresa_id, provider, provider_ref, valor, status, tipo)
    values (1, 'asaas', 'pay_prova_1', 10, 'pendente', 'pix');
  begin
    insert into financeiro_cobrancas (empresa_id, provider, provider_ref, valor, status, tipo)
      values (5, 'asaas', 'pay_prova_1', 10, 'pendente', 'pix');
    insert into res(linha) values (case when modo='volta' then 'OK (volta) ref repetido passa, como antes' else 'FALHOU ref de pagamento repetido em outra empresa passou' end);
  exception when unique_violation then
    insert into res(linha) values (case when modo='ida' then 'OK ref de pagamento de outra empresa barrado' else 'FALHOU ' || sqlerrm end);
  end;
  -- 4. Cobrança sem ref (antes de ir ao provedor) segue livre.
  begin
    insert into financeiro_cobrancas (empresa_id, provider, provider_ref, valor, status, tipo) values (1, 'asaas', null, 10, 'pendente', 'pix');
    insert into financeiro_cobrancas (empresa_id, provider, provider_ref, valor, status, tipo) values (5, 'asaas', null, 10, 'pendente', 'pix');
    insert into res(linha) values ('OK cobranças sem ref não colidem');
  exception when others then insert into res(linha) values ('FALHOU sem ref: ' || sqlerrm);
  end;
end $$;
select linha from res order by n;
rollback;

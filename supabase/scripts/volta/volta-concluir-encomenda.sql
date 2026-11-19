-- VOLTA de 20261119000100_concluir_encomenda. Voltar o APP antes: o app novo grava a venda de
-- balcão como 'em_fechamento' e conclui por concluir_venda_pdv / concluir_encomenda.
--
-- As colunas concluida_em / concluida_por / concluida_via FICAM (são registro de quem concluiu;
-- apagar perderia a informação). Para tirar também, descomente o último bloco.
--
-- Se sobrar venda 'em_fechamento' (aba fechada no meio do fechamento), ela aparece no
-- Histórico; confira antes de voltar:
--   select id, grupo_pdv, valor_venda, created_at from vendas_vendas where status = 'em_fechamento';

begin;

drop trigger if exists vendas_conclusao_guarda on public.vendas_vendas;
drop function if exists public.vendas_conclusao_guarda();
drop function if exists public.concluir_venda_pdv(uuid, boolean);
drop function if exists public.concluir_encomenda(bigint, jsonb, jsonb, text);
drop function if exists public.encomenda_saldo(bigint);
drop function if exists public.vendas_moeda(numeric);

-- alter table public.vendas_vendas drop constraint if exists vendas_concluida_via_check;
-- alter table public.vendas_vendas
--   drop column if exists concluida_via,
--   drop column if exists concluida_por,
--   drop column if exists concluida_em;

commit;

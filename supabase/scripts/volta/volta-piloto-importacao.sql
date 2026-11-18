-- VOLTA da 20261118000200_piloto_importacao_acompanhamento.sql (só com o app anterior no ar: o app novo lê
-- empresas.piloto e grava em importacoes). Os contatos e leads importados ficam (são dados da empresa).
begin;
drop function if exists public.acompanhamento_empresa(bigint, integer);
drop table if exists public.importacoes;
alter table public.empresas drop constraint if exists empresas_piloto_cortesia_check;
alter table public.empresas drop column if exists piloto;
commit;

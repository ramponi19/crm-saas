-- VOLTA de 20261123000300_ganho_arquivado_e_arquivamento.sql: tira o registro de arquivamento e
-- devolve a core_negocio_do_canal da M1 (20261123000200), que exige `ativo` no ganho recente.
-- As linhas 'arquivado'/'desarquivado' já gravadas no histórico ficam (são dados).

drop trigger if exists negocios_arquivamento on public.negocios;
drop function if exists public.core_negocio_arquivamento();

-- Depois: rodar de novo o bloco 1 de supabase/migrations/20261123000200_ganho_protegido.sql
-- (só o `create or replace function public.core_negocio_do_canal`), que é a versão com `n2.ativo`.

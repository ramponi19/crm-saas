-- Volta de 20261109000300_canais_empresa_fixa: tira o gatilho que impede canal de trocar de empresa.
-- As rotas continuam recusando com 409; só a segunda trava (no banco) sai.
drop trigger if exists canais_empresa_fixa on public.canais;
drop function if exists public.canais_empresa_fixa();

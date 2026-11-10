-- Volta da 20261111000100_transmissao.
-- ATENÇÃO: apaga as transmissões e o acompanhamento delas (transmissao_envios). As mensagens
-- enviadas ficam na conversa (origem 'transmissao'); a marca `_transmissao` no card fica no
-- `dados` do negócio (inofensiva; sai junto abaixo). Rodar com o app de antes no ar (Instant
-- Rollback) — o job `automacoes-hora` pode continuar: a rota antiga não lê transmissão.
begin;
drop trigger if exists mensagens_transmissao_resposta on public.mensagens;
drop function if exists public.transmissao_resposta();
drop function if exists public.transmissao_reservar(bigint, integer);
drop function if exists public.transmissao_montar(bigint);
drop function if exists public.transmissao_previa(bigint, jsonb, bigint);
drop function if exists public.transmissao_loja_ok(bigint, bigint);
drop function if exists public.transmissao_origens();
drop function if exists public.transmissao_numeros(bigint[]);
drop function if exists public.transmissao_publico(bigint, bigint, jsonb, bigint);
drop table if exists public.transmissao_envios;
drop table if exists public.transmissoes;
update public.negocios set dados = dados - '_transmissao' where dados ? '_transmissao';
delete from public.configuracoes_sistema where chave = 'transmissao';
delete from public.empresa_modulos where modulo = 'transmissao';
commit;

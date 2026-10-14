-- VAZAMENTO FECHADO EM 14/10/2026 — achado pelo verificador do Supabase.
--
-- `zapintel_conversas(p_empresa, p_por_lead)` é SECURITY DEFINER, recebe a
-- empresa por parâmetro e devolve nome, telefone e o texto das mensagens dos
-- leads. Estava executável pela role `anon`: qualquer pessoa com a chave
-- pública (que vai no navegador) lia as conversas de qualquer empresa, sem
-- login. Nenhum código do projeto chama esta função — sobra do ZapIntel antigo.
-- Os logs do Supabase (24 h, o que o plano guarda) não mostram chamada.
--
-- Primeiro fechado por permissão; na mesma noite, apagado na limpeza do
-- código morto.
revoke all on function public.zapintel_conversas(bigint, integer) from public, anon, authenticated;
drop function if exists public.zapintel_conversas(bigint, integer);

alter function public.zapintel_familia_objecao(text) set search_path = public;

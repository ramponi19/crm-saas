-- VAZAMENTO FECHADO EM 14/10/2026 — achado pelo verificador do Supabase.
--
-- `zapintel_conversas(p_empresa, p_por_lead)` é SECURITY DEFINER, recebe a
-- empresa por parâmetro e devolve nome, telefone e o texto das mensagens dos
-- leads. Estava executável pela role `anon`: qualquer pessoa com a chave
-- pública (que vai no navegador) lia as conversas de qualquer empresa, sem
-- login. Nenhum código do projeto chama esta função — sobra do ZapIntel antigo.
-- Os logs do Supabase (24 h, o que o plano guarda) não mostram chamada.
--
-- Fechado só por permissão; a função continua existindo até decidirmos
-- apagá-la junto com o resto do código morto.
revoke all on function public.zapintel_conversas(bigint, integer) from public, anon, authenticated;

alter function public.zapintel_familia_objecao(text) set search_path = public;

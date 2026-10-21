-- diagnostico_canais e zapintel_conversa_cache: fechadas para anon e authenticated (21/10/2026).
--
-- Na produção as duas já estão assim, mas nenhuma migração dizia isso: o banco montado só
-- pelas migrações (`supabase start`) saía com as duas abertas para anon e authenticated
-- (o privilégio padrão do Supabase nas tabelas novas do public). Achado comparando o banco
-- novo com a produção.
--
-- diagnostico_canais: na produção o authenticated tem SÓ insert por coluna (dados,
-- empresa_id, etapa, origem_url) — o `revoke all` abaixo derruba também os grants por
-- coluna, então eles voltam logo em seguida. Hoje quem grava é a chave de serviço (rota
-- /api/canais/diagnostico e a Edge webhook-leads).
-- zapintel_conversa_cache: lida só pela função zapintel_conversa (security definer).
--
-- Resultado igual ao da produção; aplicada lá, não muda nada.

revoke all on table public.diagnostico_canais from anon, authenticated;
grant insert (dados, empresa_id, etapa, origem_url) on table public.diagnostico_canais to authenticated;

revoke all on table public.zapintel_conversa_cache from anon, authenticated;

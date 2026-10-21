-- storage_orfaos lista os nomes dos arquivos do bucket chat-midia que nenhuma mensagem nem foto
-- usa. Até 20/10/2026 anon e authenticated tinham SELECT nela — qualquer um com a chave pública
-- listava nomes de arquivo do chat. Quem a lê é só service_role (conferido por grep em 20/10):
-- lib/storage/retencao.ts acharOrfaos (cron reter-audio, createServiceClient) e os scripts
-- reter-audio.mts, provar-retencao.mts e limpar-orfaos-chat-midia.mjs (SUPABASE_SERVICE_ROLE_KEY).
revoke select on public.storage_orfaos from anon, authenticated;

-- =====================================================================================
-- Passo A, item 2: configuracoes_sistema sem token de canal.
--
-- REGISTRO TARDIO. Em produção este DELETE foi executado direto (MCP, 19/10/2026, depois
-- do envio pelo canal ativo testado) e não virou arquivo na hora. Este arquivo existe para
-- a ordem das migrações reproduzir a produção: baseline → revoke_rpc → este → core_v1.
-- Em produção ele não apaga nada (as linhas já não existem).
--
-- As 6 chaves guardavam 8 campos de token de uma época em que o canal era configurado à
-- mão. O canal hoje vive em canais_conectados (token cifrado com CHANNEL_ENCRYPTION_KEY) e
-- nenhum código lê mais estas chaves (commit 38e9a25). O valor antigo fica no dump de 20/10.
-- =====================================================================================
delete from public.configuracoes_sistema
 where chave in ('instagram', 'messenger', 'meta_instagram', 'meta_messenger',
                 'whatsapp_official', 'whatsapp_zapi_obsoleto');

-- 1.5: v_orfaos_chat_midia sai. Era a primeira versão da lista de órfãos do chat-midia; a retenção
-- (lib/storage/retencao.ts) usa storage_orfaos desde 14/10, e o único leitor que sobrava era o script
-- manual scripts/limpar-orfaos-chat-midia.mjs, que passa a ler storage_orfaos. Nenhum app lê.
-- Pode rodar antes do deploy. Volta: recriar do dump (com security_invoker, ou a trava recusa).
drop view if exists public.v_orfaos_chat_midia;

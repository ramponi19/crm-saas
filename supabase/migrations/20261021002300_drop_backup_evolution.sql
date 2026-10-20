-- Limpeza de 20/10, item 2.6: saem os schemas backup (cópias de segurança de lotes antigos,
-- 77 tabelas, ~4 MB) e evolution (o provedor de WhatsApp aposentado em 31/07, 37 tabelas).
-- Antes: nenhum canal Evolution, nenhum código nem função pública cita os schemas e nada fora
-- deles depende de algo dentro. Volta: dumps/2026-10-21-limpeza/{backup,evolution}.dump.
drop schema if exists backup cascade;
drop schema if exists evolution cascade;

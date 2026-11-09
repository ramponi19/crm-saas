-- FAXINA 09/11/2026 (item 6, aprovado pelo Lucas): a extensão uuid-ossp sai.
-- Conferido na produção em 09/11: 0 defaults de coluna com uuid_generate_v*, 0 funções
-- fora de `extensions` que a chamem, 0 objetos dependentes (pg_depend), 0 usos no app,
-- na Edge e nos scripts. Os uuid do banco usam gen_random_uuid() (nativo).
-- Volta: supabase/scripts/volta/volta-uuid-ossp.sql
drop extension if exists "uuid-ossp";

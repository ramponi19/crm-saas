-- Volta da 20261124000200_posvenda_esquema (C1). Só antes de o módulo ter dados: apaga as tabelas do pós-venda.
-- Se a C2 já estiver aplicada, rodar antes supabase/scripts/volta/volta-posvenda-responsavel.sql.
drop table if exists public.posvenda_chamado_eventos;
drop table if exists public.posvenda_chamados;
drop table if exists public.posvenda_respostas;
drop table if exists public.posvenda_acompanhamentos;
drop table if exists public.posvenda_jornadas;
drop table if exists public.posvenda_chamado_sla;
drop table if exists public.posvenda_chamado_categorias;
drop table if exists public.posvenda_chamado_status;
drop table if exists public.posvenda_cadencia_passos;
drop table if exists public.posvenda_cadencias;
drop table if exists public.posvenda_pesquisas;
drop table if exists public.posvenda_roleta;

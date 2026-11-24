-- Volta da 20261124000400_posvenda_jornada (C3): tira o gatilho em negocios e as funções; devolve o esquema da C1.
-- Só antes de haver jornadas (o módulo desligado em todas as empresas).
drop trigger if exists negocios_posvenda on public.negocios;
drop trigger if exists posvenda_acompanhamentos_promover on public.posvenda_acompanhamentos;
drop function if exists public.posvenda_promover_juntado();
drop function if exists public.posvenda_negocio_ganho();
drop function if exists public.posvenda_reancorar_jornada(bigint);
drop function if exists public.posvenda_encerrar_jornadas(bigint, text);
drop function if exists public.posvenda_iniciar_jornadas(bigint);
drop index if exists public.posvenda_acompanhamentos_contato_dia;
alter table public.posvenda_acompanhamentos drop constraint posvenda_acompanhamentos_status_check;
alter table public.posvenda_acompanhamentos add constraint posvenda_acompanhamentos_status_check
  check (status in ('pendente', 'feito', 'sem_resposta', 'reagendado', 'pulado', 'perdido', 'cancelado'));
alter table public.posvenda_acompanhamentos drop column juntado_a, drop column motivo;
drop index if exists public.posvenda_jornadas_negocio;
drop index if exists public.posvenda_jornadas_uma_ativa;
alter table public.posvenda_jornadas add constraint posvenda_jornadas_negocio_id_cadencia_id_key unique (negocio_id, cadencia_id);
alter table public.posvenda_jornadas drop column condicao, drop column categoria_id;
alter table public.posvenda_cadencia_passos drop column ciclo_troca;

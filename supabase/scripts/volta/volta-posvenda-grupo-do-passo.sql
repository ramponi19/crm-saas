-- Volta da 20261124000500_posvenda_grupo_do_passo: devolve `ciclo_troca` e a recompra da C3 (só o ciclo de troca).
alter table public.posvenda_cadencia_passos add column ciclo_troca boolean not null default false;
update public.posvenda_cadencia_passos set ciclo_troca = true where grupo = 'aparelho' and dia_offset >= 300;
-- Depois: rodar o "create or replace function public.posvenda_iniciar_jornadas" de 20261124000400_posvenda_jornada.sql
alter table public.posvenda_cadencia_passos drop column grupo;

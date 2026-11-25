-- Volta da 20261124000300_posvenda_responsavel (C2): tira o gatilho em empresa_usuarios e as funções.
drop trigger if exists empresa_usuarios_posvenda_desligado on public.empresa_usuarios;
drop function if exists public.posvenda_usuario_desligado();
drop function if exists public.posvenda_reavaliar_vencendo(bigint, date);
drop function if exists public.posvenda_redistribuir_usuario(bigint, uuid);
drop function if exists public.posvenda_reatribuir_acompanhamento(bigint, uuid[], text);
drop function if exists public.posvenda_resolver_responsavel(bigint, bigint, text, bigint, date, uuid[]);
drop function if exists public.posvenda_roleta_proximo(bigint, text, uuid[], date, integer, uuid[]);
drop function if exists public.posvenda_administradores(bigint);
drop function if exists public.posvenda_vendedores_da_loja(bigint, bigint);
drop function if exists public.posvenda_carga_do_dia(bigint, uuid, date);
drop function if exists public.posvenda_teto_diario(bigint, bigint);
drop function if exists public.posvenda_proximo_dia_util(bigint, bigint, date);
drop function if exists public.posvenda_dia_local(bigint, timestamptz);

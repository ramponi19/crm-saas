-- Volta da 20261124001700_posvenda_acoes. Tira as RPCs e o gatilho de instalação.
-- As sementes (status, categorias, SLA, pesquisa NPS) e o que já foi registrado (respostas, chamados, eventos) FICAM:
-- são dados da empresa; nada é apagado.
drop trigger if exists empresa_modulos_posvenda_instalar on public.empresa_modulos;
drop function if exists public.posvenda_modulo_instalado();
drop function if exists public.posvenda_nps_registrar(bigint, integer, text, bigint, text);
drop function if exists public.posvenda_chamado_mover(bigint, bigint, text, uuid);
drop function if exists public.posvenda_chamado_abrir(bigint, text, text, bigint, text, bigint, bigint);
drop function if exists public.posvenda_chamado_criar(bigint, bigint, text, text, bigint, text, bigint, bigint, bigint, text, uuid);
drop function if exists public.posvenda_registrar(bigint, text, text, text, date);
drop function if exists public.posvenda_instalar(bigint);
drop function if exists public.posvenda_exigir_sessao(bigint);

-- Volta da 20261124000900_venda_exigida: tira o gatilho e a função (a exigência volta a ser só da rota).
drop trigger if exists negocios_venda_exigida on public.negocios;
drop function if exists public.core_negocio_venda_exigida();

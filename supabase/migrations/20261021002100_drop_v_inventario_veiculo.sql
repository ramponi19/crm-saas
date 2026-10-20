-- Limpeza de 20/10, item 2.3: view de segmento (veículos) sem nenhum leitor.
-- grep em app, components, lib, hooks e supabase/functions vazio; nenhuma view ou função
-- depende dela. Só aparece em types/database.ts (gerado), que é regenerado depois.
drop view if exists public.v_inventario_veiculo;

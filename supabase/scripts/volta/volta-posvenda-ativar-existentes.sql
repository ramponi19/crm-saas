-- Volta da 20261124002100_posvenda_ativar_existentes. Tira só a função; as jornadas que ela criou ficam (são da empresa;
-- para desfazer uma ativação, cancelar os passos pendentes com motivo, nunca apagar).
drop function if exists public.posvenda_ativar_existentes(bigint);

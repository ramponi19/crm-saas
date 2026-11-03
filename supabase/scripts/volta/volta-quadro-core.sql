-- Volta de 20261104000200_quadro_core.sql: só tira as funções novas (o app antigo não as usa).
drop function if exists public.quadro_pagina(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]);
drop function if exists public.quadro_contagens(bigint, uuid, boolean, uuid);
drop function if exists public.quadro_leads(bigint, integer, text, timestamptz, bigint, uuid, boolean, uuid, bigint[]);
drop function if exists public.quadro_base(bigint, uuid);

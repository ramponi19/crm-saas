-- ADMINISTRADORES DO PÓS-VENDA IGNORAM "PARTICIPA DA ROLETA" (Lucas, 24/11/2026). Universal.
--
-- `participa_roleta = false` tira a PESSOA da distribuição de leads e de acompanhamentos (roleta de vendas e roleta
-- da loja no pós-venda). Não tira o administrador da sua função: NPS baixo e chamados continuam indo para os
-- administradores (Lucas: "Matheus e Eduardo continuam como administradores no pós-venda"). Só a conta de serviço
-- (não é pessoa) fica fora. Na 1000, posvenda_administradores também filtrava participa_roleta, o que mandaria o NPS
-- baixo para o dono quando os administradores saem da roleta de leads.
--
-- Volta: supabase/scripts/volta/volta-admins-ignoram-participa-roleta.sql (corpo da 1000)
-- Teste: supabase/scripts/testes/teste-conta-servico.sql (casos 5a e 5b)

do $$
begin
  if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.posvenda_administradores(bigint)'::regprocedure), '-')
     <> 'addfc15f544d0c8a3b1a621b07b9f743' then
    raise exception 'posvenda_administradores mudou desde a 1000; revise antes de aplicar';
  end if;
end $$;

-- Administradores (NPS baixo, chamados): 'admin' ativos e pessoas (não conta de serviço), presentes; todos ausentes
-- → os ausentes; nenhum → o dono (pessoa). `participa_roleta` NÃO conta aqui.
create or replace function public.posvenda_administradores(p_empresa bigint, out ids uuid[], out eh_dono boolean)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
   where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not coalesce(ausente, false)
     and not conta_servico;
  eh_dono := false;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not conta_servico;
  end if;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'owner' and usuario_id is not null and not conta_servico;
    eh_dono := true;
  end if;
end $$;

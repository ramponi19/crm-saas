-- VOLTA de 20261123000100_transmissao_canal (23/11/2026).
-- Ordem: app ANTES (o app novo grava transmissoes.canal_id; sem a coluna, criar transmissão
-- falharia). Depois desta volta, a Edge sem o `canal_id` no select também precisa voltar (v84).
-- O transmissao_montar volta ao corpo de 20261111000300_modelos_por_waba (copiado abaixo).

drop trigger if exists transmissoes_canal_valido on public.transmissoes;
drop function if exists public.transmissoes_canal_valido();
drop function if exists public.modelo_aprovado_no_canal(bigint, bigint, bigint);

create or replace function public.transmissao_montar(p_transmissao bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t transmissoes%rowtype;
  v_emp bigint := get_empresa_id();
  v_n int;
begin
  select * into t from transmissoes where id = p_transmissao for update;
  if not found or t.empresa_id is distinct from v_emp or not is_empresa_admin(v_emp) then
    raise exception 'transmissão não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if t.status <> 'rascunho' then
    raise exception 'a transmissão já foi disparada' using errcode = '22023';
  end if;
  if not transmissao_loja_ok(v_emp, t.filial_id) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  if not modelo_aprovado_na_loja(v_emp, t.modelo_id, t.filial_id, false) then
    raise exception 'o modelo não está aprovado no WhatsApp desta loja' using errcode = '22023';
  end if;
  insert into transmissao_envios (empresa_id, filial_id, transmissao_id, contato_id, negocio_id, modelo_id, telefone, status, motivo)
  select v_emp, t.filial_id, t.id, p.contato_id, p.negocio_id, t.modelo_id, p.telefone,
         case when p.fora is null then 'pendente' else 'pulada' end,
         case p.fora when 'opt_out' then 'contato pediu para não receber (opt-out)'
                     when 'bloqueado' then 'contato bloqueado'
                     when 'sem_telefone' then 'contato sem telefone'
                     when 'modelo_7_dias' then 'este contato já recebeu este modelo nos últimos 7 dias' end
    from transmissao_publico(v_emp, t.filial_id, t.filtro, t.modelo_id) p
  on conflict (transmissao_id, contato_id) do nothing;
  get diagnostics v_n = row_count;
  -- Ninguém apto: não nasce transmissão vazia (o erro desfaz a lista inteira).
  if not exists (select 1 from transmissao_envios where transmissao_id = t.id and status = 'pendente') then
    raise exception 'ninguém na lista pode receber (todos fora ou lista vazia)' using errcode = '22023';
  end if;
  update transmissoes set total = v_n where id = t.id;
  return v_n;
end $$;
revoke all on function public.transmissao_montar(bigint) from public, anon;
grant execute on function public.transmissao_montar(bigint) to authenticated, service_role;

drop index if exists public.transmissoes_canal_idx;
alter table public.transmissoes drop column if exists canal_id;

notify pgrst, 'reload schema';

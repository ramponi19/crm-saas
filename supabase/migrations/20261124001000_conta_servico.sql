-- CONTA DE SERVIÇO E "PARTICIPA DA ROLETA" (Lucas, 24/11/2026). Universal: vale para qualquer empresa.
--
-- empresa_usuarios ganha duas marcas, editáveis pelo dono ou administrador (Configurações › Equipe):
--   conta_servico    (padrão false): a conta NÃO é uma pessoa (ex.: a conta da revisão da Meta, integrações).
--                    Fica fora de TODAS as roletas e não conta como "vendedor ativo do negócio" (D9 regra a):
--                    os passos de pós-venda de negócio dela vão para a roleta da loja. A conta continua ativa e entra.
--   participa_roleta (padrão true): uma PESSOA fora da distribuição automática (vendas e pós-venda). Continua dona
--                    dos próprios clientes (D9 regra a) e pode pegar leads da esteira à mão.
-- Respeitadas por: lib/roleta.ts (membrosElegiveis — distribuição de leads, agenda, portais, formulário de imóveis),
-- posvenda_vendedores_da_loja, posvenda_administradores, posvenda_resolver_responsavel (regras a e e),
-- posvenda_reavaliar_vencendo e o gatilho de desligamento (marcar como conta de serviço redistribui as pendências).
-- Empresa sem nenhuma marca: tudo igual a hoje (os padrões mantêm todo mundo onde estava).
--
-- Volta: supabase/scripts/volta/volta-conta-servico.sql (corpos exatos de antes e as colunas saem)
-- Teste: supabase/scripts/testes/teste-conta-servico.sql + tests/integracao/roleta-local.test.ts

do $$
declare r record;
begin
  for r in select * from (values
      ('public.posvenda_vendedores_da_loja(bigint,bigint)', 'd5e2f1801a7f4a455665e87857cee8bf'),
      ('public.posvenda_administradores(bigint)', '86facc3dcd8394375df6d0767a29d9e5'),
      ('public.posvenda_resolver_responsavel(bigint,bigint,text,bigint,date,uuid[])', '2db64a1f6102733bc729b8364c433f69 8a584788de68e27988b478d2b4871e12'),
      ('public.posvenda_reavaliar_vencendo(bigint,date)', 'cc41fed9ee810bfb845588a32d6144e6'),
      ('public.posvenda_usuario_desligado()', '6d6d5f86cb1746ab7891304c14cd3fb8')) v(f, h) loop
    -- r.h: md5 aceitos — o da produção e, só no resolver, o do arquivo da C2 (com comentários; banco local recriado)
    if not coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = r.f::regprocedure), '-') = any(string_to_array(r.h, ' ')) then
      raise exception '% mudou desde a conferência de 24/11/2026; revise antes de aplicar', r.f;
    end if;
  end loop;
end $$;

alter table public.empresa_usuarios
  add column conta_servico boolean not null default false,
  add column participa_roleta boolean not null default true;
comment on column public.empresa_usuarios.conta_servico is
  'A conta não é uma pessoa (revisão da Meta, integração): fora de todas as roletas e da regra "vendedor do negócio" do pós-venda. Continua ativa.';
comment on column public.empresa_usuarios.participa_roleta is
  'false = pessoa fora da distribuição automática (vendas e pós-venda); continua dona dos próprios clientes.';

-- Vendedores da roleta da loja: role 'vendedor', ativos, presentes, pessoas e participantes da roleta.
create or replace function public.posvenda_vendedores_da_loja(p_empresa bigint, p_filial bigint)
returns uuid[] language sql stable set search_path = public, pg_temp as $$
  with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo)
  select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
     and eu.role = 'vendedor' and eu.usuario_id is not null
     and not eu.conta_servico and eu.participa_roleta
     and ((select count(*) from lojas) < 2
          or eu.filial_id = p_filial
          or (eu.filial_id is null and p_filial = (select id from lojas where matriz order by id limit 1)))
$$;

-- Administradores (NPS baixo, chamados): 'admin' ativos, pessoas e participantes, presentes; todos ausentes → os
-- ausentes; nenhum → o dono (pessoa). Conta de serviço nunca.
create or replace function public.posvenda_administradores(p_empresa bigint, out ids uuid[], out eh_dono boolean)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
   where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not coalesce(ausente, false)
     and not conta_servico and participa_roleta;
  eh_dono := false;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null
       and not conta_servico and participa_roleta;
  end if;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'owner' and usuario_id is not null and not conta_servico;
    eh_dono := true;
  end if;
end $$;

-- A regra (D9): a) vendedor do negócio (pessoa); e) padrão da loja (pessoa); roleta; administradores.
create or replace function public.posvenda_resolver_responsavel(p_empresa bigint, p_filial bigint, p_tipo text, p_negocio bigint,
                                                                p_dia date, p_excluir uuid[] default '{}')
returns table (responsavel_id uuid, origem text, dia date)
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_excl uuid[] := coalesce(p_excluir, '{}');
  v_teto int := public.posvenda_teto_diario(p_empresa, p_filial);
  v_hoje date := public.posvenda_dia_local(p_empresa, now());
  v_dia date := p_dia;
  v_vend uuid; v_padrao uuid; v_esc uuid;
  v_adm record;
  t int := 0;
begin
  if p_tipo not in ('acompanhamento', 'administradores') then
    raise exception 'TIPO_INVALIDO: %', p_tipo using errcode = '22023';
  end if;

  if p_tipo = 'acompanhamento' and p_filial is not null then
    -- a) o vendedor do negócio (administrador, dono ou conta de serviço como responsável do ganho NÃO contam)
    select n.responsavel_id into v_vend
      from public.negocios n
      join public.empresa_usuarios eu on eu.usuario_id = n.responsavel_id and eu.empresa_id = n.empresa_id
     where n.id = p_negocio and n.empresa_id = p_empresa and eu.ativo and eu.role = 'vendedor'
       and not eu.conta_servico
       and not (n.responsavel_id = any(v_excl))
       and not (coalesce(eu.ausente, false) and v_dia <= v_hoje);
    if v_vend is not null then
      while public.posvenda_carga_do_dia(p_empresa, v_vend, v_dia) >= v_teto and t < 60 loop
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      return query select v_vend, 'vendedor'::text, v_dia;
      return;
    end if;

    -- e) o responsável padrão da loja, se configurado (opcional) e se for uma pessoa
    begin
      v_padrao := nullif(public.config_valor_emp(p_empresa, 'posvenda', 'responsavel_padrao', p_filial) #>> '{}', '')::uuid;
    exception when others then v_padrao := null;
    end;
    if v_padrao is not null and not (v_padrao = any(v_excl))
       and exists (select 1 from public.empresa_usuarios where empresa_id = p_empresa and usuario_id = v_padrao
                    and ativo and not coalesce(ausente, false) and not conta_servico)
       and public.posvenda_carga_do_dia(p_empresa, v_padrao, v_dia) < v_teto then
      return query select v_padrao, 'padrao_loja'::text, v_dia;
      return;
    end if;

    if cardinality(array(select x from unnest(public.posvenda_vendedores_da_loja(p_empresa, p_filial)) x where not (x = any(v_excl)))) > 0 then
      t := 0;
      loop
        v_esc := public.posvenda_roleta_proximo(p_empresa, 'loja:' || p_filial, public.posvenda_vendedores_da_loja(p_empresa, p_filial), v_dia, v_teto, v_excl);
        exit when v_esc is not null or t >= 60;
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      if v_esc is not null then
        return query select v_esc, 'roleta'::text, v_dia;
        return;
      end if;
    end if;
  end if;

  select * into v_adm from public.posvenda_administradores(p_empresa);
  t := 0;
  loop
    v_esc := public.posvenda_roleta_proximo(p_empresa, 'administradores', v_adm.ids, v_dia, v_teto, v_excl);
    exit when v_esc is not null or t >= 60;
    v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
  end loop;
  if v_esc is null then
    raise exception 'SEM_RESPONSAVEL: empresa % sem vendedor, administrador ou dono ativo', p_empresa using errcode = 'P0001';
  end if;
  return query select v_esc, case when v_adm.eh_dono then 'dono' else 'administradores' end, v_dia;
end $$;

-- Passos que vencem até p_ate com o responsável ausente, desligado ou conta de serviço vão para a roleta.
create or replace function public.posvenda_reavaliar_vencendo(p_empresa bigint, p_ate date default null)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_ate date := coalesce(p_ate, public.posvenda_dia_local(p_empresa, now()));
  a record; n int := 0;
begin
  for a in
    select x.id, x.responsavel_id from public.posvenda_acompanhamentos x
      left join public.empresa_usuarios eu on eu.empresa_id = x.empresa_id and eu.usuario_id = x.responsavel_id
     where x.empresa_id = p_empresa and x.status = 'pendente'
       and public.posvenda_dia_local(p_empresa, x.previsto_para) <= v_ate
       and (eu.usuario_id is null or not eu.ativo or coalesce(eu.ausente, false) or eu.conta_servico)
     order by x.previsto_para, x.id
  loop
    perform public.posvenda_reatribuir_acompanhamento(a.id, array[a.responsavel_id], 'responsável ausente no vencimento');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Desligar, remover ou marcar como conta de serviço redistribui as pendências (só com o módulo ligado).
create or replace function public.posvenda_usuario_desligado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.core_modulo_ligado(old.empresa_id, 'posvenda') or old.usuario_id is null then
    return null;
  end if;
  if tg_op = 'DELETE' or (old.ativo and not new.ativo) or (not old.conta_servico and new.conta_servico) then
    perform public.posvenda_redistribuir_usuario(old.empresa_id, old.usuario_id);
  end if;
  return null;
end $$;

drop trigger if exists empresa_usuarios_posvenda_desligado on public.empresa_usuarios;
create trigger empresa_usuarios_posvenda_desligado
  after update of ativo, conta_servico or delete on public.empresa_usuarios
  for each row execute function public.posvenda_usuario_desligado();

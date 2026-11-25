-- PRAZO DOS CHAMADOS EM HORAS DE LOJA ABERTA (Lucas, 24/11/2026). Universal, por empresa e por loja.
--
-- Chave `posvenda.sla_horas` (config da M2/D6): "loja_aberta" (padrão, também quando a chave não existe) ou "corridas".
--   loja_aberta: as horas da 1ª resposta e da resolução só correm dentro do horário de funcionamento (core.horario, por
--                dia e por loja). A loja do chamado é a do negócio; sem loja, vale o horário da empresa.
--   corridas:    relógio comum (como na 1700).
-- Ex.: Normal (24 h / 72 h) aberto na sexta às 17h, seg–sex 9h–18h, sábado 9h–13h, domingo fechado:
--   loja_aberta → 1ª resposta na quarta às 10h, resolução na terça seguinte às 18h; corridas → sábado e segunda às 17h.
-- (A coluna posvenda_chamado_sla.horario_comercial, da C1, não é lida: a escolha é da empresa/loja, não da linha.)
--
-- Volta: supabase/scripts/volta/volta-posvenda-sla-loja-aberta.sql
-- Teste: supabase/scripts/testes/teste-posvenda-sla-loja-aberta.sql

do $$
begin
  -- posvenda_chamado_criar como saiu da 1700 (aplicada em 24/11/2026)
  if not coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc
                    where oid = 'public.posvenda_chamado_criar(bigint,bigint,text,text,bigint,text,bigint,bigint,bigint,text,uuid)'::regprocedure), '-')
         = '5bd562c4a2dd5c51cc83bbc521960b70' then
    raise exception 'posvenda_chamado_criar mudou desde a conferência de 24/11/2026; revise antes de aplicar';
  end if;
end $$;

-- Soma horas de loja aberta a partir de um instante. Anda pelos intervalos de cada dia (no fuso da empresa); o que cai
-- fora do expediente não conta. Termina exatamente no fechamento quando as horas acabam ali.
create or replace function public.core_somar_horas_abertas(p_empresa bigint, p_filial bigint, p_inicio timestamptz, p_horas numeric)
returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_fuso text := coalesce(public.empresa_fuso(p_empresa), 'America/Sao_Paulo');
  v_resta interval := make_interval(secs => greatest(coalesce(p_horas, 0), 0) * 3600);
  v_dia date := (p_inicio at time zone v_fuso)::date;
  v_ini timestamptz; v_fim timestamptz; i jsonb; k int;
begin
  if v_resta = interval '0' then return p_inicio; end if;
  for k in 1..800 loop   -- teto de segurança (~2 anos de calendário)
    for i in select x from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, p_filial, v_dia)) x
                order by (x ->> 'abre')::time loop
      v_ini := greatest((v_dia + (i ->> 'abre')::time) at time zone v_fuso, p_inicio);
      v_fim := (v_dia + (i ->> 'fecha')::time) at time zone v_fuso;
      if v_ini < v_fim then
        if v_resta <= v_fim - v_ini then return v_ini + v_resta; end if;
        v_resta := v_resta - (v_fim - v_ini);
      end if;
    end loop;
    v_dia := v_dia + 1;
  end loop;
  return p_inicio + make_interval(secs => greatest(coalesce(p_horas, 0), 0) * 3600);
end $$;

-- O vencimento de um prazo do pós-venda, conforme a escolha da empresa/loja.
create or replace function public.posvenda_sla_vence(p_empresa bigint, p_filial bigint, p_inicio timestamptz, p_horas numeric)
returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_horas is null then return null; end if;
  if coalesce(public.config_valor_emp(p_empresa, 'posvenda', 'sla_horas', p_filial) #>> '{}', 'loja_aberta') = 'corridas' then
    return p_inicio + make_interval(secs => p_horas * 3600);
  end if;
  return public.core_somar_horas_abertas(p_empresa, p_filial, p_inicio, p_horas);
end $$;

-- posvenda_chamado_criar: igual à 1700, só o cálculo do vencimento muda (posvenda_sla_vence com a loja do chamado).
create or replace function public.posvenda_chamado_criar(p_empresa bigint, p_contato bigint, p_titulo text, p_descricao text,
                                                         p_categoria bigint, p_prioridade text, p_negocio bigint,
                                                         p_acompanhamento bigint, p_resposta bigint, p_origem text, p_por uuid)
returns bigint language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_filial bigint; v_status bigint; v_num int; r record; s record; v_id bigint; v_prio text := coalesce(p_prioridade, 'normal');
  v_agora timestamptz := now();
begin
  if nullif(btrim(coalesce(p_titulo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'TITULO_OBRIGATORIO';
  end if;
  if v_prio not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception using errcode = '22023', message = 'PRIORIDADE_INVALIDA';
  end if;
  select filial_id into v_filial from public.contatos where id = p_contato and empresa_id = p_empresa;
  if not found then raise exception using errcode = 'P0002', message = 'CONTATO_NAO_ENCONTRADO'; end if;
  if p_negocio is not null then
    select filial_id into v_filial from public.negocios where id = p_negocio and empresa_id = p_empresa;
    if not found then raise exception using errcode = 'P0002', message = 'NEGOCIO_NAO_ENCONTRADO'; end if;
  end if;
  if p_acompanhamento is not null and not exists (select 1 from public.posvenda_acompanhamentos where id = p_acompanhamento and empresa_id = p_empresa) then
    raise exception using errcode = 'P0002', message = 'ACOMPANHAMENTO_NAO_ENCONTRADO';
  end if;
  if p_categoria is not null and not exists (select 1 from public.posvenda_chamado_categorias where id = p_categoria and empresa_id = p_empresa) then
    raise exception using errcode = 'P0002', message = 'CATEGORIA_NAO_ENCONTRADA';
  end if;
  perform public.posvenda_instalar(p_empresa);  -- garante status e SLA
  select id into v_status from public.posvenda_chamado_status where empresa_id = p_empresa and ativo and tipo = 'aberto' order by ordem, id limit 1;

  perform pg_advisory_xact_lock(hashtext('posvenda_chamado:' || p_empresa));
  select coalesce(max(numero), 0) + 1 into v_num from public.posvenda_chamados where empresa_id = p_empresa;

  select * into r from public.posvenda_resolver_responsavel(p_empresa, v_filial, 'administradores', p_negocio,
                                                            public.posvenda_dia_local(p_empresa, now()));
  select * into s from public.posvenda_chamado_sla
   where empresa_id = p_empresa and prioridade = v_prio and (categoria_id = p_categoria or categoria_id is null)
   order by (categoria_id is null), id limit 1;

  insert into public.posvenda_chamados (empresa_id, filial_id, numero, contato_id, negocio_id, acompanhamento_id, resposta_id,
                                        categoria_id, prioridade, status_id, titulo, descricao, responsavel_id, origem_responsavel,
                                        aberto_em, sla_resposta_vence, sla_resolucao_vence, origem, criado_por)
  values (p_empresa, v_filial, v_num, p_contato, p_negocio, p_acompanhamento, p_resposta, p_categoria, v_prio, v_status,
          btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), r.responsavel_id, r.origem, v_agora,
          public.posvenda_sla_vence(p_empresa, v_filial, v_agora, s.primeira_resposta_horas),
          public.posvenda_sla_vence(p_empresa, v_filial, v_agora, s.resolucao_horas),
          coalesce(p_origem, 'manual'), p_por)
  returning id into v_id;
  insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, para, texto, por)
  values (p_empresa, v_id, 'status', (select nome from public.posvenda_chamado_status where id = v_status), 'chamado aberto', p_por);
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['core_somar_horas_abertas(bigint,bigint,timestamptz,numeric)',
                           'posvenda_sla_vence(bigint,bigint,timestamptz,numeric)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

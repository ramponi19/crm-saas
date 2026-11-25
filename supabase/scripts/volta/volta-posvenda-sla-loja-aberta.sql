-- Volta da 20261124001800_posvenda_sla_loja_aberta: o vencimento volta a ser em horas corridas (corpo da 1700).
-- Os chamados já abertos mantêm os vencimentos gravados; a chave posvenda.sla_horas, se existir, fica (é dado da empresa).
create or replace function public.posvenda_chamado_criar(p_empresa bigint, p_contato bigint, p_titulo text, p_descricao text,
                                                         p_categoria bigint, p_prioridade text, p_negocio bigint,
                                                         p_acompanhamento bigint, p_resposta bigint, p_origem text, p_por uuid)
returns bigint language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_filial bigint; v_status bigint; v_num int; r record; s record; v_id bigint; v_prio text := coalesce(p_prioridade, 'normal');
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
                                        sla_resposta_vence, sla_resolucao_vence, origem, criado_por)
  values (p_empresa, v_filial, v_num, p_contato, p_negocio, p_acompanhamento, p_resposta, p_categoria, v_prio, v_status,
          btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), r.responsavel_id, r.origem,
          case when s.id is not null then now() + make_interval(hours => s.primeira_resposta_horas) end,
          case when s.id is not null then now() + make_interval(hours => s.resolucao_horas) end,
          coalesce(p_origem, 'manual'), p_por)
  returning id into v_id;
  insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, para, texto, por)
  values (p_empresa, v_id, 'status', (select nome from public.posvenda_chamado_status where id = v_status), 'chamado aberto', p_por);
  return v_id;
end $$;

drop function if exists public.posvenda_sla_vence(bigint, bigint, timestamptz, numeric);
drop function if exists public.core_somar_horas_abertas(bigint, bigint, timestamptz, numeric);

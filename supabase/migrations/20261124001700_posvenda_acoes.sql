-- ENTREGA C, ETAPA C7 — BLOCO 1: AS AÇÕES DO PÓS-VENDA E AS SEMENTES UNIVERSAIS (Lucas, 24/11/2026).
--
-- Tudo que mexe em fila, chamado e NPS passa por estas RPCs (a sessão não grava nas tabelas operacionais; C1).
-- Todas: sessão com empresa, sessão que pode escrever, módulo `posvenda` ligado (MODULO_DESLIGADO), e a permissão de cada
-- ação. Universais: nenhum texto, régua ou valor da JM; o que é da empresa vem da configuração dela.
--
--   posvenda_instalar(empresa)            sementes universais e idempotentes: 5 status de chamado, 6 categorias, SLA por
--                                         prioridade e a pesquisa NPS. Roda sozinha quando o módulo é instalado/ligado.
--                                         Nenhuma régua é semeada: régua é dado da empresa (a da JM entra como dado dela).
--   posvenda_registrar(acomp, acao, ...)  feito | sem_resposta | reagendar | pular. Só o responsável ou dono/admin.
--                                         sem_resposta: nova tentativa no próximo dia aberto da loja; na 3ª, encerra.
--   posvenda_nps_registrar(negocio, nota) a nota (0–10) e o comentário; marca o acompanhamento; nota até o limite
--                                         (`posvenda.nps_limite_chamado`, padrão 6) abre chamado para os administradores.
--   posvenda_chamado_abrir(...)           número sequencial por empresa, status inicial, responsável pela roleta dos
--                                         administradores (D9), SLA da categoria ou geral pela prioridade (horas corridas).
--   posvenda_chamado_mover(...)           status (primeira resposta, resolvido, reaberto), nota e, só admin, reatribuir.
--
-- Volta: supabase/scripts/volta/volta-posvenda-acoes.sql
-- Teste: supabase/scripts/testes/teste-posvenda-acoes.sql

-- ── Apoio: a sessão pode agir no pós-venda desta empresa? ─────────────────────────────────────────
create or replace function public.posvenda_exigir_sessao(p_empresa bigint)
returns void language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_empresa is null or p_empresa is distinct from public.get_empresa_id() then
    raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO';
  end if;
  if not public.sessao_pode_escrever() then
    raise exception using errcode = '42501', message = 'SOMENTE_LEITURA';
  end if;
  if not public.core_modulo_ligado(p_empresa, 'posvenda') then
    raise exception using errcode = 'P0001', message = 'MODULO_DESLIGADO: o Pós-venda não está ligado nesta empresa.';
  end if;
end $$;

-- ── 1. Sementes universais ─────────────────────────────────────────────────────────────────────────
create or replace function public.posvenda_instalar(p_empresa bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_st int := 0; v_cat int := 0; v_sla int := 0; v_pq int := 0;
begin
  if not exists (select 1 from public.posvenda_chamado_status where empresa_id = p_empresa) then
    insert into public.posvenda_chamado_status (empresa_id, nome, tipo, ordem, cor) values
      (p_empresa, 'Aberto', 'aberto', 1, 'acc'),
      (p_empresa, 'Em andamento', 'andamento', 2, 'warn'),
      (p_empresa, 'Aguardando cliente', 'aguardando_cliente', 3, 'neutro'),
      (p_empresa, 'Aguardando terceiro', 'aguardando_terceiro', 4, 'neutro'),
      (p_empresa, 'Resolvido', 'resolvido', 5, 'ok');
    get diagnostics v_st = row_count;
  end if;
  if not exists (select 1 from public.posvenda_chamado_categorias where empresa_id = p_empresa) then
    insert into public.posvenda_chamado_categorias (empresa_id, nome) values
      (p_empresa, 'Dúvida de uso'), (p_empresa, 'Defeito ou garantia'), (p_empresa, 'Troca ou devolução'),
      (p_empresa, 'Entrega'), (p_empresa, 'Financeiro ou cobrança'), (p_empresa, 'Outro');
    get diagnostics v_cat = row_count;
  end if;
  if not exists (select 1 from public.posvenda_chamado_sla where empresa_id = p_empresa) then
    insert into public.posvenda_chamado_sla (empresa_id, categoria_id, prioridade, primeira_resposta_horas, resolucao_horas) values
      (p_empresa, null, 'urgente', 2, 8), (p_empresa, null, 'alta', 8, 24),
      (p_empresa, null, 'normal', 24, 72), (p_empresa, null, 'baixa', 48, 168);
    get diagnostics v_sla = row_count;
  end if;
  if not exists (select 1 from public.posvenda_pesquisas where empresa_id = p_empresa and tipo = 'nps') then
    insert into public.posvenda_pesquisas (empresa_id, nome, tipo, pergunta, pergunta_comentario)
    values (p_empresa, 'NPS', 'nps', 'De 0 a 10, quanto você recomendaria a nossa loja a um amigo?', 'Quer contar o motivo da nota?');
    get diagnostics v_pq = row_count;
  end if;
  return jsonb_build_object('status', v_st, 'categorias', v_cat, 'sla', v_sla, 'pesquisas', v_pq);
end $$;

-- Instalar ou religar o módulo semeia o que falta (nunca duplica, nunca apaga o que a empresa mudou).
create or replace function public.posvenda_modulo_instalado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.modulo = 'posvenda' and coalesce(new.ativo, true) then
    perform public.posvenda_instalar(new.empresa_id);
  end if;
  return null;
end $$;
drop trigger if exists empresa_modulos_posvenda_instalar on public.empresa_modulos;
create trigger empresa_modulos_posvenda_instalar
  after insert or update of ativo on public.empresa_modulos
  for each row execute function public.posvenda_modulo_instalado();
-- Quem já tem o módulo ligado recebe as sementes agora (só o que falta).
select public.posvenda_instalar(empresa_id) from public.empresa_modulos where modulo = 'posvenda' and ativo;

-- ── 2. Registrar um acompanhamento ─────────────────────────────────────────────────────────────────
create or replace function public.posvenda_registrar(p_acompanhamento bigint, p_acao text, p_resultado text default null,
                                                     p_observacao text default null, p_nova_data date default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  a public.posvenda_acompanhamentos; v_user uuid := auth.uid(); v_fuso text; v_dia date; v_hora time; v_novo timestamptz;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), ''); v_res text := nullif(btrim(coalesce(p_resultado, '')), '');
begin
  select * into a from public.posvenda_acompanhamentos where id = p_acompanhamento for update;
  if a.id is null then raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO'; end if;
  perform public.posvenda_exigir_sessao(a.empresa_id);
  if a.responsavel_id is distinct from v_user and not public.is_empresa_admin(a.empresa_id) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o responsável, o dono ou um administrador registra este acompanhamento.';
  end if;
  if a.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'JA_REGISTRADO: este acompanhamento não está mais pendente.';
  end if;
  v_fuso := coalesce(public.empresa_fuso(a.empresa_id), 'America/Sao_Paulo');
  v_hora := (a.previsto_para at time zone v_fuso)::time;

  if p_acao = 'feito' then
    update public.posvenda_acompanhamentos
       set status = 'feito', resultado = v_res, observacao = concat_ws(E'\n', observacao, v_obs), feito_por = v_user, feito_em = now()
     where id = a.id;
  elsif p_acao = 'sem_resposta' then
    if a.tentativas + 1 >= 3 then
      update public.posvenda_acompanhamentos
         set status = 'sem_resposta', tentativas = tentativas + 1, observacao = concat_ws(E'\n', observacao, v_obs),
             feito_por = v_user, feito_em = now()
       where id = a.id;
    else
      v_dia := public.core_proximo_dia_aberto(a.empresa_id, a.filial_id, public.posvenda_dia_local(a.empresa_id, now()));
      v_novo := (v_dia + public.core_hora_no_expediente(a.empresa_id, a.filial_id, v_dia, v_hora)) at time zone v_fuso;
      update public.posvenda_acompanhamentos
         set tentativas = tentativas + 1, previsto_para = v_novo,
             observacao = concat_ws(E'\n', observacao, format('sem resposta (tentativa %s) — nova tentativa em %s', a.tentativas + 1, to_char(v_dia, 'DD/MM')), v_obs)
       where id = a.id;
    end if;
  elsif p_acao = 'reagendar' then
    if p_nova_data is null or p_nova_data < public.posvenda_dia_local(a.empresa_id, now()) then
      raise exception using errcode = 'P0001', message = 'DATA_INVALIDA: informe uma data de hoje em diante.';
    end if;
    v_dia := public.core_dia_aberto(a.empresa_id, a.filial_id, p_nova_data);
    v_novo := (v_dia + public.core_hora_no_expediente(a.empresa_id, a.filial_id, v_dia, v_hora)) at time zone v_fuso;
    update public.posvenda_acompanhamentos
       set previsto_para = v_novo,
           observacao = concat_ws(E'\n', observacao, format('reagendado de %s para %s', to_char(a.previsto_para at time zone v_fuso, 'DD/MM'), to_char(v_dia, 'DD/MM')), v_obs)
     where id = a.id;
  elsif p_acao = 'pular' then
    if v_res is null or length(v_res) < 3 then
      raise exception using errcode = 'P0001', message = 'MOTIVO_OBRIGATORIO: diga por que o passo não será feito.';
    end if;
    update public.posvenda_acompanhamentos
       set status = 'pulado', motivo = v_res, observacao = concat_ws(E'\n', observacao, v_obs), feito_por = v_user, feito_em = now()
     where id = a.id;
  else
    raise exception using errcode = '22023', message = 'ACAO_INVALIDA: use feito, sem_resposta, reagendar ou pular.';
  end if;

  return (select jsonb_build_object('id', id, 'status', status, 'previsto_para', previsto_para, 'tentativas', tentativas)
            from public.posvenda_acompanhamentos where id = a.id);
end $$;

-- ── 3. Chamados ────────────────────────────────────────────────────────────────────────────────────
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

create or replace function public.posvenda_chamado_abrir(p_contato bigint, p_titulo text, p_descricao text default null,
                                                         p_categoria bigint default null, p_prioridade text default 'normal',
                                                         p_negocio bigint default null, p_acompanhamento bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_emp bigint := public.get_empresa_id(); v_id bigint;
begin
  perform public.posvenda_exigir_sessao(v_emp);
  v_id := public.posvenda_chamado_criar(v_emp, p_contato, p_titulo, p_descricao, p_categoria, p_prioridade, p_negocio,
                                        p_acompanhamento, null, 'manual', auth.uid());
  return (select jsonb_build_object('id', id, 'numero', numero, 'responsavel_id', responsavel_id) from public.posvenda_chamados where id = v_id);
end $$;

create or replace function public.posvenda_chamado_mover(p_chamado bigint, p_status bigint default null, p_texto text default null,
                                                         p_responsavel uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.posvenda_chamados; v_user uuid := auth.uid(); v_admin boolean; s_de record; s_para record;
  v_txt text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  select * into c from public.posvenda_chamados where id = p_chamado for update;
  if c.id is null then raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO'; end if;
  perform public.posvenda_exigir_sessao(c.empresa_id);
  v_admin := public.is_empresa_admin(c.empresa_id);
  if c.responsavel_id is distinct from v_user and not v_admin then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o responsável, o dono ou um administrador mexe neste chamado.';
  end if;

  if p_status is not null and p_status is distinct from c.status_id then
    select id, nome, tipo into s_de from public.posvenda_chamado_status where id = c.status_id;
    select id, nome, tipo into s_para from public.posvenda_chamado_status where id = p_status and empresa_id = c.empresa_id and ativo;
    if s_para.id is null then raise exception using errcode = 'P0002', message = 'STATUS_NAO_ENCONTRADO'; end if;
    update public.posvenda_chamados
       set status_id = s_para.id,
           primeira_resposta_em = coalesce(primeira_resposta_em, case when s_para.tipo <> 'aberto' then now() end),
           resolvido_em = case when s_para.tipo = 'resolvido' then now() else null end
     where id = c.id;
    insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, de, para, texto, por)
    values (c.empresa_id, c.id, 'status', s_de.nome, s_para.nome, v_txt, v_user);
  elsif v_txt is not null then
    update public.posvenda_chamados set primeira_resposta_em = coalesce(primeira_resposta_em, now()) where id = c.id;
    insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, texto, por) values (c.empresa_id, c.id, 'nota', v_txt, v_user);
  end if;

  if p_responsavel is not null and p_responsavel is distinct from c.responsavel_id then
    if not v_admin then
      raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o dono ou um administrador passa o chamado para outra pessoa.';
    end if;
    if not exists (select 1 from public.empresa_usuarios where empresa_id = c.empresa_id and usuario_id = p_responsavel and ativo and not conta_servico) then
      raise exception using errcode = 'P0002', message = 'RESPONSAVEL_INVALIDO';
    end if;
    update public.posvenda_chamados set responsavel_id = p_responsavel, origem_responsavel = 'manual' where id = c.id;
    insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, de, para, por)
    values (c.empresa_id, c.id, 'atribuicao', c.responsavel_id::text, p_responsavel::text, v_user);
  end if;

  return (select jsonb_build_object('id', id, 'status_id', status_id, 'responsavel_id', responsavel_id,
                                    'primeira_resposta_em', primeira_resposta_em, 'resolvido_em', resolvido_em)
            from public.posvenda_chamados where id = c.id);
end $$;

-- ── 4. NPS manual ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.posvenda_nps_registrar(p_negocio bigint, p_nota int, p_comentario text default null,
                                                         p_acompanhamento bigint default null, p_canal text default 'manual')
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  n public.negocios; v_user uuid := auth.uid(); v_pq bigint; v_resp bigint; v_lim int; v_cham bigint; a public.posvenda_acompanhamentos;
begin
  select * into n from public.negocios where id = p_negocio for update;
  if n.id is null then raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO'; end if;
  perform public.posvenda_exigir_sessao(n.empresa_id);
  if n.contato_id is null then raise exception using errcode = 'P0001', message = 'SEM_CONTATO: o negócio não tem cliente.'; end if;
  if p_nota is null or p_nota < 0 or p_nota > 10 then
    raise exception using errcode = 'P0001', message = 'NOTA_INVALIDA: de 0 a 10.';
  end if;
  if p_acompanhamento is not null then
    select * into a from public.posvenda_acompanhamentos where id = p_acompanhamento and negocio_id = n.id for update;
    if a.id is null then raise exception using errcode = 'P0002', message = 'ACOMPANHAMENTO_NAO_ENCONTRADO'; end if;
    if a.responsavel_id is distinct from v_user and not public.is_empresa_admin(n.empresa_id) then
      raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
    end if;
  elsif n.responsavel_id is distinct from v_user and not public.is_empresa_admin(n.empresa_id) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o responsável pelo cliente, o dono ou um administrador registra a nota.';
  end if;

  perform public.posvenda_instalar(n.empresa_id);
  select id into v_pq from public.posvenda_pesquisas where empresa_id = n.empresa_id and tipo = 'nps' and ativo order by id limit 1;
  insert into public.posvenda_respostas (empresa_id, filial_id, contato_id, negocio_id, acompanhamento_id, pesquisa_id, nota, comentario,
                                         canal, vendedor_id, registrada_por)
  values (n.empresa_id, n.filial_id, n.contato_id, n.id, p_acompanhamento, v_pq, p_nota, nullif(btrim(coalesce(p_comentario, '')), ''),
          coalesce(p_canal, 'manual'), n.responsavel_id, v_user)
  on conflict (negocio_id, pesquisa_id) do update
     set nota = excluded.nota, comentario = excluded.comentario, respondida_em = now(), registrada_por = excluded.registrada_por,
         acompanhamento_id = coalesce(excluded.acompanhamento_id, posvenda_respostas.acompanhamento_id)
  returning id into v_resp;

  if a.id is not null and a.status = 'pendente' then
    update public.posvenda_acompanhamentos set status = 'feito', resultado = 'nota ' || p_nota, feito_por = v_user, feito_em = now()
     where id = a.id;
  end if;

  v_lim := coalesce(nullif(public.config_valor_emp(n.empresa_id, 'posvenda', 'nps_limite_chamado', n.filial_id) #>> '{}', '')::int, 6);
  if p_nota <= v_lim and not exists (select 1 from public.posvenda_chamados where resposta_id = v_resp) then
    v_cham := public.posvenda_chamado_criar(n.empresa_id, n.contato_id, 'NPS ' || p_nota || ' — falar com o cliente',
                                            nullif(btrim(coalesce(p_comentario, '')), ''), null,
                                            case when p_nota <= 3 then 'alta' else 'normal' end, n.id, p_acompanhamento, v_resp, 'nps', v_user);
  end if;
  return jsonb_build_object('resposta_id', v_resp, 'chamado_id', v_cham);
end $$;

-- ── Permissões: as ações são da sessão; as internas só do servidor ────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array['posvenda_exigir_sessao(bigint)', 'posvenda_instalar(bigint)', 'posvenda_modulo_instalado()',
                           'posvenda_chamado_criar(bigint,bigint,text,text,bigint,text,bigint,bigint,bigint,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['posvenda_registrar(bigint,text,text,text,date)',
                           'posvenda_chamado_abrir(bigint,text,text,bigint,text,bigint,bigint)',
                           'posvenda_chamado_mover(bigint,bigint,text,uuid)',
                           'posvenda_nps_registrar(bigint,integer,text,bigint,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

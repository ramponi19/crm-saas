-- M1 — A VENDA FECHADA NÃO SE DESFAZ SOZINHA (23/11/2026, docs/design-pos-venda.md §0).
--
-- O problema: a `core_negocio_do_canal` (20261105001400) decide em que negócio entra a mensagem
-- que chega. Sem negócio aberto e sem ganho dentro da janela de pós-venda, ela REABRIA o negócio
-- mais recente do contato na loja — inclusive um GANHO — e zerava o `ganho_em`. A venda sumia do
-- status (8 casos na JM entre 06/11 e 23/11; o estado anterior ficou em negocio_historico.detalhe).
-- Com a conciliação de vendas (138 ganhos com a data do pedido, quase todos com mais de 30 dias),
-- cada "oi" de cliente antigo desfaria uma venda.
--
-- Agora:
--   core_negocio_do_canal     ordem nova (só o passo 3 muda):
--                               1. aberto e ativo → entra nele (igual);
--                               2. ganho dentro da janela (retorno_cliente.pos_venda_dias) → entra
--                                  nele, é o pós-venda (igual);
--                               3. o mais recente da loja:
--                                  - GANHO (fora da janela ou arquivado) → NÃO é tocado: nasce um
--                                    negócio NOVO na primeira etapa do funil padrão, para o mesmo
--                                    contato, com o histórico 'novo_apos_ganho' apontando o ganho;
--                                  - perdido / aberto arquivado → reabre o mesmo (igual);
--                               4. sem negócio na loja → cria (igual).
--                             Mensagem enviada pela loja (p_so_existente) continua sem abrir nada.
--   negocios_ganho_protegido  gatilho BEFORE UPDATE OF status, ganho_em: um negócio GANHO não sai
--                             do ganho nem tem o ganho_em trocado ou zerado. Exceções:
--                               - a RPC reabrir_negocio (marca a transação com o id do negócio);
--                               - a junção de negócios (lib/juntar-negocios.ts), que roda com a
--                                 chave de serviço, arquiva o que sai (_lead.ativo = false) e
--                                 guarda o fechamento no histórico do que fica (`_juntado`).
--                             Preencher um ganho_em que estava nulo continua permitido (correção
--                             de data faltando). Entrar no ganho continua livre (tela, conciliação).
--                             Entrar no ganho sem data ganha a data de agora.
--   reabrir_negocio(id, motivo)  só dono/admin da empresa (is_empresa_admin), motivo obrigatório;
--                             volta para a primeira etapa do funil do negócio com status aberto e
--                             grava 'reaberto_manual' em negocio_historico com quem, o motivo e o
--                             estado anterior.
--
-- Volta: supabase/scripts/volta/volta-ganho-protegido.sql.

-- ─── 1. Roteamento da mensagem ───────────────────────────────────────────────────────────────────
create or replace function public.core_negocio_do_canal(
  p_empresa bigint, p_contato bigint, p_filial bigint, p_primeira_msg text default null,
  p_so_existente boolean default false, p_origem text default null, p_origem_id text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_dias int; n record;
begin
  -- Duas mensagens do mesmo contato na mesma loja chegando juntas: a segunda espera a
  -- primeira e encontra o negócio que ela abriu ou reabriu.
  perform pg_advisory_xact_lock(hashtext('negocio:' || p_empresa || ':' || p_contato || ':' || coalesce(p_filial, -1)));

  select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;

  -- 1. aberto e ativo, em qualquer funil
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'aberto' and n2.ativo
   order by (n2.funil_id is not distinct from v_funil) desc, n2.created_at desc, n2.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  -- 2. ganho recente (pós-venda)
  select coalesce((select (c.valor ->> 'pos_venda_dias')::int from configuracoes_sistema c
                    where c.empresa_id = p_empresa and c.chave = 'retorno_cliente'
                      and (c.valor ->> 'pos_venda_dias') ~ '^\d{1,3}$'), 30) into v_dias;
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'ganho' and n2.ativo and n2.ganho_em >= now() - make_interval(days => v_dias)
   order by n2.ganho_em desc, n2.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  -- 3. o mais recente da loja
  select n2.* into n from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
   order by n2.created_at desc, n2.id desc limit 1;
  if p_so_existente then return n.id; end if;

  -- 4. sem negócio na loja (ou o mais recente é uma VENDA FECHADA): cria um novo.
  --    O ganho fica como está — é a compra do cliente, não um card para reabrir.
  if n.id is null or n.status = 'ganho' then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg,
                                                                              'origem', p_origem, 'origem_id', p_origem_id))))
    returning id into v_negocio;
    if n.id is not null then
      insert into negocio_historico (empresa_id, negocio_id, para_etapa_id, acao, detalhe)
      values (p_empresa, v_negocio, v_etapa, 'novo_apos_ganho',
              jsonb_build_object('ganho_anterior', n.id, 'ganho_em', n.ganho_em));
    end if;
    return v_negocio;
  end if;

  -- 3. perdido ou arquivado: reabre o MESMO — primeiro o histórico com o fechamento, depois limpa
  v_funil_neg := coalesce(n.funil_id, v_funil);
  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, detalhe)
  values (p_empresa, n.id, n.etapa_id, coalesce(v_etapa, n.etapa_id), 'reaberto_por_mensagem',
          jsonb_strip_nulls(jsonb_build_object('status', n.status, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                                               'motivo_perda_id', n.motivo_perda_id, 'valor_estimado', n.valor_estimado,
                                               'ativo', n.ativo)));
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = n.id;
  return n.id;
end $function$;

-- ─── 2. Trava no banco ───────────────────────────────────────────────────────────────────────────
create or replace function public.core_negocio_ganho_protegido()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Entrar no ganho sem data: a data é agora (a Edge usa ganho_em para a janela de pós-venda).
  if new.status = 'ganho' and new.ganho_em is null and (tg_op = 'INSERT' or old.status is distinct from 'ganho') then
    new.ganho_em := now();
  end if;
  if tg_op = 'INSERT' or old.status is distinct from 'ganho' then return new; end if;

  -- Daqui em diante o negócio JÁ ERA ganho.
  if new.status = 'ganho' and (old.ganho_em is null or new.ganho_em is not distinct from old.ganho_em) then
    return new;  -- continua ganho, com a mesma data (ou preenchendo a que faltava)
  end if;

  -- Exceção 1: a RPC reabrir_negocio marcou ESTA transação com ESTE negócio.
  if coalesce(current_setting('nexus.reabrir_negocio', true), '') = old.id::text then
    return new;
  end if;

  -- Exceção 2: a junção de negócios (chave de serviço) arquiva o que sai e leva o fechamento para
  -- o histórico do que fica — o ganho não some, muda de negócio.
  if current_user = 'service_role'
     and new.dados ? '_juntado'
     and coalesce(new.dados -> '_lead' ->> 'ativo', 'true') = 'false' then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'GANHO_PROTEGIDO: o negócio ' || old.id || ' é uma venda fechada e não pode sair do ganho nem ter a data do ganho alterada.',
    hint = 'Use reabrir_negocio(negocio_id, motivo) — só dono ou administrador.';
end $function$;

drop trigger if exists negocios_ganho_protegido on public.negocios;
create trigger negocios_ganho_protegido
  before insert or update of status, ganho_em on public.negocios
  for each row execute function public.core_negocio_ganho_protegido();

-- ─── 3. Reabrir uma venda, com permissão e motivo ────────────────────────────────────────────────
create or replace function public.reabrir_negocio(p_negocio bigint, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n negocios%rowtype; v_etapa bigint; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into n from negocios where id = p_negocio for update;
  if n.id is null or n.empresa_id is distinct from get_empresa_id() then
    raise exception using errcode = 'P0002', message = 'NEGOCIO_NAO_ENCONTRADO';
  end if;
  if not sessao_pode_escrever() then
    raise exception using errcode = '42501', message = 'SOMENTE_LEITURA';
  end if;
  if not is_empresa_admin(n.empresa_id) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o dono ou um administrador reabre uma venda fechada.';
  end if;
  if n.status <> 'ganho' then
    raise exception using errcode = 'P0001', message = 'NAO_E_GANHO: o negócio não está ganho.';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception using errcode = 'P0001', message = 'MOTIVO_OBRIGATORIO: informe o motivo da reabertura (5 caracteres ou mais).';
  end if;

  select e.id into v_etapa from funil_etapas e
   where e.funil_id = n.funil_id and e.ativo and coalesce(e.tipo, 'normal') not in ('ganho', 'perdido')
   order by e.ordem, e.id limit 1;

  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, por_usuario, detalhe)
  values (n.empresa_id, n.id, n.etapa_id, coalesce(v_etapa, n.etapa_id), 'reaberto_manual', auth.uid(),
          jsonb_strip_nulls(jsonb_build_object('motivo', v_motivo, 'status', n.status, 'ganho_em', n.ganho_em,
                                               'valor_estimado', n.valor_estimado, 'etapa_id', n.etapa_id)));

  perform set_config('nexus.reabrir_negocio', n.id::text, true);
  update negocios set status = 'aberto', ganho_em = null, etapa_id = coalesce(v_etapa, etapa_id)
   where id = n.id;
  perform set_config('nexus.reabrir_negocio', '', true);

  return jsonb_build_object('ok', true, 'negocio_id', n.id, 'etapa_id', coalesce(v_etapa, n.etapa_id));
end $function$;

revoke all on function public.reabrir_negocio(bigint, text) from public, anon;
grant execute on function public.reabrir_negocio(bigint, text) to authenticated, service_role;
revoke all on function public.core_negocio_ganho_protegido() from public, anon, authenticated;

comment on function public.reabrir_negocio(bigint, text) is
  'Reabre uma venda fechada (ganho → aberto, primeira etapa do funil). Só dono/admin, motivo obrigatório; grava reaberto_manual no histórico. Único caminho que passa pelo gatilho negocios_ganho_protegido (23/11/2026).';

-- M3 — CORRIGIR A DATA DE UMA VENDA JÁ FECHADA (23/11/2026; docs/design-pos-venda.md §2.3, decisão do Lucas).
--
-- A M1 trava ganho_em de um negócio ganho (gatilho negocios_ganho_protegido). A data, porém, às vezes está
-- errada: a equipe marca o ganho dias depois da venda (ex.: 5096, ganho em 23/11 com pedido em 15/10), e a
-- data desloca a régua de pós-venda e a janela da Edge. Esta migração cria o ÚNICO caminho para trocá-la:
--
--   corrigir_data_venda(p_negocio, p_nova_data, p_motivo)
--     - só dono ou administrador (is_empresa_admin, que cobre o superadmin impersonando), motivo ≥ 5 letras,
--       sessão que pode escrever, negócio da empresa da sessão e com status ganho;
--     - muda SÓ ganho_em: status e etapa ficam (a RPC não recebe nada além da data);
--     - data futura → DATA_FUTURA; antes de 2024 → DATA_ANTIGA (o grupo de pedidos da JM começa em mar/2024);
--       antes da entrada da empresa no Nexus ou da criação do negócio → ACEITA com aviso (há vendas reais
--       anteriores: a JM entrou em 19/06/2026 e tem pedidos de maio e junho); mesmo dia → DATA_IGUAL;
--     - hora gravada: meio-dia no fuso da empresa; se a data é hoje, o instante atual;
--     - histórico: negocio_historico 'data_venda_corrigida' com usuário, data anterior, nova, motivo e avisos.
--   NÃO usa reabrir_negocio (que tira do ganho): a venda nunca deixa de estar fechada.
--
-- No gatilho da M1 entra a exceção 3: nexus.corrigir_data_venda = id do negócio, marcada pela RPC só durante
-- o UPDATE dela (set_config local à transação, limpo logo depois). Vale só para aquele negócio e só para
-- trocar a data: o negócio tem de continuar ganho, na mesma etapa, com data preenchida.
--
-- Pós-venda (M6): reposicionar os passos pendentes da jornada quando a data muda. A função ainda não existe;
-- a RPC já chama posvenda_reancorar_jornada(bigint) se ela existir (to_regprocedure), sem precisar mudar
-- quando a M6 a criar. O ciclo de vida (M4) recalcula pelo próprio gatilho em negocios.ganho_em.
--
-- Volta: supabase/scripts/volta/volta-corrigir-data-venda.sql.

-- ─── 1. Gatilho da M1 com a exceção 3 ────────────────────────────────────────────────────────────
do $guarda$
begin
  -- o corpo em produção tem de ser o da M1 (20261123000200): senão para, em vez de sobrescrever outra versão
  -- sem os \r: o arquivo é CRLF e a produção recebeu o corpo sem eles (o replay local falhava; 23/11/2026)
  if md5(replace((select prosrc from pg_proc where oid = 'public.core_negocio_ganho_protegido()'::regprocedure), E'\r', ''))
     <> '6d9c6eeb9cb543356ad91b4f4327ffc4' then
    raise exception 'M3: core_negocio_ganho_protegido em produção não é o da M1 — conferir antes de aplicar';
  end if;
end $guarda$;

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

  -- Exceção 3 (M3): a RPC corrigir_data_venda marcou ESTA transação com ESTE negócio — e só a DATA muda:
  -- continua ganho, na mesma etapa, com data preenchida.
  if coalesce(current_setting('nexus.corrigir_data_venda', true), '') = old.id::text
     and new.status = 'ganho'
     and new.etapa_id is not distinct from old.etapa_id
     and new.ganho_em is not null then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'GANHO_PROTEGIDO: o negócio ' || old.id || ' é uma venda fechada e não pode sair do ganho nem ter a data do ganho alterada.',
    hint = 'Use reabrir_negocio(negocio_id, motivo) para reabrir, ou corrigir_data_venda(negocio_id, data, motivo) para a data — só dono ou administrador.';
end $function$;
revoke all on function public.core_negocio_ganho_protegido() from public, anon, authenticated;

-- ─── 2. A RPC ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.corrigir_data_venda(p_negocio bigint, p_nova_data date, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n         negocios%rowtype;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_fuso    text;
  v_hoje    date;
  v_antiga  date;
  v_entrada date;
  v_novo    timestamptz;
  v_avisos  jsonb := '[]';
begin
  select * into n from negocios where id = p_negocio for update;
  if n.id is null or n.empresa_id is distinct from get_empresa_id() then
    raise exception using errcode = 'P0002', message = 'NEGOCIO_NAO_ENCONTRADO';
  end if;
  if not sessao_pode_escrever() then
    raise exception using errcode = '42501', message = 'SOMENTE_LEITURA';
  end if;
  if not is_empresa_admin(n.empresa_id) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o dono ou um administrador corrige a data de uma venda.';
  end if;
  if n.status <> 'ganho' then
    raise exception using errcode = 'P0001', message = 'NAO_E_GANHO: só a data de uma venda fechada (ganho) pode ser corrigida.';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception using errcode = 'P0001', message = 'MOTIVO_OBRIGATORIO: informe o motivo da correção (5 caracteres ou mais).';
  end if;

  v_fuso := coalesce(empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  v_hoje := (now() at time zone v_fuso)::date;
  if p_nova_data is null then
    raise exception using errcode = 'P0001', message = 'DATA_INVALIDA: informe a data da venda.';
  end if;
  if p_nova_data > v_hoje then
    raise exception using errcode = 'P0001', message = 'DATA_FUTURA: a data da venda não pode ser depois de hoje.';
  end if;
  if p_nova_data < date '2024-01-01' then
    raise exception using errcode = 'P0001', message = 'DATA_ANTIGA: datas antes de 2024 não são aceitas.';
  end if;
  v_antiga := (n.ganho_em at time zone v_fuso)::date;
  if p_nova_data = v_antiga then
    raise exception using errcode = 'P0001', message = 'DATA_IGUAL: a venda já está nessa data.';
  end if;

  -- Avisos (não barram: há vendas reais anteriores ao Nexus e ao card)
  select (e.created_at at time zone v_fuso)::date into v_entrada from empresas e where e.id = n.empresa_id;
  if p_nova_data < v_entrada then
    v_avisos := v_avisos || to_jsonb('data anterior à entrada da empresa no Nexus (' || to_char(v_entrada, 'DD/MM/YYYY') || ')');
  end if;
  if p_nova_data < (n.created_at at time zone v_fuso)::date then
    v_avisos := v_avisos || to_jsonb('data anterior à criação do negócio (' || to_char((n.created_at at time zone v_fuso)::date, 'DD/MM/YYYY') || ')');
  end if;

  v_novo := case when p_nova_data = v_hoje then now()
                 else (p_nova_data + time '12:00') at time zone v_fuso end;

  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, por_usuario, detalhe)
  values (n.empresa_id, n.id, n.etapa_id, n.etapa_id, 'data_venda_corrigida', auth.uid(),
          jsonb_build_object('motivo', v_motivo, 'ganho_em_anterior', n.ganho_em, 'ganho_em_novo', v_novo,
                             'data_anterior', v_antiga, 'data_nova', p_nova_data, 'avisos', v_avisos));

  perform set_config('nexus.corrigir_data_venda', n.id::text, true);
  update negocios set ganho_em = v_novo where id = n.id and status = 'ganho';
  perform set_config('nexus.corrigir_data_venda', '', true);

  -- Pós-venda (M6): reposiciona os passos pendentes da jornada, quando a função existir.
  if to_regprocedure('public.posvenda_reancorar_jornada(bigint)') is not null then
    execute 'select public.posvenda_reancorar_jornada($1)' using n.id;
  end if;

  return jsonb_build_object('ok', true, 'negocio_id', n.id, 'ganho_em_anterior', n.ganho_em, 'ganho_em_novo', v_novo,
                            'avisos', v_avisos);
end $function$;

revoke all on function public.corrigir_data_venda(bigint, date, text) from public, anon;
grant execute on function public.corrigir_data_venda(bigint, date, text) to authenticated, service_role;

comment on function public.corrigir_data_venda(bigint, date, text) is
  'Corrige a data (ganho_em) de uma venda fechada, sem tirá-la do ganho. Só dono/admin, motivo obrigatório; grava data_venda_corrigida no histórico. Único caminho, além de reabrir_negocio, que passa pela trava da M1 (23/11/2026).';

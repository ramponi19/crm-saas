-- =====================================================================================
-- SNAPSHOT DE PRODUÇÃO 19/10/2026, NÃO EDITAR; TODA MUDANÇA VAI EM MIGRAÇÃO NOVA.
--
-- Origem: backup lógico de 19/10/2026 13:47 (C:\Ferramentas\claude\backup-crm-saas.ps1,
-- pg_dump 18.4, servidor 17.6), projeto guiuzbcqkvelqcuogxtd.
-- Conteúdo: schema public inteiro, só estrutura (tabelas, sequences, funções, triggers, views,
-- policies, índices, constraints, RLS), gerado com
--   pg_restore --schema-only --no-owner --no-privileges -n public projeto.dump
-- (equivale a pg_dump --schema-only --no-owner --no-privileges -n public), mais o gatilho
-- on_auth_user_created de auth.users e o job do pg_cron, no fim.
-- Fora: schemas backup e evolution, supabase_migrations, dados e privilégios (GRANT).
-- As linhas \restrict / \unrestrict do pg_dump 18 foram tiradas (meta-comando do psql).
-- Pressupõe um projeto Supabase: schemas auth, storage e extensions, papéis anon,
-- authenticated e service_role (a view storage_orfaos lê storage.objects; uma FK aponta para auth.users).
-- Contagem de produção nesta data: 95 tabelas, 53 funções, 49 triggers em public, 5 views.
-- =====================================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: assistente_status_conversas(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assistente_status_conversas(p_empresa bigint) RETURNS TABLE(lead_id bigint, ultima_recebida timestamp with time zone, ultima_enviada timestamp with time zone, mensagens integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select m.lead_id,
         max(m.created_at) filter (where m.direcao = 'recebida'),
         max(m.created_at) filter (where m.direcao = 'enviada'),
         count(*)::int
  from public.lead_mensagens m
  where m.empresa_id = p_empresa
  group by m.lead_id
$$;


--
-- Name: FUNCTION assistente_status_conversas(p_empresa bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.assistente_status_conversas(p_empresa bigint) IS 'Por lead: ultima fala do cliente, ultima fala da loja e total de mensagens, lidos de lead_mensagens. Base do assistente do CRM; a rota filtra pelos leads visiveis ao usuario.';


--
-- Name: buscar_lead_por_numero(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_lead_por_numero(p_id bigint) RETURNS TABLE(id bigint, nome text, telefone text, produto_interessado text, loja text, outra_loja boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint := get_empresa_id();
  v_papel text;
  v_super boolean;
  v_vis   bigint[] := filiais_visiveis();
begin
  if v_emp is null or auth.uid() is null then return; end if;
  select eu.role into v_papel from empresa_usuarios eu
   where eu.usuario_id = auth.uid() and eu.empresa_id = v_emp and eu.ativo limit 1;
  select coalesce(u.is_super_admin, false) into v_super from usuarios u where u.id = auth.uid();
  if v_papel is null and not coalesce(v_super, false) then return; end if;

  return query
  select l.id, l.nome::text, l.telefone::text, l.produto_interessado::text,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome)::text,
         not (l.filial_id is null or l.filial_id = any (v_vis))
  from leads l
  left join filiais f on f.id = l.filial_id
  where l.id = p_id and l.empresa_id = v_emp and l.ativo
    and (coalesce(v_super, false) or v_papel in ('owner', 'admin')
         or l.filial_id is null or l.filial_id = any (v_vis));
end $$;


--
-- Name: chat_marcar_lido(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_marcar_lido(p_conversa text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_emp bigint;
begin
  v_emp := get_empresa_id();
  if v_emp is null or auth.uid() is null then return; end if;

  insert into public.chat_leituras (empresa_id, usuario_id, conversa, lido_ate)
  values (v_emp, auth.uid(), p_conversa, now())
  on conflict (empresa_id, usuario_id, conversa)
  -- greatest: abrir uma conversa velha nao pode ANDAR PARA TRAS o que ja foi
  -- lido, senao mensagem ja vista volta a contar como nova.
  do update set lido_ate = greatest(public.chat_leituras.lido_ate, excluded.lido_ate);
end $$;


--
-- Name: chat_nao_lidas_por_conversa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_nao_lidas_por_conversa() RETURNS TABLE(conversa text, nao_lidas bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with visiveis as (
    select m.*,
           case when m.tipo = 'mural' then 'mural'
                else 'direto:' || m.autor_id::text end as conv
    from public.mensagens_internas m
    where m.autor_id <> (select auth.uid())
      and (m.tipo = 'mural' or m.destinatario_id = (select auth.uid()))
  )
  select v.conv,
         count(*)
  from visiveis v
  left join public.chat_leituras l
    on l.usuario_id = (select auth.uid())
   and l.empresa_id = v.empresa_id
   and l.conversa   = v.conv
  where v.created_at > coalesce(l.lido_ate, '-infinity'::timestamptz)
  group by v.conv;
$$;


--
-- Name: encerrar_impersonacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encerrar_impersonacao() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_is_super boolean;
begin
  -- Mesma checagem de `set_impersonation`: só superadmin mexe nisso. Sem ela, a
  -- função (que é SECURITY DEFINER, e portanto passa por cima do gatilho
  -- prevent_privilege_escalation) seria um caminho aberto para qualquer um.
  select is_super_admin into v_is_super from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  update public.usuarios
     set impersonando_empresa_id = null,
         impersonando_expires_at = null
   where id = auth.uid();
end;
$$;


--
-- Name: enforce_lead_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_lead_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  limite_val int;
  atual_val  int;
BEGIN
  SELECT pc.limite_leads INTO limite_val
    FROM planos_config pc
    JOIN empresas e ON e.plano = pc.id
    WHERE e.id = NEW.empresa_id;
  IF limite_val IS NOT NULL THEN
    SELECT COUNT(*) INTO atual_val FROM leads WHERE empresa_id = NEW.empresa_id;
    IF atual_val >= limite_val THEN
      RAISE EXCEPTION 'LEAD_LIMIT_REACHED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: filiais_visiveis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.filiais_visiveis() RETURNS bigint[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_emp   bigint;
  v_qtd   int;
  v_sel   bigint;
  v_papel text;
  v_casa  bigint;
  v_super boolean;
  v_todas bigint[];
begin
  v_emp := get_empresa_id();
  if v_emp is null then return array[]::bigint[]; end if;

  select count(*) into v_qtd from filiais where empresa_id = v_emp and ativo;
  select coalesce(array_agg(id), array[]::bigint[]) into v_todas
    from filiais where empresa_id = v_emp;

  -- Uma loja (ou nenhuma): nada a separar.
  if v_qtd < 2 then return v_todas || 0::bigint; end if;

  select is_super_admin into v_super from usuarios where id = auth.uid();
  select role, filial_id into v_papel, v_casa
    from empresa_usuarios
    where usuario_id = auth.uid() and empresa_id = v_emp and ativo
    limit 1;

  -- Dono, admin e suporte escolhem: uma loja, ou a rede inteira.
  if coalesce(v_super, false) or v_papel in ('owner', 'admin') then
    v_sel := filial_atual();
    if v_sel is not null then return array[v_sel]; end if;
    return v_todas || 0::bigint;
  end if;

  /**
   * Quem nao e dono nem admin ve a PROPRIA loja, e o seletor nao muda isso.
   *
   * Falha fechado por escolha, na mesma linha de lib/escopo.ts: papel que nao
   * pude determinar restringe. Sem loja atribuida, a pessoa fica na matriz — e a
   * tela de filiais mostra quantas pessoas estao nessa situacao, para o dono
   * atribuir. Se nao houver nem matriz, nao ve nada.
   */
  v_casa := coalesce(
    v_casa,
    (select id from filiais where empresa_id = v_emp and matriz and ativo limit 1)
  );
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $$;


--
-- Name: filial_atual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.filial_atual() RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_emp bigint; v_sel bigint;
begin
  v_emp := get_empresa_id();
  if v_emp is null then return null; end if;

  select u.filial_atual_id into v_sel from usuarios u where u.id = auth.uid();
  if v_sel is null then return null; end if;

  -- Selecao velha (loja desativada, ou de outra empresa) vale como "Rede", nunca
  -- como acesso a uma loja que ela nao deveria mais ver.
  if not exists (
    select 1 from filiais f where f.id = v_sel and f.empresa_id = v_emp and f.ativo
  ) then
    return null;
  end if;

  return v_sel;
end $$;


--
-- Name: filial_gravacao(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.filial_gravacao(p_empresa bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v bigint;
begin
  -- 1) A loja escolhida no topo.
  v := filial_atual();
  if v is not null and exists (
    select 1 from filiais f where f.id = v and f.empresa_id = p_empresa
  ) then
    return v;
  end if;

  -- 2) A loja de quem esta gravando.
  select eu.filial_id into v
    from empresa_usuarios eu
    where eu.usuario_id = auth.uid() and eu.empresa_id = p_empresa and eu.ativo
    limit 1;
  if v is not null then return v; end if;

  -- 3) Sem sessao ou sem loja: a matriz, que e declarada justamente para isto.
  select f.id into v from filiais f
    where f.empresa_id = p_empresa and f.matriz and f.ativo limit 1;
  if v is not null then return v; end if;

  -- 4) Ultimo recurso: qualquer loja ativa. Melhor um destino do que nulo.
  select f.id into v from filiais f
    where f.empresa_id = p_empresa and f.ativo order by f.id limit 1;
  return v;
end $$;


--
-- Name: fundir_clientes(bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fundir_clientes(p_empresa bigint, p_principal bigint, p_secundario bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_lead_principal  bigint;
  v_lead_secundario bigint;
  v_nome_sec        text;
  v_cpf_sec         text;
  v_movidos         jsonb := '{}'::jsonb;
  v_n               integer;
begin
  if p_principal = p_secundario then
    raise exception 'O cliente principal e o secundário são o mesmo registro';
  end if;

  -- Os dois têm de ser DESTA empresa. A rota já confere o papel de quem chamou;
  -- aqui se confere de quem é o dado, que é a pergunta que a função pode responder.
  select lead_id into v_lead_principal from clientes where id = p_principal and empresa_id = p_empresa;
  if not found then raise exception 'Cliente principal não encontrado nesta empresa'; end if;

  select lead_id, nome, cpf_cnpj into v_lead_secundario, v_nome_sec, v_cpf_sec
    from clientes where id = p_secundario and empresa_id = p_empresa;
  if not found then raise exception 'Cliente secundário não encontrado nesta empresa'; end if;

  ---------------------------------------------------------------------------
  -- 1. A JORNADA (lead)
  ---------------------------------------------------------------------------
  if v_lead_principal is null and v_lead_secundario is not null then
    /*
     * Principal sem funil: em vez de apagar o lead do secundário, o principal HERDA
     * a jornada inteira. Nada precisa ser movido — só o vínculo muda de dono.
     * O `lead_id` do secundário é limpo antes para não bater no índice único.
     */
    update clientes set lead_id = null where id = p_secundario;
    update clientes set lead_id = v_lead_secundario where id = p_principal;
    v_lead_principal := v_lead_secundario;
    v_lead_secundario := null;
    v_movidos := v_movidos || jsonb_build_object('jornada_herdada', true);

  elsif v_lead_principal is not null and v_lead_secundario is not null then
    -- Cadência: a mesma cadência ativa nos dois leads bateria no índice único.
    -- A inscrição do secundário é descartada; a do principal já está andando.
    delete from cadencia_inscricoes s
     where s.lead_id = v_lead_secundario
       and s.status = 'ativa'
       and exists (
         select 1 from cadencia_inscricoes p
          where p.lead_id = v_lead_principal and p.cadencia_id = s.cadencia_id and p.status = 'ativa'
       );
    update cadencia_inscricoes set lead_id = v_lead_principal where lead_id = v_lead_secundario;

    -- Perfil de busca é UM por lead: fica o do principal, se já existir.
    if exists (select 1 from lead_perfil_busca where lead_id = v_lead_principal) then
      delete from lead_perfil_busca where lead_id = v_lead_secundario;
    else
      update lead_perfil_busca set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    end if;

    update lead_mensagens        set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('mensagens', v_n);
    update chamadas              set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('chamadas', v_n);
    update lead_atribuicoes      set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('transferencias', v_n);
    update tarefas               set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('tarefas', v_n);
    update visitas               set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update negocios_imobiliarios set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update orcamentos            set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update propostas             set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update fichas_financiamento  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update followups_gerados     set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update avaliacoes_usados     set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update rastreamento_eventos  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update rastreamento_visitas  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update inventario_unidades   set reservado_lead_id = v_lead_principal where reservado_lead_id = v_lead_secundario;

    -- Agora o lead secundário está vazio e pode sair.
    update clientes set lead_id = null where id = p_secundario;
    delete from leads where id = v_lead_secundario and empresa_id = p_empresa;
    v_movidos := v_movidos || jsonb_build_object('lead_removido', v_lead_secundario);
  end if;

  ---------------------------------------------------------------------------
  -- 2. O QUE PENDURA NO CLIENTE
  ---------------------------------------------------------------------------
  if exists (select 1 from lead_perfil_busca where cliente_id = p_principal) then
    delete from lead_perfil_busca where cliente_id = p_secundario;
  else
    update lead_perfil_busca set cliente_id = p_principal where cliente_id = p_secundario;
  end if;

  update vendas                set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('vendas', v_n);
  update negocios_imobiliarios set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('negocios', v_n);
  update visitas               set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('compromissos', v_n);
  update orcamentos            set cliente_id = p_principal where cliente_id = p_secundario;
  update cobrancas             set cliente_id = p_principal where cliente_id = p_secundario;
  update contratos_venda       set cliente_id = p_principal where cliente_id = p_secundario;
  update garantias_assistencias set cliente_id = p_principal where cliente_id = p_secundario;
  update inventario_unidades   set cliente_id = p_principal where cliente_id = p_secundario;
  update leads                 set convertido_em = p_principal where convertido_em = p_secundario;

  ---------------------------------------------------------------------------
  -- 3. COMPLETAR O QUE FALTA NO PRINCIPAL
  --
  -- Só campo VAZIO é preenchido: o principal é quem fica, e sobrescrever dado dele
  -- com o do duplicado seria decidir por quem fundiu. Duplicado costuma ter
  -- justamente o pedaço que falta no outro (o CPF que alguém digitou depois).
  ---------------------------------------------------------------------------
  update clientes p set
    telefone         = coalesce(p.telefone, s.telefone),
    email            = coalesce(p.email, s.email),
    cpf_cnpj         = coalesce(p.cpf_cnpj, s.cpf_cnpj),
    data_nascimento  = coalesce(p.data_nascimento, s.data_nascimento),
    endereco         = coalesce(p.endereco, s.endereco),
    numero           = coalesce(p.numero, s.numero),
    bairro           = coalesce(p.bairro, s.bairro),
    cidade           = coalesce(p.cidade, s.cidade),
    estado           = coalesce(p.estado, s.estado),
    cep              = coalesce(p.cep, s.cep),
    instagram        = coalesce(p.instagram, s.instagram),
    profissao        = coalesce(p.profissao, s.profissao),
    estado_civil     = coalesce(p.estado_civil, s.estado_civil),
    tipo_negocio     = coalesce(p.tipo_negocio, s.tipo_negocio),
    corretor_id      = coalesce(p.corretor_id, s.corretor_id),
    valor_pretendido = coalesce(p.valor_pretendido, s.valor_pretendido),
    regiao_interesse = coalesce(p.regiao_interesse, s.regiao_interesse),
    -- Rastro da fusão: sem isto, o registro que sobrou não conta que houve fusão, e
    -- ninguém entende por que o histórico tem duas conversas começando do zero.
    observacoes = trim(both E'\n' from
      coalesce(p.observacoes, '') || E'\n' ||
      'Fundido com "' || coalesce(s.nome, '?') || '"' ||
      coalesce(' (CPF ' || s.cpf_cnpj || ')', '') ||
      ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.' ||
      coalesce(E'\nObservação do registro fundido: ' || s.observacoes, ''))
  from clientes s
  where p.id = p_principal and s.id = p_secundario;

  delete from clientes where id = p_secundario and empresa_id = p_empresa;

  return jsonb_build_object('ok', true, 'principal', p_principal, 'removido', p_secundario,
                            'nome_removido', v_nome_sec, 'movidos', v_movidos);
end;
$$;


--
-- Name: FUNCTION fundir_clientes(p_empresa bigint, p_principal bigint, p_secundario bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fundir_clientes(p_empresa bigint, p_principal bigint, p_secundario bigint) IS 'Funde dois clientes numa transação: move histórico, jornada e financeiro para o principal e remove o secundário.';


--
-- Name: get_empresa_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_empresa_id() RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_super    boolean;
  v_imp      bigint;
  v_expires  timestamptz;
  v_empresa  bigint;
BEGIN
  SELECT is_super_admin, impersonando_empresa_id, impersonando_expires_at
    INTO v_super, v_imp, v_expires
  FROM usuarios WHERE id = auth.uid();

  -- Super admin impersonating: only valid while TTL has not expired.
  IF v_super AND v_imp IS NOT NULL AND v_expires IS NOT NULL AND v_expires > now() THEN
    RETURN v_imp;
  END IF;

  -- Normal flow: active company link.
  SELECT empresa_id INTO v_empresa
  FROM empresa_usuarios
  WHERE usuario_id = auth.uid() AND ativo = TRUE
  LIMIT 1;

  RETURN v_empresa;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: hard_delete_empresa(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hard_delete_empresa(p_empresa_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_super boolean;
begin
  select is_super_admin into v_super from public.usuarios where id = auth.uid();
  if not coalesce(v_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa_id) then
    raise exception 'Empresa % nao encontrada', p_empresa_id;
  end if;

  -- Deleta filhos em ordem topologica (folhas primeiro). Transacional: se algo
  -- falhar, tudo faz rollback e nada e apagado.
  delete from public.vendas_pagamentos       where empresa_id = p_empresa_id;
  delete from public.cobrancas               where empresa_id = p_empresa_id;
  delete from public.comissoes               where empresa_id = p_empresa_id;
  delete from public.pre_vendas              where empresa_id = p_empresa_id;
  delete from public.movimentacao_estoque    where empresa_id = p_empresa_id;
  delete from public.followups_gerados       where empresa_id = p_empresa_id;
  delete from public.visitas                 where empresa_id = p_empresa_id;
  delete from public.tarefas                 where empresa_id = p_empresa_id;
  delete from public.lead_mensagens          where empresa_id = p_empresa_id;
  delete from public.lead_perfil_busca       where empresa_id = p_empresa_id;
  delete from public.garantias_assistencias  where empresa_id = p_empresa_id;
  delete from public.inventario_unidades     where empresa_id = p_empresa_id;
  delete from public.pedidos_compra          where empresa_id = p_empresa_id;
  delete from public.vendas                  where empresa_id = p_empresa_id;
  delete from public.leads                   where empresa_id = p_empresa_id;
  delete from public.imoveis                 where empresa_id = p_empresa_id;
  delete from public.produtos                where empresa_id = p_empresa_id;
  delete from public.subcategorias_produtos  where empresa_id = p_empresa_id;
  delete from public.marcas_produtos         where empresa_id = p_empresa_id;
  delete from public.categorias_produtos     where empresa_id = p_empresa_id;
  delete from public.fornecedores            where empresa_id = p_empresa_id;
  delete from public.proprietarios           where empresa_id = p_empresa_id;
  delete from public.clientes                where empresa_id = p_empresa_id;
  delete from public.metas_comissoes         where empresa_id = p_empresa_id;
  delete from public.lancamentos_financeiros where empresa_id = p_empresa_id;
  delete from public.configuracoes_sistema   where empresa_id = p_empresa_id;
  delete from public.funil_etapas            where empresa_id = p_empresa_id;
  delete from public.taxas_pagamento         where empresa_id = p_empresa_id;
  delete from public.tenant_payment_config   where empresa_id = p_empresa_id;
  delete from public.stripe_eventos          where empresa_id = p_empresa_id;
  delete from public.empresa_usuarios        where empresa_id = p_empresa_id;

  -- Preserva a trilha de auditoria (inclui o log da propria exclusao).
  update public.superadmin_logs set empresa_id = null where empresa_id = p_empresa_id;

  delete from public.empresas where id = p_empresa_id;
end;
$$;


--
-- Name: FUNCTION hard_delete_empresa(p_empresa_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.hard_delete_empresa(p_empresa_id bigint) IS 'LGPD (Fase 2.B): exclusao definitiva em cascata de uma empresa e todos os seus dados. SECURITY DEFINER, exige super admin, transacional. Preserva superadmin_logs (empresa_id -> null). NAO apaga contas de usuario (usuarios/auth).';


--
-- Name: incrementar_msgs_nao_lidas(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.incrementar_msgs_nao_lidas(lead_id_param bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  -- Nao faz nada de proposito: quem mantem `leads.msgs_nao_lidas` agora e o
  -- gatilho `nao_lidas_sincroniza` em `lead_mensagens`. Ver a migracao
  -- `contador_de_nao_lidas_vira_espelho`.
  perform 1;
end $$;


--
-- Name: is_empresa_admin(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_empresa_admin(emp bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Dono/admin de verdade daquela empresa. Vem primeiro: é o caso comum, e
  -- assim ninguém paga duas chamadas de função a mais no caminho quente.
  select exists (
    select 1 from public.empresa_usuarios
    where usuario_id = auth.uid()
      and empresa_id = emp
      and ativo = true
      and role in ('owner','admin')
  )
  -- Superadmin: só na empresa que ele está impersonando AGORA.
  or (coalesce(public.is_super_admin(), false) and emp = public.get_empresa_id());
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT u.is_super_admin FROM usuarios u WHERE u.id = auth.uid()),
    false
  );
$$;


--
-- Name: marcar_cliente_proprietario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_cliente_proprietario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.proprietario_id is not null then
    update clientes set proprietario = true
     where id = new.proprietario_id and empresa_id = new.empresa_id and proprietario is not true;
  end if;
  return new;
end $$;


--
-- Name: numerar_cotacao_troca(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.numerar_cotacao_troca() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.numero is not null then
    return new;   -- número informado (importação, correção manual): respeita.
  end if;

  -- Serializa a numeração desta empresa até o fim da transação.
  perform pg_advisory_xact_lock(hashtext('troca_cotacoes:' || new.empresa_id::text));

  select coalesce(max(numero), 0) + 1
    into new.numero
    from public.troca_cotacoes
   where empresa_id = new.empresa_id;

  return new;
end;
$$;


--
-- Name: preencher_filial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preencher_filial() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $$;


--
-- Name: preencher_filial_do_lead(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preencher_filial_do_lead() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.lead_id is not null then
    select l.filial_id into new.filial_id from leads l where l.id = new.lead_id;
  elsif new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $$;


--
-- Name: prevent_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT is_super_admin INTO v_is_super
  FROM public.usuarios
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_super, false) THEN
    IF OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin THEN
      RAISE EXCEPTION 'Permission denied: cannot modify is_super_admin';
    END IF;
    IF OLD.impersonando_empresa_id IS DISTINCT FROM NEW.impersonando_empresa_id THEN
      RAISE EXCEPTION 'Permission denied: cannot modify impersonando_empresa_id';
    END IF;
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Permission denied: cannot modify role';
    END IF;
    IF OLD.modulos_acesso IS DISTINCT FROM NEW.modulos_acesso THEN
      RAISE EXCEPTION 'Permission denied: cannot modify modulos_acesso';
    END IF;
    IF OLD.permissoes IS DISTINCT FROM NEW.permissoes THEN
      RAISE EXCEPTION 'Permission denied: cannot modify permissoes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: propagar_filial_do_lead(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propagar_filial_do_lead() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update lead_mensagens      set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update lead_perfil_busca   set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update followups_gerados   set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update cadencia_inscricoes set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update clientes            set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  return new;
end $$;


--
-- Name: rate_limit_bump(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_bump(p_chave text, p_janela timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v integer;
begin
  insert into public.rate_limit (chave, janela, contador)
  values (p_chave, p_janela, 1)
  on conflict (chave, janela) do update set contador = public.rate_limit.contador + 1
  returning contador into v;

  -- Limpeza barata e no ponto: só as janelas velhas DESTA chave. Evita depender de
  -- cron para a tabela não crescer para sempre.
  delete from public.rate_limit
   where chave = p_chave and janela < p_janela - interval '1 day';

  return v;
end
$$;


--
-- Name: refresh_status_atrasados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_status_atrasados() RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  UPDATE lancamentos_financeiros
  SET status = 'atrasado'
  WHERE status = 'pendente' AND data_venc < CURRENT_DATE;
$$;


--
-- Name: set_impersonation(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_impersonation(p_empresa_id bigint, p_ttl_seconds integer DEFAULT 14400) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_is_super boolean;
begin
  select is_super_admin into v_is_super from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  if p_empresa_id is null then
    update public.usuarios
      set impersonando_empresa_id = null, impersonando_expires_at = null
      where id = auth.uid();
  else
    if not exists (select 1 from public.empresas where id = p_empresa_id) then
      raise exception 'Empresa % nao encontrada', p_empresa_id;
    end if;
    update public.usuarios
      set impersonando_empresa_id = p_empresa_id,
          impersonando_expires_at = now() + make_interval(secs => p_ttl_seconds)
      where id = auth.uid();
  end if;
end;
$$;


--
-- Name: set_planos_config_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_planos_config_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_super_admin(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_super_admin(p_target uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- só um super admin pode promover/revogar outro
  if not coalesce((select is_super_admin from public.usuarios where id = auth.uid()), false) then
    raise exception 'Permission denied: not a super admin';
  end if;
  update public.usuarios set is_super_admin = p_value where id = p_target;
end;
$$;


--
-- Name: sincronizar_nao_lidas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_nao_lidas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_lead bigint := coalesce(new.lead_id, old.lead_id);
begin
  if v_lead is null then return coalesce(new, old); end if;

  update public.leads l
     set msgs_nao_lidas = (
           select count(*) from public.lead_mensagens m
            where m.lead_id = v_lead and m.lida = false and m.direcao = 'recebida'
         )
   where l.id = v_lead
     -- Nao escreve se ja esta certo: evita UPDATE inutil em `leads` a cada
     -- mensagem enviada pelo vendedor, que nao mexe na conta de nao lidas.
     and l.msgs_nao_lidas is distinct from (
           select count(*) from public.lead_mensagens m
            where m.lead_id = v_lead and m.lida = false and m.direcao = 'recebida'
         );

  return coalesce(new, old);
end $$;


--
-- Name: tg_lead_marcos_conversa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_lead_marcos_conversa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.direcao = 'recebida' then
    update public.leads
       set ultima_recebida_at = greatest(coalesce(ultima_recebida_at, new.created_at), new.created_at)
     where id = new.lead_id;
  elsif new.direcao = 'enviada' then
    update public.leads
       set ultima_enviada_at = greatest(coalesce(ultima_enviada_at, new.created_at), new.created_at)
     where id = new.lead_id;
  end if;
  return new;
end $$;


--
-- Name: tg_zapintel_ficha_ao_vivo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_zapintel_ficha_ao_vivo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform zapintel_avisar(new.empresa_id, 'analises', jsonb_build_object('lead', new.lead_id));
  return null;
exception when others then
  return null;
end $$;


--
-- Name: tg_zapintel_mensagens_ao_vivo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_zapintel_mensagens_ao_vivo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  for r in
    select empresa_id, count(*) n,
           count(*) filter (where direcao = 'recebida') recebidas,
           array_agg(distinct coalesce(filial_id, 0)) lojas,
           (array_agg(distinct lead_id))[1:100] leads
    from novas group by empresa_id
  loop
    perform zapintel_avisar(r.empresa_id, 'mensagens',
      jsonb_build_object('n', r.n, 'recebidas', r.recebidas, 'lojas', to_jsonb(r.lojas), 'leads', to_jsonb(r.leads)));
  end loop;
  return null;
exception when others then
  raise warning '[zapintel_ao_vivo] %', sqlerrm;
  return null;
end $$;


--
-- Name: tg_zapintel_vendas_ao_vivo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_zapintel_vendas_ao_vivo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  for r in select empresa_id, count(*) n from novas group by empresa_id loop
    perform zapintel_avisar(r.empresa_id, 'vendas', jsonb_build_object('n', r.n));
  end loop;
  return null;
exception when others then
  return null;
end $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: zapintel_analises_pendentes(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_analises_pendentes(p_empresa bigint, p_versao text) RETURNS TABLE(lead_id bigint, nome text, filial text, tem_ficha boolean, gerado_em timestamp with time zone, mensagens_na_ficha integer, mensagens_agora integer, ultima timestamp with time zone, loja_deve boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with agora as (
    select m.lead_id,
           count(*)::int as n,
           (count(*) filter (where nullif(trim(m.transcricao), '') is not null))::int as tr,
           (floor(extract(epoch from max(m.created_at)) / 60) * 60000)::bigint as marca,
           max(m.created_at) as ultima,
           bool_or(m.direcao = 'recebida') as cliente_falou
    from public.lead_mensagens m
    where m.empresa_id = p_empresa
    group by m.lead_id
  ),
  ultima_dir as (
    select distinct on (m.lead_id) m.lead_id, m.direcao
    from public.lead_mensagens m
    where m.empresa_id = p_empresa
    order by m.lead_id, m.created_at desc, m.id desc
  )
  select l.id, l.nome,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome),
         p.lead_id is not null,
         p.gerado_em,
         p.mensagens,
         a.n,
         a.ultima,
         u.direcao = 'recebida'
  from public.leads l
  join agora a on a.lead_id = l.id
  left join ultima_dir u on u.lead_id = l.id
  left join public.filiais f on f.id = l.filial_id
  left join public.zapintel_lead_perfil p on p.lead_id = l.id and p.empresa_id = p_empresa
  where l.empresa_id = p_empresa
    and l.ativo
    and not zapintel_funil_interno(l.funil_id)
    and (
      (p.lead_id is null and a.cliente_falou)
      or (p.lead_id is not null and (
            p.versao is distinct from p_versao
         or p.marca is distinct from a.marca
         or p.mensagens is distinct from a.n
         or p.transcritos is distinct from a.tr))
    )
$$;


--
-- Name: FUNCTION zapintel_analises_pendentes(p_empresa bigint, p_versao text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.zapintel_analises_pendentes(p_empresa bigint, p_versao text) IS 'Leads ativos com ficha de IA desatualizada (marca/mensagens/transcritos/versao diferentes da conversa atual) ou sem ficha (>=2 mensagens, cliente falou). Base do aviso "nova analise disponivel" do ZapIntel.';


--
-- Name: zapintel_atendimento(integer, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_atendimento(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp    bigint;
  v_lojas  bigint[];
  v_agora  timestamptz := now();
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_hor    jsonb;
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_hor := zapintel_horario(v_emp);

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.responsavel_id
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  TH as materialized (
    select * from zapintel_turnos(v_emp, v_lojas, least(v_desde, v_agora - interval '8 weeks'))
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, (p.perfil->>'score')::int score
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  U as materialized (
    select m.lead_id, max(m.created_at) um,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada') ue
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  ABERTO as (
    select L.id, L.nome, L.filial_id, F.cls, F.score, U.um, U.ur, U.ue
    from L join U on U.lead_id = L.id join F on F.lead_id = L.id
    where F.cls in ('hot', 'warm', 'followup', 'stalled')
      and U.um < v_agora - interval '72 hours' and U.um >= v_desde
  ),
  LARGADAS as (select * from ABERTO where ur is not null and (ue is null or ur > ue)),
  RETOMAR  as (select * from ABERTO where ue is not null and (ur is null or ue >= ur)),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'dias', p_dias,
    'empresa', v_emp,
    'horario', v_hor - 'configurado',
    'horarioConfigurado', (v_hor->>'configurado')::boolean,
    'resposta', coalesce((select jsonb_agg(r order by r->>'loja' nulls first) from (
        select jsonb_build_object(
          'loja', case when grouping(filial_id) = 1 then null else (select rotulo from NOMES where NOMES.id = TH.filial_id) end,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'p75', round(percentile_cont(0.75) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'ate30', round(100.0 * count(*) filter (where espera < 30) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) r
        from TH where aberto and chegou >= v_desde
        group by rollup (filial_id)) z), '[]'::jsonb),
    'foraDoHorario', (select jsonb_build_object(
        'turnos', count(*) filter (where not aberto),
        'pct', round(100.0 * count(*) filter (where not aberto) / nullif(count(*), 0)),
        'mediana', round((percentile_cont(0.5) within group (order by least(coalesce(espera, 2880), 2880)) filter (where not aberto))::numeric),
        'ate1h', round(100.0 * count(*) filter (where not aberto and espera < 60) / nullif(count(*) filter (where not aberto), 0)))
      from TH where chegou >= v_desde),
    'semanas', coalesce((select jsonb_agg(s order by s->>'inicio') from (
        select jsonb_build_object(
          'inicio', (date_trunc('week', chegou at time zone 'America/Sao_Paulo'))::date,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) s
        from TH where aberto and chegou >= v_agora - interval '8 weeks'
        group by date_trunc('week', chegou at time zone 'America/Sao_Paulo')) z), '[]'::jsonb),
    'cobertura', coalesce((select jsonb_agg(c) from (
        select jsonb_build_object('dow', dow, 'hora', hora, 'turnos', count(*),
               'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) c
        from TH where chegou >= v_desde group by dow, hora) z), '[]'::jsonb),
    'largadas', jsonb_build_object(
        'total', (select count(*) from LARGADAS),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', LARGADAS.id, 'nome', nome, 'classe', cls, 'desde', ur,
                   'loja', (select rotulo from NOMES where NOMES.id = LARGADAS.filial_id),
                   'fala', (select left(coalesce(nullif(trim(m.transcricao), ''), m.conteudo), 160)
                            from lead_mensagens m where m.lead_id = LARGADAS.id and m.direcao = 'recebida'
                            order by m.created_at desc, m.id desc limit 1)) i
            from LARGADAS order by ur desc limit 8) z), '[]'::jsonb)),
    'retomar', jsonb_build_object(
        'total', (select count(*) from RETOMAR),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', RETOMAR.id, 'nome', nome, 'classe', cls, 'score', score, 'desde', ue,
                   'loja', (select rotulo from NOMES where NOMES.id = RETOMAR.filial_id)) i
            from RETOMAR order by score desc nulls last, ue desc limit 8) z), '[]'::jsonb))
  ) into v_out;

  return v_out;
end;
$$;


--
-- Name: zapintel_avisar(bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_avisar(p_empresa bigint, p_evento text, p_dados jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform realtime.send(p_dados, p_evento, 'zapintel:' || p_empresa, true);
exception when others then
  raise warning '[zapintel_avisar] aviso ao vivo falhou: %', sqlerrm;
end $$;


--
-- Name: zapintel_conversa(integer, bigint, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_conversa(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_recalcular boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_chave text;
  v_dados jsonb;
  v_em    timestamptz;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_chave := zapintel_conversa_chave(p_dias, v_lojas);
  if not p_recalcular then
    select c.dados, c.gerado_em into v_dados, v_em from zapintel_conversa_cache c
     where c.empresa_id = v_emp and c.chave = v_chave and c.gerado_em > now() - interval '26 hours';
    if found then return v_dados || jsonb_build_object('geradoEm', v_em); end if;
  end if;
  v_dados := zapintel_conversa_calc(v_emp, v_lojas, coalesce(p_dias, 30));
  insert into zapintel_conversa_cache (empresa_id, chave, dados, gerado_em) values (v_emp, v_chave, v_dados, now())
  on conflict (empresa_id, chave) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;
  return v_dados || jsonb_build_object('geradoEm', now());
end;
$$;


--
-- Name: zapintel_conversa_aquecer(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_conversa_aquecer(p_empresa bigint) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_lojas bigint[];
  v_dias int;
  v_n int := 0;
  f record;
begin
  for f in select null::bigint id union all select id from filiais where empresa_id = p_empresa loop
    foreach v_dias in array array[7, 30] loop
      if f.id is not null then v_lojas := array[f.id];
      else select coalesce(array_agg(id), array[]::bigint[]) || 0::bigint into v_lojas from filiais where empresa_id = p_empresa;
      end if;
      insert into zapintel_conversa_cache (empresa_id, chave, dados, gerado_em)
      values (p_empresa, zapintel_conversa_chave(v_dias, v_lojas), zapintel_conversa_calc(p_empresa, v_lojas, v_dias), now())
      on conflict (empresa_id, chave) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;


--
-- Name: zapintel_conversa_calc(bigint, bigint[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_conversa_calc(p_emp bigint, p_lojas bigint[], p_dias integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_emp    bigint := p_emp;
  v_lojas  bigint[] := p_lojas;
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_out    jsonb;
begin
  

  with
  L as materialized (
    select l.id, l.filial_id from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  US as (
    select u.id, u.nome, eu.filial_id,
           translate(lower(trim(u.nome)), 'áàâãäéèêëíìîïóòôõöúùûüçzy', 'aaaaaeeeeiiiiooooouuuucsi') n
    from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id
    where eu.empresa_id = v_emp and eu.ativo and eu.role <> 'owner'
  ),
  TK as (select id, split_part(n, ' ', 1) t1, nullif(split_part(n, ' ', 2), '') t2 from US),
  TOK as (
    select id, tok from (select id, t1 tok from TK union all select id, t2 from TK where t2 is not null) x
    where length(tok) >= 3
      and not exists (select 1 from TK o where o.id <> x.id and (o.t1 = x.tok or o.t2 = x.tok))
    union all select id, t1 || ' ' || t2 from TK where t2 is not null
  ),
  RG as (
    select id, '(^|[^a-z])' || alt || '( [a-z]+)?,? aqui([^a-z]|$)|aqui (e|eh) (o|a) ' || alt
           || '([^a-z]|$)|(^|[^a-z])sou (o|a) ' || alt || '([^a-z]|$)|meu nome e ' || alt || '([^a-z]|$)' rx
    from (select id, '(' || string_agg(regexp_replace(tok, 'o$', '(o|ao)'), '|') || ')' alt from TOK group by id) z
  ),
  M as materialized (
    select m.id, m.lead_id, m.created_at, m.direcao, m.tipo, m.usuario_id,
           coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') t
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp and m.created_at >= v_desde - interval '3 days'
  ),
  MT as materialized (
    select M.*,
           (t <> '' and t !~ '^\s*[\[{]' and t !~* 'enviad[ao] pelo celular$') fala,
           lower(t) lt
    from M
  ),
  INTRO as (
    select e.id, (array_agg(rg.id))[1] quem, count(*) q
    from MT e join RG rg on translate(e.lt, 'áàâãäéèêëíìîïóòôõöúùûüçzy', 'aaaaaeeeeiiiiooooouuuucsi') ~ rg.rx
    where e.direcao = 'enviada' and e.fala and e.lt ~ '(aqui|sou |meu nome)'
    group by e.id
  ),
  POS as (
    select a.lead_id, a.created_at em, a.para_responsavel dono
    from lead_atribuicoes a join L on L.id = a.lead_id where a.empresa_id = v_emp
    union all
    select ld.id, ld.responsavel_desde, ld.responsavel_id from leads ld join L on L.id = ld.id
    where ld.responsavel_id is not null and ld.responsavel_desde is not null
  ),
  S as (
    select e.lead_id, e.created_at em, e.id, e.usuario_id crm, case when i.q = 1 then i.quem end intro, null::uuid dono, 0 k
    from MT e left join INTRO i on i.id = e.id where e.direcao = 'enviada'
    union all
    select lead_id, em, null, null, null, dono, 1 from POS
  ),
  C as (
    select S.*, count(intro) over w1 gi, count(k) filter (where k = 1) over w1 gp, count(intro) over w2 gn
    from S
    window w1 as (partition by lead_id order by em, k desc, id),
           w2 as (partition by lead_id order by em desc, k, id desc)
  ),
  C2 as (
    select C.*,
      first_value(intro) over (partition by lead_id, gi order by em, k desc, id) i_ant,
      first_value(em)    over (partition by lead_id, gi order by em, k desc, id) i_ant_em,
      first_value(dono)  over (partition by lead_id, gp order by em, k desc, id) d_ant,
      first_value(intro) over (partition by lead_id, gn order by em desc, k, id desc) i_dep,
      first_value(em)    over (partition by lead_id, gn order by em desc, k, id desc) i_dep_em
    from C
  ),
  AUT as materialized (
    select id,
      case when crm is not null then crm
           when intro is not null then intro
           when i_ant is not null and i_ant_em >= em - interval '72 hours' then i_ant
           when d_ant is not null then d_ant
           when i_dep is not null and i_dep_em <= em + interval '12 hours' then i_dep end autor,
      case when crm is not null then 'crm'
           when intro is not null or (i_ant is not null and i_ant_em >= em - interval '72 hours') then 'apresentacao'
           when d_ant is not null then 'dono'
           when i_dep is not null and i_dep_em <= em + interval '12 hours' then 'apresentacao'
           else 'nenhum' end fonte
    from C2 where k = 0
  ),
  GW(palavra, rx) as (values
    ('cara',      ',\s*cara($|[^a-zà-ú])|(^|[^a-zà-ú])cara\s*[,!?]'),
    ('bora',      '(^|[^a-zà-ú])bora($|[^a-zà-ú])'),
    ('mano',      '(^|[^a-zà-ú])mano($|[^a-zà-ú])'),
    ('mana',      '(^|[^a-zà-ú])mana($|[^a-zà-ú])'),
    ('patrão',    '(^|[^a-zà-ú])patrão($|[^a-zà-ú])'),
    ('pô',        '(^|[^a-zà-ú])pô($|[^a-zà-ú])'),
    ('irmão',     ',\s*irmão($|[^a-zà-ú])|(^|[^a-zà-ú])irmão\s*[,!?]'),
    ('parceiro',  ',\s*parceiro($|[^a-zà-ú])|(^|[^a-zà-ú])parceiro\s*[,!?]'),
    ('parça',     '(^|[^a-zà-ú])parça($|[^a-zà-ú])'),
    ('tá ligado', '(^|[^a-zà-ú])t[áa] ligad[oa]($|[^a-zà-ú])'),
    ('de boa',    '(^|[^a-zà-ú])de boa($|[^a-zà-ú])'),
    ('véi',       '(^|[^a-zà-ú])véi[o]?($|[^a-zà-ú])'),
    ('brother',   '(^|[^a-zà-ú])(brother|bro)($|[^a-zà-ú])'),
    ('blz',       '(^|[^a-zà-ú])blz($|[^a-zà-ú])'),
    ('vlw',       '(^|[^a-zà-ú])vlw($|[^a-zà-ú])'),
    ('tmj',       '(^|[^a-zà-ú])tmj($|[^a-zà-ú])'),
    ('slk',       '(^|[^a-zà-ú])slk($|[^a-zà-ú])'),
    ('mlk',       '(^|[^a-zà-ú])mlk($|[^a-zà-ú])')
  ),
  E as materialized (
    select e.id, e.lead_id, L.filial_id, e.created_at, e.tipo, e.fala, e.t, a.autor, a.fonte,
           case when e.fala then coalesce(array_length(regexp_split_to_array(trim(e.t), '\s+'), 1), 0) else 0 end palavras,
           (e.fala and e.t like '%?%') pergunta,
           (e.fala and e.lt ~ '(k{3,}|(ha){2,}|(rs){2,})') risada,
           case when e.fala and e.lt ~ (select string_agg('(' || rx || ')', '|') from GW)
                then array(select g.palavra from GW g where e.lt ~ g.rx) else '{}'::text[] end girias
    from MT e join AUT a on a.id = e.id join L on L.id = e.lead_id
    where e.direcao = 'enviada' and e.created_at >= v_desde
  ),
  CLI as (
    select lead_id, count(*) n,
           sum(case when fala then coalesce(array_length(regexp_split_to_array(trim(t), '\s+'), 1), 0) else 0 end) palavras
    from MT where direcao = 'recebida' and created_at >= v_desde group by lead_id
  ),
  SEQ0 as (
    select MT.id, MT.lead_id, MT.direcao, MT.created_at,
           case when lag(MT.direcao) over (partition by MT.lead_id order by MT.created_at, MT.id) is distinct from MT.direcao then 1 else 0 end novo
    from MT where MT.created_at >= v_desde
  ),
  SEQ1 as (select SEQ0.*, sum(novo) over (partition by lead_id order by created_at, id) g from SEQ0),
  SEQ as (
    select s.lead_id, s.g, count(*) n,
           (array_agg(a.autor order by s.created_at, s.id))[1] autor
    from SEQ1 s join AUT a on a.id = s.id where s.direcao = 'enviada' group by s.lead_id, s.g
  ),
  SEQL as (select lead_id, 100.0 * count(*) filter (where n >= 3) / count(*) raj from SEQ group by lead_id),
  VENDEU as (
    select distinct z.lead_id from zapintel_venda_lead z join vendas v on v.id = z.venda_id
    where z.empresa_id = v_emp and z.lead_id is not null and coalesce(v.data_venda, v.created_at) >= v_desde
  ),
  TH as materialized (select * from zapintel_turnos(v_emp, v_lojas, v_desde) where aberto),
  PRED as (
    select lead_id, autor from (
      select lead_id, autor, row_number() over (partition by lead_id order by count(*) desc, max(created_at) desc) r
      from E where autor is not null group by lead_id, autor) z where r = 1
  ),
  PAL as (
    select E.lead_id, max(E.filial_id) filial_id, sum(E.palavras) p,
           (select PRED.autor from PRED where PRED.lead_id = E.lead_id) dono
    from E group by E.lead_id
  ),
  NX as (
    select lead_id, created_at,
           min(case when direcao = 'enviada' then created_at end) over (
             partition by lead_id order by created_at desc, id desc
             rows between unbounded preceding and 1 preceding) resp
    from MT
  ),
  R2 as (
    select TH.lead_id, TH.chegou, TH.espera,
           (array_agg(E.autor order by E.id) filter (where E.autor is not null))[1] autor
    from TH
    left join (select distinct on (lead_id, created_at) lead_id, created_at, resp from NX order by lead_id, created_at, resp) nx
      on nx.lead_id = TH.lead_id and nx.created_at = TH.chegou
    left join E on E.lead_id = nx.lead_id and E.created_at = nx.resp
    group by TH.lead_id, TH.chegou, TH.espera
  ),
  RESP as materialized (
    select R2.lead_id, R2.espera, coalesce(R2.autor, PRED.autor) autor
    from R2 left join PRED on PRED.lead_id = R2.lead_id
  ),
  GRP as (
    select 'vendedor' tipo, autor::text chave from E group by autor
    union all select 'loja', filial_id::text from E group by filial_id
    union all select 'geral', null
  ),
  LINHA as (
    select g.tipo, g.chave,
      (select jsonb_build_object(
          'mensagens', count(*),
          'conversas', count(distinct E.lead_id),
          'vendas', count(distinct E.lead_id) filter (where E.lead_id in (select lead_id from VENDEU)),
          'palavrasPorMsg', round(avg(nullif(E.palavras, 0))::numeric, 1),
          'audioPct', round(100.0 * count(*) filter (where E.tipo = 'audio') / nullif(count(*), 0)),
          'perguntasPct', round(100.0 * count(*) filter (where E.pergunta) / nullif(count(*) filter (where E.fala), 0)),
          'giriaPct', round(100.0 * count(*) filter (where cardinality(E.girias) > 0) / nullif(count(*) filter (where E.fala), 0)),
          'risadaPct', round(100.0 * count(*) filter (where E.risada) / nullif(count(*) filter (where E.fala), 0)),
          'palavrasLoja', sum(E.palavras))
        from E
        where case g.tipo when 'vendedor' then E.autor::text is not distinct from g.chave
                          when 'loja' then E.filial_id::text is not distinct from g.chave else true end) m,
      g.chave is null and g.tipo = 'vendedor' sem_autor
    from GRP g
  )
  select jsonb_build_object(
    'dias', p_dias,
    'cobertura', (select jsonb_build_object(
        'mensagens', count(*),
        'crm', count(*) filter (where fonte = 'crm'),
        'apresentacao', count(*) filter (where fonte = 'apresentacao'),
        'dono', count(*) filter (where fonte = 'dono'),
        'nenhum', count(*) filter (where fonte = 'nenhum')) from E),
    'linhas', coalesce((select jsonb_agg(x order by ordem, (x->>'conversas')::int desc) from (
        select case LINHA.tipo when 'geral' then 0 when 'loja' then 1 else 2 end ordem,
          LINHA.m || jsonb_build_object(
            'tipo', LINHA.tipo,
            'id', LINHA.chave,
            'nome', case LINHA.tipo
                      when 'geral' then null
                      when 'loja' then (select rotulo from NOMES where NOMES.id::text = LINHA.chave)
                      else coalesce((select nome from usuarios where id::text = LINHA.chave), 'Não identificado') end,
            'loja', case when LINHA.tipo = 'vendedor' then
                      (select rotulo from NOMES join US on US.filial_id = NOMES.id where US.id::text = LINHA.chave) end,
            'falaLojaPct', (select round(100.0 * sum(PAL.p) / nullif(sum(PAL.p) + sum(coalesce(CLI.palavras, 0)), 0))
                            from PAL left join CLI on CLI.lead_id = PAL.lead_id where case LINHA.tipo
                              when 'vendedor' then PAL.dono::text is not distinct from LINHA.chave
                              when 'loja' then PAL.filial_id::text is not distinct from LINHA.chave else true end),
            'rajadaPct', (select round(100.0 * count(*) filter (where SEQ.n >= 3) / nullif(count(*), 0))
                          from SEQ join L on L.id = SEQ.lead_id where case LINHA.tipo
                            when 'vendedor' then SEQ.autor::text is not distinct from LINHA.chave
                            when 'loja' then L.filial_id::text is not distinct from LINHA.chave else true end),
            'resposta', (select jsonb_build_object(
                            'turnos', count(*),
                            'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
                            'ate5', round(100.0 * count(*) filter (where espera < 5) / nullif(count(*), 0)))
                         from RESP join L on L.id = RESP.lead_id where case LINHA.tipo
                           when 'vendedor' then RESP.autor::text is not distinct from LINHA.chave
                           when 'loja' then L.filial_id::text is not distinct from LINHA.chave else true end),
            'girias', coalesce((select jsonb_agg(jsonb_build_object('palavra', p, 'n', n) order by n desc) from (
                         select gw p, count(*) n from E, unnest(E.girias) gw where case LINHA.tipo
                           when 'vendedor' then E.autor::text is not distinct from LINHA.chave
                           when 'loja' then E.filial_id::text is not distinct from LINHA.chave else true end
                         group by gw order by count(*) desc limit 6) z), '[]'::jsonb),
            'exemplos', case when LINHA.tipo = 'vendedor' and LINHA.chave is not null then
                         coalesce((select jsonb_agg(jsonb_build_object('leadId', lead_id, 'texto', texto, 'audio', audio)) from (
                           select E.lead_id, left(E.t, 180) texto, E.tipo = 'audio' audio from E
                           where E.autor::text = LINHA.chave and cardinality(E.girias) >= 2
                           order by cardinality(E.girias) desc, E.created_at desc limit 3) z), '[]'::jsonb) end
          ) x
        from LINHA) z), '[]'::jsonb),
    'venda', (select jsonb_agg(y.x order by y.vendeu desc) from (select vendeu, jsonb_build_object(
        'vendeu', vendeu, 'conversas', count(*),
        'falaLojaPct', round(avg(fala_loja)), 'perguntasPct', round(avg(perg)),
        'giriaPct', round(avg(gir)), 'audioPct', round(avg(aud)), 'rajadaPct', round(avg(raj))) x
      from (
        select E.lead_id, E.lead_id in (select lead_id from VENDEU) vendeu,
               100.0 * sum(E.palavras) / nullif(sum(E.palavras) + coalesce(max(CLI.palavras), 0), 0) fala_loja,
               100.0 * count(*) filter (where E.pergunta) / nullif(count(*) filter (where E.fala), 0) perg,
               100.0 * count(*) filter (where cardinality(E.girias) > 0) / nullif(count(*) filter (where E.fala), 0) gir,
               100.0 * count(*) filter (where E.tipo = 'audio') / count(*) aud,
               max(SEQL.raj) raj
        from E left join CLI on CLI.lead_id = E.lead_id left join SEQL on SEQL.lead_id = E.lead_id
        group by E.lead_id
        having count(*) >= 3 and coalesce(max(CLI.n), 0) >= 2
      ) c group by vendeu) y)
  ) into v_out;

  return v_out;
end;
$_$;


--
-- Name: zapintel_conversa_chave(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_conversa_chave(p_dias integer, p_lojas bigint[]) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(p_dias, 30)::text || ':' || array_to_string(array(select x from unnest(p_lojas) x order by x), ',')
$$;


--
-- Name: zapintel_dashboard(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_dashboard(p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp     bigint;
  v_lojas   bigint[];
  v_agora   timestamptz := now();
  v_hoje    timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_mes     timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_mes_ant timestamptz := ((date_trunc('month', now() at time zone 'America/Sao_Paulo')) - interval '1 month') at time zone 'America/Sao_Paulo';
  v_out     jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from lead_mensagens m
    where m.empresa_id = v_emp
    group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao, p.gerado_em,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p
    where p.empresa_id = v_emp
  ),
  B as materialized (
    select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp
  ),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um,
           F.fm, F.versao, F.gerado_em, F.score, F.rotulo, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls,
           coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  HOJE as (
    select count(*) filter (where m.direcao = 'recebida') recebidas,
           count(*) filter (where m.direcao = 'enviada')  enviadas,
           count(distinct m.lead_id) conversas
    from lead_mensagens m
    where m.empresa_id = v_emp and m.created_at >= v_hoje and coalesce(m.filial_id, 0) = any (v_lojas)
  ),
  RS as materialized (
    select * from zapintel_turnos(v_emp, v_lojas, v_agora - interval '7 days') where aberto
  ),
  RESP as (
    select percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440)) mediana,
           count(*) filter (where espera < 5) rapidas,
           count(*) filter (where espera is null or espera >= 240) longas,
           count(*) filter (where espera is null) sem_resposta,
           count(*) total
    from RS
  ),
  V as (
    select v.id, v.grupo_pdv, v.valor_venda, v.data_venda, v.filial_id, v.status
    from vendas v
    where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas)
      and v.data_venda >= v_agora - interval '120 days'
  ),
  TICKET as (
    select case when count(distinct coalesce(grupo_pdv::text, id::text)) = 0 then null
                else sum(valor_venda) / count(distinct coalesce(grupo_pdv::text, id::text)) end ticket
    from V where data_venda >= v_agora - interval '90 days' and status <> 'cancelada'
  ),
  VMES as (
    select coalesce(sum(valor_venda) filter (where data_venda >= v_mes), 0) mes_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_mes) mes_qtd,
           coalesce(sum(valor_venda) filter (where data_venda >= v_mes_ant and data_venda < v_mes_ant + (v_agora - v_mes)), 0) ant_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_mes_ant and data_venda < v_mes_ant + (v_agora - v_mes)) ant_qtd,
           coalesce(sum(valor_venda) filter (where data_venda >= v_hoje), 0) hoje_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_hoje) hoje_qtd
    from V where status <> 'cancelada'
  ),
  OBJ as (
    select zapintel_familia_objecao(o->>'rotulo') familia, o->>'rotulo' rotulo,
           (o->>'desfecho') ~* 'aberto' em_aberto, X.id
    from X, jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
  ),
  PEND as (
    select X.id, X.nome, X.filial_id, X.urg, X.um, t pendencia
    from X, jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t
    where t like '⚠%'
  ),
  SIL as (
    select X.id, X.comprou, ult.texto
    from X
    cross join lateral (
      select coalesce(nullif(trim(u.transcricao), ''), u.conteudo) texto, u.direcao, u.created_at,
             lead(u.direcao) over (order by u.created_at desc, u.id desc) dir_antes,
             lead(u.created_at) over (order by u.created_at desc, u.id desc) quando_antes
      from (select * from lead_mensagens u0 where u0.lead_id = X.id order by u0.created_at desc, u0.id desc limit 2) u
      order by u.created_at desc limit 1
    ) ult
    where X.ue is not null and (X.ur is null or X.ue > X.ur)
      and X.ue < v_agora - interval '3 days' and X.ue >= v_agora - interval '60 days' and X.n >= 4
      and not (ult.dir_antes = 'enviada' and ult.created_at - ult.quando_antes > interval '20 hours')
      and ult.texto is not null and length(ult.texto) > 8 and ult.texto !~ '^[\[{]'
      and ult.texto !~* '(enviad[oa] pelo celular|^reagiu|n[ãa]o envia ao crm|mensagem com bot|^figurinha|^sticker)'
      and ult.texto !~* '(curr[ií]culo|vaga|entrevista|sal[áa]rio|rua |avenida|cep|endere[çc]o|bairro)'
  ),
  MODELOS as (
    select initcap(regexp_replace(lower(trim(mm[1] || coalesce(' ' || mm[2], ''))), '\s+', ' ', 'g')) modelo, m.lead_id
    from lead_mensagens m
    cross join lateral regexp_matches(
      coalesce(nullif(trim(m.transcricao), ''), m.conteudo, ''),
      'iphone\s*(1[1-9]|[89]|se|xr|xs)\s*(pro\s*max|pro|plus|max|mini|e)?', 'gi') mm
    where m.empresa_id = v_emp and m.direcao = 'recebida'
      and m.created_at >= v_agora - interval '30 days' and coalesce(m.filial_id, 0) = any (v_lojas)
  )
  select jsonb_build_object(
    'geradoEm', v_agora,
    'empresa', v_emp,
    'ultimaMensagem', (select max(um) from X),
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', rotulo) order by id), '[]') from NOMES where id = any (v_lojas)),

    'agora', (select jsonb_build_object(
        'recebidasHoje', HOJE.recebidas,
        'enviadasHoje', HOJE.enviadas,
        'conversasHoje', HOJE.conversas,
        'leadsNovosHoje', (select count(*) from X where created_at >= v_hoje),
        'esperando', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and cls <> 'unqualified'),
        'esperandoForaDoFunil', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and cls = 'unqualified'),
        'esperandoMais1h', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and ur < v_agora - interval '1 hour' and cls <> 'unqualified'),
        'esperandoAntigos', (select count(*) from X where esperando and ur < v_agora - interval '72 hours' and cls <> 'unqualified'),
        'esperaMaisAntiga', (select min(ur) from X where esperando and ur >= v_agora - interval '72 hours' and cls <> 'unqualified')
      ) from HOJE),

    'resposta', (select jsonb_build_object(
        'medianaMin', round(mediana::numeric),
        'ate5Pct', case when total > 0 then round(100.0 * rapidas / total) else null end,
        'mais4hPct', case when total > 0 then round(100.0 * longas / total) else null end,
        'semResposta', sem_resposta,
        'retomadas', total,
        'horario', zapintel_horario(v_emp)
      ) from RESP),

    'fila', (select coalesce(jsonb_agg(f order by f.ordem, f.desde), '[]') from (
        select X.id "leadId", X.nome, (select rotulo from NOMES where NOMES.id = X.filial_id) loja,
               X.ur desde, X.cls classificacao, X.urg urgencia,
               X.score::int score, X.rotulo,
               fp.perfil->>'proximaAcao' "proximaAcao", fp.perfil->>'mensagemSugerida' "mensagemSugerida",
               (X.tem_ficha and X.fm <> X.n) desatualizada,
               (select left(coalesce(nullif(trim(u.transcricao), ''), u.conteudo, '[' || coalesce(u.tipo, 'anexo') || ']'), 160)
                  from lead_mensagens u where u.lead_id = X.id and u.direcao = 'recebida'
                  order by u.created_at desc, u.id desc limit 1) "ultimaFala",
               (select count(*) from lead_mensagens u where u.lead_id = X.id and u.direcao = 'recebida' and u.created_at > coalesce(X.ue, '-infinity')) "naoRespondidas",
               (case when X.cls = 'sem_analise' then 1 else case X.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end) * 10
                 + (case X.cls when 'hot' then 0 when 'customer' then 1 when 'warm' then 2 when 'followup' then 3 when 'sem_analise' then 4 else 5 end) ordem
        from X
        left join zapintel_lead_perfil fp on fp.lead_id = X.id and fp.empresa_id = v_emp
        where X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified'
        order by ordem, X.ur
        limit 14
      ) f),

    'funil', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from X group by cls) c),

    'dinheiro', (select jsonb_build_object(
        'ticketMedio', round(TICKET.ticket::numeric, 2),
        'quentes', (select count(*) from X where cls = 'hot'),
        'mornos', (select count(*) from X where cls = 'warm'),
        'mesValor', VMES.mes_valor, 'mesQtd', VMES.mes_qtd,
        'mesAnteriorValor', VMES.ant_valor, 'mesAnteriorQtd', VMES.ant_qtd,
        'hojeValor', VMES.hoje_valor, 'hojeQtd', VMES.hoje_qtd,
        'clientesLidos', (select count(*) from X where cls = 'customer'),
        'clientesComVenda', (select count(*) from X where comprou),
        'semRegistro', (select count(*) from X where cls = 'customer' and not comprou and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null and gerado_em is not null and X.um >= v_agora - interval '90 days')
      ) from TICKET, VMES),

    'pendencias', jsonb_build_object(
        'total', (select count(*) from PEND),
        'leads', (select count(distinct id) from PEND),
        'itens', (select coalesce(jsonb_agg(p order by p.ordem, p.um desc), '[]') from (
            select PEND.id "leadId", PEND.nome, (select rotulo from NOMES where NOMES.id = PEND.filial_id) loja,
                   ltrim(substr(PEND.pendencia, 2)) texto, PEND.urg urgencia, PEND.um,
                   case PEND.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ordem
            from PEND
            where PEND.um >= v_agora - interval '45 days'
            order by ordem, PEND.um desc
            limit 12) p)
      ),

    'objecoes', (select coalesce(jsonb_agg(o order by o.leads desc), '[]') from (
        select familia, count(distinct id) leads, count(distinct id) filter (where em_aberto) "emAberto",
               (select jsonb_agg(r) from (select rotulo r from OBJ o2 where o2.familia = OBJ.familia
                                          group by rotulo order by count(*) desc limit 3) x) exemplos
        from OBJ group by familia) o),

    'sinais', (select coalesce(jsonb_agg(s order by s.leads desc), '[]') from (
        select upper(left(trim(sg->>'rotulo'), 1)) || lower(substr(trim(sg->>'rotulo'), 2)) rotulo, count(distinct X.id) leads
        from X, jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) sg
        where X.cls in ('hot', 'warm', 'followup')
        group by 1 order by 2 desc limit 8) s),

    'perfis', (select coalesce(jsonb_agg(p order by p.leads desc), '[]') from (
        select X.rotulo, count(*) leads
        from X where X.tem_ficha and X.cls not in ('unqualified')
        group by 1 order by 2 desc limit 10) p),

    'inatividade', (select jsonb_build_array(
        jsonb_build_object('faixa', 'hoje',  'leads', count(*) filter (where um >= v_hoje)),
        jsonb_build_object('faixa', '1-2',   'leads', count(*) filter (where um <  v_hoje and um >= v_hoje - interval '2 days')),
        jsonb_build_object('faixa', '3-7',   'leads', count(*) filter (where um <  v_hoje - interval '2 days' and um >= v_hoje - interval '7 days')),
        jsonb_build_object('faixa', '8-14',  'leads', count(*) filter (where um <  v_hoje - interval '7 days' and um >= v_hoje - interval '14 days')),
        jsonb_build_object('faixa', '15-30', 'leads', count(*) filter (where um <  v_hoje - interval '14 days' and um >= v_hoje - interval '30 days')),
        jsonb_build_object('faixa', '30+',   'leads', count(*) filter (where um <  v_hoje - interval '30 days'))
      ) from X where cls not in ('customer', 'lost', 'unqualified')),

    'calor', (select coalesce(jsonb_agg(jsonb_build_array(dow, hora, n)), '[]') from (
        select extract(isodow from m.created_at at time zone 'America/Sao_Paulo')::int dow,
               extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int hora,
               count(*) n
        from lead_mensagens m
        where m.empresa_id = v_emp and m.direcao = 'recebida' and m.created_at >= v_agora - interval '28 days'
          and coalesce(m.filial_id, 0) = any (v_lojas)
        group by 1, 2) h),

    'modelos', (select coalesce(jsonb_agg(md order by md.leads desc), '[]') from (
        select replace(replace(modelo, 'Iphone', 'iPhone'), 'Se', 'SE') modelo, count(distinct lead_id) leads
        from MODELOS group by 1 order by 2 desc limit 8) md),

    'analises', jsonb_build_object(
        'comAnalise', (select count(*) from X where tem_ficha),
        'desatualizadas', (select count(*) from X where tem_ficha and (fm <> n or versao is distinct from p_versao)),
        'semAnalise', (select count(*) from X where cls = 'sem_analise'),
        'semResposta', (select count(*) from X where cls = 'sem_resposta')
      ),

    'silencio', (select coalesce(jsonb_agg(si order by si.vezes desc), '[]') from (
        select left(texto, 160) frase, count(*) vezes, count(*) filter (where comprou) venderam
        from SIL group by left(texto, 160) having count(*) >= 2
        order by 2 desc limit 8) si),

    'porLoja', (select coalesce(jsonb_agg(pl order by pl.id), '[]') from (
        select NOMES.id, NOMES.rotulo nome,
               (select count(*) from X where X.filial_id = NOMES.id and X.um >= v_agora - interval '7 days') ativos7d,
               (select count(*) from X where X.filial_id = NOMES.id and X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified') esperando,
               (select count(*) from X where X.filial_id = NOMES.id and X.cls = 'hot') quentes,
               (select coalesce(sum(valor_venda), 0) from V where V.filial_id = NOMES.id and V.data_venda >= v_mes and V.status <> 'cancelada') "vendasMes",
               (select round((percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440)))::numeric)
                  from RS where RS.filial_id = NOMES.id) "respostaMin"
        from NOMES where NOMES.id = any (v_lojas)) pl)
  ) into v_out;

  return v_out;
end $$;


--
-- Name: FUNCTION zapintel_dashboard(p_filial bigint, p_empresa bigint, p_versao text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.zapintel_dashboard(p_filial bigint, p_empresa bigint, p_versao text) IS 'Dashboard do ZapIntel inteiro em um JSON, calculado das fichas de IA, mensagens e vendas, no escopo de empresa/loja de quem chama (zapintel_escopo). Chamado direto do navegador.';


--
-- Name: zapintel_dashboard_lista(text, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_dashboard_lista(p_tipo text, p_valor text DEFAULT NULL::text, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_hoje  timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao, p.gerado_em,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, F.fm, F.versao, F.gerado_em, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls, coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  ESCOLHA as (
    select X.*, null::text detalhe from X
    where (p_tipo = 'classe' and X.cls = p_valor)
       or (p_tipo = 'esperando' and X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified')
       or (p_tipo = 'sem_registro' and X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
           and X.convertido_em is null and X.um >= v_agora - interval '90 days')
       or (p_tipo = 'desatualizadas' and X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao))
       or (p_tipo = 'perfil' and X.rotulo = p_valor)
       or (p_tipo = 'inatividade' and X.cls not in ('customer', 'lost', 'unqualified') and (
            (p_valor = 'hoje'  and X.um >= v_hoje) or
            (p_valor = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (p_valor = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (p_valor = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (p_valor = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (p_valor = '30+'   and X.um < v_hoje - interval '30 days')))
    union all
    select X.*, (select string_agg(ltrim(substr(t, 2)), ' · ') from jsonb_array_elements_text(X.ps) t where t like '⚠%') from X
    where p_tipo = 'pendencias' and exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%')
    union all
    select X.*, (select string_agg((o->>'rotulo') || ' — ' || coalesce(o->>'desfecho', ''), ' · ')
                 from jsonb_array_elements(X.obj) o where zapintel_familia_objecao(o->>'rotulo') = p_valor) from X
    where p_tipo = 'objecao' and exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                         where zapintel_familia_objecao(o->>'rotulo') = p_valor)
    union all
    select X.*, (select string_agg(s->>'evidencia', ' · ') from jsonb_array_elements(X.si) s
                 where lower(trim(s->>'rotulo')) = lower(p_valor)) from X
    where p_tipo = 'sinal' and exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                       where lower(trim(s->>'rotulo')) = lower(p_valor))
    union all
    select X.*, null from X
    where p_tipo = 'modelo' and exists (
      select 1 from lead_mensagens m
      where m.lead_id = X.id and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
        and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~* ('iphone\s*' || replace(p_valor, ' ', '\s*') || '(?![0-9a-z])'))
  )
  select jsonb_build_object(
    'total', (select count(*) from ESCOLHA),
    'leads', (select coalesce(jsonb_agg(e order by e.ordem, e."ultimaMensagem" desc), '[]') from (
        select ESCOLHA.id "leadId", ESCOLHA.nome, (select rotulo from NOMES where NOMES.id = ESCOLHA.filial_id) loja,
               ESCOLHA.um "ultimaMensagem", ESCOLHA.cls classificacao, ESCOLHA.urg urgencia,
               ESCOLHA.score::int score, ESCOLHA.rotulo, ESCOLHA.acao "proximaAcao",
               ESCOLHA.esperando, ESCOLHA.detalhe,
               case ESCOLHA.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ordem
        from ESCOLHA
        order by ordem, ESCOLHA.um desc
        limit 120) e)
  ) into v_out;
  return v_out;
end $$;


--
-- Name: zapintel_escopo(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_escopo(p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint) RETURNS TABLE(empresa bigint, filiais bigint[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_super boolean;
  v_emp   bigint;
  v_papel text;
  v_lojas bigint[];
begin
  select coalesce(is_super_admin, false) into v_super from usuarios where id = auth.uid();
  v_emp := case when coalesce(v_super, false) and p_empresa is not null then p_empresa else get_empresa_id() end;
  if v_emp is null then raise exception 'sem empresa' using errcode = '42501'; end if;

  if not coalesce(v_super, false) and not exists (
    select 1 from complementos_empresa where empresa_id = v_emp and zapintel_ativo
  ) then
    raise exception 'ZapIntel não está ativo para esta empresa' using errcode = '42501';
  end if;

  select role into v_papel from empresa_usuarios
   where usuario_id = auth.uid() and empresa_id = v_emp and ativo limit 1;

  if coalesce(v_super, false) or v_papel in ('owner', 'admin') then
    select coalesce(array_agg(id), array[]::bigint[]) || 0::bigint into v_lojas
      from filiais where empresa_id = v_emp;
  else
    -- 15/10/2026: o ZapIntel é do dono, do admin e do superadmin.
    raise exception 'ZapIntel restrito ao dono e aos administradores' using errcode = '42501';
  end if;

  if p_filial is not null then
    if not (p_filial = any (v_lojas)) then
      raise exception 'loja fora do seu alcance' using errcode = '42501';
    end if;
    v_lojas := array[p_filial];
  end if;

  return query select v_emp, v_lojas;
end $$;


--
-- Name: zapintel_familia_objecao(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_familia_objecao(r text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case
    when r ~* '(resposta lenta|demora|prometid|não veio|nao veio|não entregue|nao entregue|faltar|defeito|contrato|mudou na hora|atraso|esquec|errad|em falta)' then 'Falha da loja'
    when r ~* '(aparelho|troca|usado|seminovo|vender|só venda|so venda|avalia|motorola|samsung)' then 'Troca e usado'
    when r ~* '(antecip|pago antes|paga antes|pagar antes|confian|desconfian|sem ver|sem conhecer|golpe|mandar dados)' then 'Confiança para pagar antes'
    when r ~* '(crédito|credito|boleto|limite|cartão|cartao|score|nome sujo|negad|aprova|financ|pagamento|entrada|parcel)' then 'Crédito e pagamento'
    when r ~* '(concorr|comprou|outra loja|outro lugar|comparand|compara|pesquisand|cotand|cotação|cotacao|proposta melhor|achou outro|fornecedor|internet|paraguai|eua|estados unidos|traz d|já trocou|ganhou|fora)' then 'Concorrência'
    when r ~* '(preço|preco|valor|caro|juros|orçamento|orcamento|dinheiro|diferença|diferenca|contas|desconto|finan|gasto|caixa|recebimento|comércio|comercio|baixar|dólar|dolar|promoç|promoc)' then 'Preço e dinheiro'
    when r ~* '(marido|esposa|mãe|mae|pai|família|familia|filh|decis|namorad|sócio|socio|indecis)' then 'Decide com outra pessoa'
    when r ~* '(cor|memória|memoria|armazenamento|gb|modelo|lacrado|bateria|tamanho|estoque|disponív|disponiv|peça|peca|garantia|chip|esim|câmera|camera|dúvida|duvida|16e|acessório|acessorio)' then 'Produto e estoque'
    when r ~* '(momento|esperar|esperando|aguard|adiad|adiou|depois|pressa|urgência|urgencia|interesse|necessidade|viagem|agenda|horário|horario|prioridade|tempo|pensar|analis|só em|desist|ainda não|ainda nao)' then 'Momento e indecisão'
    when r ~* '(entrega|prazo|frete|retirada|distância|distancia|longe)' then 'Entrega e prazo'
    else 'Outros'
  end
$$;


--
-- Name: zapintel_familia_sinal(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_familia_sinal(r text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case
    when r ~* 'indica' then 'Veio por indicação'
    when r ~* '(fechou|comprou|satisfeit|gostou|elogi|recebeu|chegou|pagou|entregue|feliz|agradec|retirou|levou)' then 'Depois da compra'
    when r ~* '(decid|fecha com|vai fechar|quer fechar|vai comprar|quer comprar|disse que fecha|pronto para fechar|pronta para fechar)' then 'Disse que ia comprar'
    when r ~* '(cliente|volt|recorrente|já compr|ja compr|conhece o dono|da casa|fiel)' then 'Já é da casa'
    when r ~* '(troca|entrada|usado|aparelho bom|aparelho ótimo|aparelho otimo)' then 'Tem aparelho para dar de entrada'
    when r ~* '(à vista|a vista|pix|dinheiro|orçamento|orcamento|tem o valor|limite|cartão|cartao|parcel|pagamento)' then 'Pagamento resolvido'
    when r ~* '(modelo|cor|escolh|defini|capacidade|gb)' then 'Já escolheu o aparelho'
    when r ~* '(data|marc|hoje|amanhã|amanha|ia à loja|ia a loja|visita|buscar|retirar|horário|horario)' then 'Marcou dia ou visita'
    when r ~* '(entrega|prazo|frete|motoboy|endereço|endereco)' then 'Perguntou de entrega'
    when r ~* '(presente|aniversário|aniversario|natal)' then 'É presente'
    when r ~* '(urgên|urgen|precis|necessidade|quebrou|caiu|estragou|parou)' then 'Precisa logo'
    when r ~* 'primeiro iphone' then 'Primeiro iPhone'
    when r ~* '(quer|interess|pergunt|pediu)' then 'Demonstrou interesse'
    else 'Outros'
  end
$$;


--
-- Name: zapintel_funil_interno(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_funil_interno(p_funil bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select interno from funis where id = p_funil), false)
$$;


--
-- Name: zapintel_horario(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_horario(p_emp bigint) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('inicio', '09:00', 'fim', '18:00', 'dias', '[1,2,3,4,5]'::jsonb)
         || coalesce((select valor from configuracoes_sistema where empresa_id = p_emp and chave = 'horario'), '{}'::jsonb)
         || jsonb_build_object('configurado', exists (select 1 from configuracoes_sistema where empresa_id = p_emp and chave = 'horario'))
$$;


--
-- Name: zapintel_insights(integer, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_insights(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_desde timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, max(m.created_at) um
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->>'diagnostico' diag,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp and lead_id is not null),
  X as materialized (
    select L.*, M.um, F.cls, F.diag, F.obj, F.ps, F.si,
           (B.lead_id is not null) ligada,
           (B.lead_id is not null or F.cls = 'customer') comprou
    from L join M on M.lead_id = L.id join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
    where M.um >= v_desde and F.cls <> 'unqualified'
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  V as (
    select count(distinct coalesce(v.grupo_pdv::text, v.id::text)) vendas,
           coalesce(sum(v.valor_venda), 0) valor,
           count(distinct coalesce(v.grupo_pdv::text, v.id::text)) filter (
             where exists (select 1 from zapintel_venda_lead z where z.venda_id = v.id and z.lead_id is not null)) com_conversa
    from vendas v
    where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas)
      and v.status in ('concluida', 'encomenda')
      and coalesce(v.data_venda, v.created_at) >= v_desde
  ),
  OB as (
    select distinct X.id, X.comprou, X.cls, zapintel_familia_objecao(o->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
  ),
  SI as (
    select distinct X.id, X.comprou, zapintel_familia_sinal(s->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
  ),
  PE as (
    select X.id, X.nome, X.cls, X.um, X.filial_id, t texto,
           case when X.cls = 'customer' then 'pos'
                when X.cls = 'lost' then 'perdido'
                else 'aberto' end fase
    from X, jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t
    where t like '⚠%'
  ),
  CL as (select X.* from X where X.cls = 'customer'),
  PEDIU as (
    select distinct m.lead_id from lead_mensagens m join CL on CL.id = m.lead_id
    where m.empresa_id = v_emp and m.direcao = 'enviada'
      and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
          '(me indica|indicar algu|indica algu|conhece algu[eé]m que|algu[eé]m que (queira|precise|esteja)|indica a gente|indica a loja|nos indicar|pode indicar|indique)'
  ),
  PD as (
    select X.id, X.nome, X.diag, X.filial_id,
           coalesce((select zapintel_familia_objecao(o->>'rotulo')
                     from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) with ordinality o(o, i)
                     order by i limit 1), 'Sem objeção registrada') familia
    from X where X.cls = 'lost'
  )
  select jsonb_build_object(
    'dias', p_dias,
    'empresa', v_emp,
    'calculadoEm', v_agora,
    'conversas', (select count(*) from X),
    'taxaBase', (select round(100.0 * count(*) filter (where comprou) / nullif(count(*), 0), 1) from X),
    'comparacao', case when p_dias is null then null else jsonb_build_object(
        'vendas', (select count(distinct coalesce(v.grupo_pdv::text, v.id::text)) from vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'valor', (select coalesce(sum(v.valor_venda), 0) from vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'conversasNovas', (select count(*) from (
            select m.lead_id from lead_mensagens m join leads l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde) z),
        'conversasNovasAntes', (select count(*) from (
            select m.lead_id from lead_mensagens m join leads l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde - make_interval(days => p_dias) and min(m.created_at) < v_desde) z))
      end,
    'vendaTotal', (select jsonb_build_object(
        'registradas', V.vendas, 'valor', V.valor,
        'ticket', case when V.vendas > 0 then round(V.valor / V.vendas) end,
        'comConversa', V.com_conversa,
        'lidasNasConversas', (select count(*) from X where cls = 'customer'),
        'ligadas', (select count(*) from X where ligada),
        'semRegistro', (select count(*) from X where cls = 'customer' and not ligada
                          and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null
                          and um >= v_agora - interval '90 days'))
      from V),
    'objecoes', coalesce((select jsonb_agg(o) from (
        select jsonb_build_object(
          'familia', familia, 'leads', count(*),
          'compraram', count(*) filter (where comprou),
          'pct', round(100.0 * count(*) filter (where comprou) / count(*), 1),
          'perdidos', count(*) filter (where cls = 'lost'),
          'emAberto', count(*) filter (where cls in ('hot', 'warm', 'followup', 'stalled'))) o
        from OB where familia <> 'Outros' group by familia having count(*) >= 3
        order by count(*) filter (where cls = 'lost') desc, count(*) desc) z), '[]'::jsonb),
    'sinais', coalesce((select jsonb_agg(s) from (
        select jsonb_build_object(
          'familia', familia, 'leads', count(*),
          'compraram', count(*) filter (where comprou),
          'pct', round(100.0 * count(*) filter (where comprou) / count(*), 1)) s
        from SI where familia not in ('Depois da compra', 'Outros')
        group by familia having count(*) >= 5
        order by 1.0 * count(*) filter (where comprou) / count(*) desc) z), '[]'::jsonb),
    'pendencias', jsonb_build_object(
        'total', (select count(distinct id) from PE),
        'fases', coalesce((select jsonb_object_agg(fase, n) from (select fase, count(distinct id) n from PE group by fase) z), '{}'::jsonb),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', id, 'nome', nome, 'fase', fase, 'texto', texto, 'ultimaMensagem', um,
                                      'loja', (select rotulo from NOMES where NOMES.id = PE.filial_id)) i
            from (select PE.*, row_number() over (partition by fase order by um desc) rn from PE) PE
            where rn <= 6) z), '[]'::jsonb)),
    'clientes', jsonb_build_object(
        'total', (select count(*) from CL),
        'chegaramPorIndicacao', (select count(distinct id) from SI where familia = 'Veio por indicação'),
        'pediuIndicacao', (select count(*) from PEDIU),
        'semConversa60d', (select count(*) from CL where um < v_agora - interval '60 days'),
        'semIndicacaoPedida', (select count(*) from CL where not exists (select 1 from PEDIU where PEDIU.lead_id = CL.id))),
    'perdidos', jsonb_build_object(
        'total', (select count(*) from PD),
        'exemplos', coalesce((select jsonb_agg(e) from (
            select jsonb_build_object('leadId', id, 'nome', nome, 'familia', familia, 'diagnostico', diag,
                                      'loja', (select rotulo from NOMES where NOMES.id = PD.filial_id)) e
            from PD where diag is not null order by id desc limit 6) z), '[]'::jsonb))
  ) into v_out;

  return v_out;
end;
$$;


--
-- Name: zapintel_leads_com_conversa(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_leads_com_conversa(p_empresa bigint) RETURNS TABLE(id bigint, telefone text, origem_id text, primeira timestamp with time zone, ultima timestamp with time zone, mensagens bigint, telefone_no_texto text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with achado as (
    select l.id, regexp_replace(t[1], '\D', '', 'g') as fone
    from public.leads l
    join public.lead_mensagens m
      on m.lead_id = l.id and m.direcao = 'recebida'   -- so a fala do CLIENTE
    cross join lateral regexp_matches(
      coalesce(m.conteudo, ''), '(\(?\d{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4})', 'g'
    ) as t
    where l.empresa_id = p_empresa
  ),
  valido as (
    select id, fone from achado
    where length(fone) = 11
      and substring(fone, 1, 2)::int between 11 and 99
      and substring(fone, 3, 1) = '9'
  ),
  repetido as (
    select fone from valido group by fone having count(distinct id) > 2
  ),
  escolhido as (
    select distinct on (id) id, fone
    from valido where fone not in (select fone from repetido)
    order by id, fone
  )
  select l.id, l.telefone, l.origem_id,
         min(m.created_at) as primeira,
         max(m.created_at) as ultima,
         count(*)          as mensagens,
         max(e.fone)       as telefone_no_texto
  from public.leads l
  join public.lead_mensagens m on m.lead_id = l.id
  left join escolhido e on e.id = l.id
  where l.empresa_id = p_empresa
  group by l.id, l.telefone, l.origem_id
$$;


--
-- Name: FUNCTION zapintel_leads_com_conversa(p_empresa bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.zapintel_leads_com_conversa(p_empresa bigint) IS 'Leads com pelo menos uma mensagem, com janela, contagem e o telefone dito na conversa pelo CLIENTE (filtrado contra chave Pix, CPF e numero da loja). Base da ponte venda->conversa do ZapIntel.';


--
-- Name: zapintel_leads_lista(jsonb, text, integer, integer, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_leads_lista(p_filtros jsonb DEFAULT '{}'::jsonb, p_ordem text DEFAULT 'prioridade'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp    bigint;
  v_lojas  bigint[];
  v_agora  timestamptz := now();
  v_hoje   timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_f      jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca  text := nullif(trim(coalesce(p_filtros->>'busca', '')), '');
  v_padrao text;
  v_por    int := least(greatest(coalesce(p_por_pagina, 50), 10), 200);
  v_pag    int := greatest(coalesce(p_pagina, 1), 1);
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  if v_busca is not null then
    v_padrao := '%' || regexp_replace(replace(replace(v_busca, '%', ' '), '_', ' '), '\s+', '%', 'g') || '%';
  end if;

  with
  L as materialized (
    select l.id, l.nome, l.telefone, l.origem, l.origem_id, l.filial_id, l.created_at,
           l.kanban_status, l.convertido_em, l.produto_interessado
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um, min(m.created_at) pm
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  ACHADOS as materialized (
    select distinct m.lead_id from lead_mensagens m
    where v_padrao is not null and m.empresa_id = v_emp
      and (m.conteudo ilike v_padrao or m.transcricao ilike v_padrao)
    union
    select p.lead_id from zapintel_lead_perfil p
    where v_padrao is not null and p.empresa_id = v_emp
      and (p.perfil->>'diagnostico' ilike v_padrao or p.perfil->>'relato' ilike v_padrao)
  ),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, M.pm,
           F.fm, F.versao, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls,
           coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  BASE as materialized (
    select X.* from X
    where (v_f->>'urgencia' is null or X.urg = v_f->>'urgencia')
      and (v_f->>'canal' is null or coalesce(X.origem, 'whatsapp') = v_f->>'canal')
      and (coalesce((v_f->>'esperando')::boolean, false) = false
           or (X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified'))
      and (coalesce((v_f->>'sem_registro')::boolean, false) = false
           or (X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
               and X.convertido_em is null and X.um >= v_agora - interval '90 days'))
      and (coalesce((v_f->>'desatualizadas')::boolean, false) = false
           or (X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao)))
      and (coalesce((v_f->>'pendencias')::boolean, false) = false
           or exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%'))
      and (v_f->>'perfil' is null or X.rotulo = v_f->>'perfil')
      and (v_f->>'sinal' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                           where lower(trim(s->>'rotulo')) = lower(v_f->>'sinal')))
      and (v_f->>'objecao' is null or exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                             where zapintel_familia_objecao(o->>'rotulo') = v_f->>'objecao'))
      and (v_f->>'parado' is null or (X.cls not in ('customer', 'lost', 'unqualified') and (
            (v_f->>'parado' = 'hoje'  and X.um >= v_hoje) or
            (v_f->>'parado' = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (v_f->>'parado' = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (v_f->>'parado' = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (v_f->>'parado' = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (v_f->>'parado' = '30+'   and X.um < v_hoje - interval '30 days'))))
      and (v_f->>'modelo' is null or exists (
            select 1 from lead_mensagens m
            where m.lead_id = X.id and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
              and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
                  ('iphone\s*' || replace(v_f->>'modelo', ' ', '\s*') || '(?![0-9a-z])')))
      and (v_f->>'dias' is null or X.um >= v_agora - make_interval(days => (v_f->>'dias')::int))
      and (coalesce((v_f->>'funil')::boolean, false) = false or X.cls not in ('unqualified', 'sem_analise', 'sem_resposta'))
      and (v_f->>'sinal_familia' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                                  where zapintel_familia_sinal(s->>'rotulo') = v_f->>'sinal_familia'))
      and (v_f->>'fase' is null or (v_f->>'fase' = 'aberto' and X.cls in ('hot', 'warm', 'followup', 'stalled')))
      and (coalesce((v_f->>'largada')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours' and X.esperando))
      and (coalesce((v_f->>'retomar')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours'
               and X.ue is not null and not X.esperando))
      and (v_padrao is null
           or X.nome ilike v_padrao or X.telefone ilike v_padrao or X.produto_interessado ilike v_padrao
           or X.id in (select lead_id from ACHADOS))
  ),
  FINAL as materialized (
    select BASE.*,
           (case when BASE.cls = 'sem_analise' then 1
                 else case BASE.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end) prioridade
    from BASE
    where v_f->>'classe' is null or BASE.cls = v_f->>'classe'
  ),
  PAGINA as (
    select * from FINAL
    order by
      case when p_ordem = 'prioridade' then FINAL.prioridade end asc nulls last,
      case when p_ordem = 'prioridade' then (case when FINAL.esperando and FINAL.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
      case when p_ordem = 'prioridade' then FINAL.um end desc nulls last,
      case when p_ordem = 'recentes' then FINAL.um end desc nulls last,
      case when p_ordem = 'parados' then FINAL.um end asc nulls last,
      case when p_ordem = 'score' then FINAL.score::int end desc nulls last,
      case when p_ordem = 'mensagens' then FINAL.n end desc nulls last,
      FINAL.id desc
    limit v_por offset (v_pag - 1) * v_por
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'total', (select count(*) from FINAL),
    'pagina', v_pag,
    'porPagina', v_por,
    'contagens', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from BASE group by cls) c),
    'totalSemClasse', (select count(*) from BASE),
    'leads', (select coalesce(jsonb_agg(r), '[]') from (
        select P.id "leadId", P.nome, P.telefone, P.origem, P.origem_id "origemId",
               (select rotulo from NOMES where NOMES.id = P.filial_id) loja,
               P.cls classificacao, P.urg urgencia, P.score::int score, P.rotulo, P.acao "proximaAcao",
               P.tem_ficha "temAnalise", (P.tem_ficha and P.fm <> P.n) desatualizada,
               P.comprou,
               (P.esperando and P.ur >= v_agora - interval '72 hours' and P.cls <> 'unqualified') esperando,
               P.ur "ultimaDoCliente", P.um "ultimaMensagem", P.pm "primeiraMensagem", P.n mensagens,
               jsonb_array_length(coalesce(P.si, '[]'::jsonb)) sinais,
               jsonb_array_length(coalesce(P.obj, '[]'::jsonb)) objecoes,
               (select count(*) from jsonb_array_elements_text(coalesce(P.ps, '[]'::jsonb)) t where t like '⚠%') alertas
        from PAGINA P
        order by
          case when p_ordem = 'prioridade' then P.prioridade end asc nulls last,
          case when p_ordem = 'prioridade' then (case when P.esperando and P.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
          case when p_ordem = 'prioridade' then P.um end desc nulls last,
          case when p_ordem = 'recentes' then P.um end desc nulls last,
          case when p_ordem = 'parados' then P.um end asc nulls last,
          case when p_ordem = 'score' then P.score::int end desc nulls last,
          case when p_ordem = 'mensagens' then P.n end desc nulls last,
          P.id desc) r)
  ) into v_out;
  return v_out;
end $$;


--
-- Name: FUNCTION zapintel_leads_lista(p_filtros jsonb, p_ordem text, p_pagina integer, p_por_pagina integer, p_filial bigint, p_empresa bigint, p_versao text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.zapintel_leads_lista(p_filtros jsonb, p_ordem text, p_pagina integer, p_por_pagina integer, p_filial bigint, p_empresa bigint, p_versao text) IS 'Lista de leads do ZapIntel a partir das análises: filtros, busca (inclusive no texto das conversas), ordem e página, no escopo de quem pede (zapintel_escopo). Chamada direto do navegador.';


--
-- Name: zapintel_posvenda(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_posvenda(p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.telefone, l.filial_id, l.origem
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si,
           p.perfil->>'mensagemSugerida' msg, p.perfil->>'diagnostico' diag
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  VL as materialized (
    select distinct on (z.lead_id) z.lead_id, coalesce(v.data_venda, v.created_at) quando, v.valor_venda, pr.nome produto
    from zapintel_venda_lead z join vendas v on v.id = z.venda_id
    left join produtos pr on pr.id = v.produto_id
    where z.empresa_id = v_emp and z.lead_id is not null and v.status in ('concluida', 'encomenda')
    order by z.lead_id, coalesce(v.data_venda, v.created_at) desc
  ),
  C as materialized (
    select L.*, F.ps, F.si, F.msg, F.diag, VL.quando venda_em, VL.valor_venda, VL.produto,
           (select max(m.created_at) from lead_mensagens m where m.lead_id = L.id) um
    from L left join F on F.lead_id = L.id left join VL on VL.lead_id = L.id
    where F.cls = 'customer' or VL.lead_id is not null
  ),
  PEDIU as (
    select distinct m.lead_id from lead_mensagens m join C on C.id = m.lead_id
    where m.empresa_id = v_emp and m.direcao = 'enviada'
      and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
          '(me indica|indicar algu|indica algu|conhece algu[eé]m que|algu[eé]m que (queira|precise|esteja)|indica a gente|indica a loja|nos indicar|pode indicar|indique)'
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  R as (
    select C.*,
           (select array_agg(t) from jsonb_array_elements_text(coalesce(C.ps, '[]'::jsonb)) t where t like '⚠%') pendencias,
           exists (select 1 from PEDIU where PEDIU.lead_id = C.id) pediu,
           exists (select 1 from jsonb_array_elements(coalesce(C.si, '[]'::jsonb)) s
                   where zapintel_familia_sinal(s->>'rotulo') = 'Veio por indicação') veio_indicado
    from C
  )
  select jsonb_build_object(
    'empresa', v_emp,
    'total', (select count(*) from R),
    'comVendaRegistrada', (select count(*) from R where venda_em is not null),
    'comPendencia', (select count(*) from R where pendencias is not null),
    'semPedidoIndicacao', (select count(*) from R where not pediu),
    'semConversa60d', (select count(*) from R where um < v_agora - interval '60 days'),
    'clientes', coalesce((select jsonb_agg(c order by c->>'ordem', c->>'ultimaMensagem' desc) from (
        select jsonb_build_object(
          'leadId', id, 'nome', nome, 'telefone', telefone, 'origem', origem,
          'loja', (select rotulo from NOMES where NOMES.id = R.filial_id),
          'produto', produto, 'valor', valor_venda, 'vendaEm', venda_em,
          'ultimaMensagem', um,
          'pendencias', to_jsonb(pendencias),
          'pediuIndicacao', pediu, 'veioIndicado', veio_indicado,
          'mensagem', msg, 'diagnostico', diag,
          'ordem', case when pendencias is not null then '0' else '1' end) c
        from R) z), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;


--
-- Name: zapintel_resumo(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_resumo(p_empresa bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(null, p_empresa) e;

  with
  L as materialized (
    select l.id, l.filial_id from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*) n, max(m.created_at) um
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  C as (select L.id, L.filial_id, M.n, M.um from L join M on M.lead_id = L.id)
  select jsonb_build_object(
    'empresa', v_emp,
    'empresaNome', (select nome from empresas where id = v_emp),
    'segmento', (select segmento from empresas where id = v_emp),
    'conversas', (select count(*) from C),
    'semConversa', (select count(*) from L) - (select count(*) from C),
    'mensagens', (select coalesce(sum(n), 0) from C),
    'ultimaMensagem', (select max(um) from C),
    'lojas', (select jsonb_build_array(jsonb_build_object('id', null, 'nome', 'Toda a rede', 'leads', count(*))) from C)
             || coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome,
                                   'leads', (select count(*) from C where C.filial_id = f.id)) order by f.id)
                          from filiais f where f.empresa_id = v_emp and f.ativo and f.id = any (v_lojas)), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;


--
-- Name: zapintel_turnos(bigint, bigint[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zapintel_turnos(p_emp bigint, p_lojas bigint[], p_desde timestamp with time zone) RETURNS TABLE(lead_id bigint, filial_id bigint, chegou timestamp with time zone, espera numeric, dow integer, hora integer, aberto boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with
  H as materialized (select zapintel_horario(p_emp) h),
  HH as materialized (
    select split_part(h->>'inicio', ':', 1)::int * 60 + split_part(h->>'inicio', ':', 2)::int ini,
           split_part(h->>'fim', ':', 1)::int * 60 + split_part(h->>'fim', ':', 2)::int fim,
           array(select jsonb_array_elements_text(h->'dias')::int) dias
    from H
  ),
  L as (
    select l.id, l.filial_id from leads l
    where l.empresa_id = p_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (p_lojas)
  ),
  ATIVOS as (
    select distinct m.lead_id from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = p_emp and m.created_at >= p_desde
  ),
  MS as (
    select m.lead_id, m.direcao, m.created_at,
           lag(m.direcao) over (partition by m.lead_id order by m.created_at, m.id) dir_ant,
           min(case when m.direcao = 'enviada' then m.created_at end) over (
             partition by m.lead_id order by m.created_at desc, m.id desc
             rows between unbounded preceding and 1 preceding) resposta
    from lead_mensagens m join ATIVOS A on A.lead_id = m.lead_id
    where m.empresa_id = p_emp
  ),
  T as (
    select MS.lead_id, L.filial_id, MS.created_at chegou,
           (extract(epoch from MS.resposta - MS.created_at) / 60)::numeric espera,
           extract(dow from MS.created_at at time zone 'America/Sao_Paulo')::int dow,
           extract(hour from MS.created_at at time zone 'America/Sao_Paulo')::int hora,
           (extract(hour from MS.created_at at time zone 'America/Sao_Paulo') * 60
            + extract(minute from MS.created_at at time zone 'America/Sao_Paulo'))::int minuto
    from MS join L on L.id = MS.lead_id
    where MS.direcao = 'recebida' and MS.dir_ant is distinct from 'recebida'
      and MS.created_at >= p_desde
  )
  select T.lead_id, T.filial_id, T.chegou, T.espera, T.dow, T.hora,
         (T.dow = any (HH.dias) and T.minuto >= HH.ini and T.minuto < HH.fim) aberto
  from T, HH
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acessos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acessos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    entrada timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_sinal timestamp with time zone DEFAULT now() NOT NULL,
    saida timestamp with time zone,
    fim_por text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE acessos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.acessos IS 'Sessões de uso do CRM: entrada, pulso e saída. Base do relatório de uso por funcionário.';


--
-- Name: COLUMN acessos.ultimo_sinal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.acessos.ultimo_sinal IS 'Último sinal de vida; é o fim da sessão quando a pessoa fecha a aba sem sair.';


--
-- Name: acessos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acessos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acessos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acessos_id_seq OWNED BY public.acessos.id;


--
-- Name: assistente_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistente_config (
    id smallint DEFAULT 1 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    limite_por_min integer DEFAULT 20 NOT NULL,
    modelo text DEFAULT 'gemini-2.0-flash'::text NOT NULL,
    system_extra text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistente_config_single CHECK ((id = 1))
);


--
-- Name: assistente_uso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistente_uso (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tokens_in integer,
    tokens_out integer
);


--
-- Name: assistente_uso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.assistente_uso ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.assistente_uso_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: automacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automacoes (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    etapa_slug text,
    gatilho text NOT NULL,
    horas integer,
    acao text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automacoes_acao_check CHECK ((acao = ANY (ARRAY['criar_tarefa'::text, 'enviar_whatsapp_template'::text, 'notificar_gestor'::text]))),
    CONSTRAINT automacoes_gatilho_check CHECK ((gatilho = ANY (ARRAY['entrou_na_etapa'::text, 'parado_x_horas'::text])))
);


--
-- Name: TABLE automacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.automacoes IS 'Automações de etapa (Fase 4.3). etapa_slug = leads.kanban_status alvo (null = qualquer). gatilho entrou_na_etapa dispara no move do lead; parado_x_horas roda no cron gerar-followups. Ações só criam tarefas internas (não envia Meta).';


--
-- Name: automacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.automacoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.automacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: avaliacoes_usados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avaliacoes_usados (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    veiculo jsonb,
    km integer,
    fotos_urls text,
    valor_mercado numeric,
    valor_ofertado numeric,
    status text DEFAULT 'em_analise'::text NOT NULL,
    observacoes text,
    usuario_id uuid,
    unidade_id bigint,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint,
    CONSTRAINT avaliacoes_usados_status_check CHECK ((status = ANY (ARRAY['em_analise'::text, 'ofertado'::text, 'aceito'::text, 'recusado'::text])))
);


--
-- Name: avaliacoes_usados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.avaliacoes_usados ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.avaliacoes_usados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: avisos_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avisos_plataforma (
    id bigint NOT NULL,
    titulo text NOT NULL,
    corpo text DEFAULT ''::text NOT NULL,
    tom text DEFAULT 'info'::text NOT NULL,
    alvo text DEFAULT 'todos'::text NOT NULL,
    alvo_valor text,
    ativo boolean DEFAULT true NOT NULL,
    expira_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avisos_plataforma_alvo_check CHECK ((alvo = ANY (ARRAY['todos'::text, 'plano'::text, 'empresa'::text]))),
    CONSTRAINT avisos_plataforma_tom_check CHECK ((tom = ANY (ARRAY['info'::text, 'alerta'::text, 'sucesso'::text])))
);


--
-- Name: TABLE avisos_plataforma; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.avisos_plataforma IS 'Avisos da plataforma exibidos como banner no topo do app dos tenants alvo. Gerido pelo superadmin em /superadmin/avisos. alvo: todos | plano (alvo_valor=free/starter/pro) | empresa (alvo_valor=empresa_id).';


--
-- Name: avisos_plataforma_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.avisos_plataforma ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.avisos_plataforma_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cadencia_execucoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadencia_execucoes (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    inscricao_id bigint NOT NULL,
    passo_ordem integer,
    canal text,
    resultado text,
    observacao text,
    executado_por uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cadencia_execucoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_execucoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cadencia_execucoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cadencia_inscricoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadencia_inscricoes (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    cadencia_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    responsavel_id uuid,
    status text DEFAULT 'ativa'::text NOT NULL,
    passo_ordem integer DEFAULT 1 NOT NULL,
    proxima_acao_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    concluida_em timestamp with time zone,
    filial_id bigint
);


--
-- Name: cadencia_inscricoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_inscricoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cadencia_inscricoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cadencia_passos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadencia_passos (
    id bigint NOT NULL,
    cadencia_id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    ordem integer NOT NULL,
    canal text DEFAULT 'ligacao'::text NOT NULL,
    dia_offset integer DEFAULT 0 NOT NULL,
    titulo text NOT NULL,
    template_chave text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cadencia_passos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_passos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cadencia_passos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cadencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadencias (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    gatilho text DEFAULT 'manual'::text NOT NULL,
    gatilho_etapa_slug text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cadencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cadencias ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cadencias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campanhas_fidelidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campanhas_fidelidade (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    gatilho text NOT NULL,
    dias integer,
    titulo text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campanhas_fidelidade_gatilho_check CHECK ((gatilho = ANY (ARRAY['aniversario_compra'::text, 'retorno_consulta'::text, 'aniversario_cliente'::text])))
);


--
-- Name: campanhas_fidelidade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campanhas_fidelidade ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campanhas_fidelidade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: canais_conectados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canais_conectados (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    tipo text NOT NULL,
    external_id text NOT NULL,
    waba_id text,
    ig_user_id text,
    nome_exibicao text,
    access_token_enc text,
    token_expira_em timestamp with time zone,
    data_access_expira_em timestamp with time zone,
    coexistencia boolean DEFAULT false NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    ultimo_erro text,
    ultimo_erro_em timestamp with time zone,
    conectado_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_msg_em timestamp with time zone,
    sync_contatos_em timestamp with time zone,
    sync_historico_em timestamp with time zone,
    sync_request_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    sync_historico_pct smallint,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint,
    via text DEFAULT 'pagina'::text NOT NULL,
    CONSTRAINT canais_conectados_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'expirado'::text, 'erro'::text, 'desconectado'::text]))),
    CONSTRAINT canais_conectados_tipo_check CHECK ((tipo = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'messenger'::text]))),
    CONSTRAINT canais_via_valido CHECK ((via = ANY (ARRAY['pagina'::text, 'instagram'::text])))
);


--
-- Name: TABLE canais_conectados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canais_conectados IS 'Canais Meta conectados por empresa. external_id resolve o tenant no webhook. access_token_enc cifrado e sem grant de leitura para o client.';


--
-- Name: COLUMN canais_conectados.via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.canais_conectados.via IS 'Como o canal foi conectado: pagina (token da Pagina, graph.facebook.com) ou instagram (token da conta, graph.instagram.com). Decide o caminho de ENVIO.';


--
-- Name: canais_conectados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.canais_conectados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: canais_conectados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.canais_conectados_id_seq OWNED BY public.canais_conectados.id;


--
-- Name: categorias_produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_produtos (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    tipo_formulario text DEFAULT 'outro'::text,
    ordem integer DEFAULT 0,
    empresa_id bigint NOT NULL
);


--
-- Name: categorias_produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias_produtos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categorias_produtos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chamadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chamadas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    usuario_id uuid,
    direcao text DEFAULT 'saida'::text NOT NULL,
    resultado text DEFAULT 'atendida'::text NOT NULL,
    duracao_seg integer,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint,
    CONSTRAINT chamadas_direcao_check CHECK ((direcao = ANY (ARRAY['entrada'::text, 'saida'::text]))),
    CONSTRAINT chamadas_resultado_check CHECK ((resultado = ANY (ARRAY['atendida'::text, 'nao_atendida'::text, 'caixa_postal'::text, 'ocupado'::text, 'retornar'::text])))
);


--
-- Name: chamadas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chamadas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chamadas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_leituras (
    empresa_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    conversa text NOT NULL,
    lido_ate timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chaves_imoveis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chaves_imoveis (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    imovel_id bigint,
    codigo text,
    status text DEFAULT 'na_imobiliaria'::text NOT NULL,
    com_quem text,
    retirada_em timestamp with time zone,
    devolucao_prevista date,
    observacoes text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chaves_imoveis_status_check CHECK ((status = ANY (ARRAY['na_imobiliaria'::text, 'emprestada'::text])))
);


--
-- Name: chaves_imoveis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chaves_imoveis ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chaves_imoveis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id bigint NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    cpf_cnpj text,
    cpf_validado boolean DEFAULT false,
    cnpj_validado boolean DEFAULT false,
    data_nascimento date,
    endereco text,
    cidade text,
    estado text,
    cep text,
    tipo_cliente text DEFAULT 'novo'::text,
    instagram text,
    origem_cliente text DEFAULT 'loja_fisica'::text,
    observacoes text,
    ativo boolean DEFAULT true,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    estado_civil text,
    profissao text,
    nacionalidade text,
    numero text,
    complemento text,
    bairro text,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    tipo_negocio text,
    status_aprovacao text DEFAULT 'pendente'::text NOT NULL,
    corretor_id uuid,
    valor_pretendido numeric,
    regiao_interesse text,
    proprietario boolean DEFAULT false NOT NULL,
    filial_id bigint,
    CONSTRAINT clientes_status_aprovacao_check CHECK ((status_aprovacao = ANY (ARRAY['pendente'::text, 'em_analise'::text, 'aprovado'::text, 'reprovado'::text]))),
    CONSTRAINT clientes_tipo_negocio_check CHECK (((tipo_negocio IS NULL) OR (tipo_negocio = ANY (ARRAY['compra'::text, 'locacao'::text, 'captacao'::text, 'investidor'::text, 'lancamento'::text]))))
);


--
-- Name: COLUMN clientes.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.lead_id IS 'Jornada da MESMA pessoa: etapa, score e responsável vêm daqui.';


--
-- Name: COLUMN clientes.tipo_negocio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.tipo_negocio IS 'compra|locacao|captacao|investidor|lancamento (sentido imobiliário).';


--
-- Name: COLUMN clientes.status_aprovacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.status_aprovacao IS 'pendente|em_analise|aprovado|reprovado — resultado da análise cadastral.';


--
-- Name: COLUMN clientes.proprietario; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.proprietario IS 'Papel: esta pessoa é proprietária de imóvel na carteira. Acumula com tipo_cliente.';


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.clientes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.clientes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cobrancas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cobrancas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    provider text NOT NULL,
    provider_ref text,
    tipo text NOT NULL,
    valor numeric(12,2) NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    descricao text,
    cliente_id bigint,
    venda_id bigint,
    os_id bigint,
    qr_code text,
    qr_code_base64 text,
    link_pagamento text,
    linha_digitavel text,
    vencimento date,
    pago_em timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint
);


--
-- Name: cobrancas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cobrancas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cobrancas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comissoes (
    id bigint NOT NULL,
    venda_id bigint,
    usuario_id uuid,
    valor_comissao numeric(12,2),
    percentual numeric(5,2),
    status text DEFAULT 'pendente'::text,
    data_pagamento date,
    zerado_em timestamp with time zone,
    zerado_por uuid,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    mes_referencia text,
    filial_id bigint
);


--
-- Name: comissoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comissoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.comissoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: complementos_empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complementos_empresa (
    empresa_id bigint NOT NULL,
    zapintel_ativo boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE complementos_empresa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.complementos_empresa IS 'Complementos pagos por empresa. Era tracker_addons; renomeada quando o módulo Tracker foi removido (13/08/2026). Hoje controla o ZapIntel.';


--
-- Name: configuracoes_sistema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes_sistema (
    id bigint NOT NULL,
    chave text NOT NULL,
    valor jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL
);


--
-- Name: configuracoes_sistema_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes_sistema ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.configuracoes_sistema_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contrato_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato_documentos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    arquivado boolean DEFAULT false NOT NULL,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE contrato_documentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contrato_documentos IS 'Documentos da loja (contrato de venda, garantia, etc). As paginas ficam em contrato_modelos, versionadas.';


--
-- Name: contrato_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contrato_documentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.contrato_documentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contrato_modelos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato_modelos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    versao integer NOT NULL,
    paginas jsonb DEFAULT '[]'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    documento_id bigint NOT NULL
);


--
-- Name: TABLE contrato_modelos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contrato_modelos IS 'Modelo do contrato de venda por empresa. Versionado: salvar cria versao nova.';


--
-- Name: COLUMN contrato_modelos.paginas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contrato_modelos.paginas IS 'Paginas: ordem, fundo_url (Storage), escuro (texto claro), texto_html com {{marcadores}}.';


--
-- Name: contrato_modelos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contrato_modelos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.contrato_modelos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contratos_venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos_venda (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    cliente_id bigint,
    venda_ids bigint[] NOT NULL,
    dados jsonb NOT NULL,
    html text NOT NULL,
    garantia_dias integer,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    documento_id bigint,
    nome_documento text,
    filial_id bigint
);


--
-- Name: TABLE contratos_venda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contratos_venda IS 'Contratos de venda emitidos. Imutavel: a 2a via reimprime, nunca regera.';


--
-- Name: COLUMN contratos_venda.venda_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos_venda.venda_ids IS 'Linhas de vendas que compoem a venda (o PDV grava uma por item).';


--
-- Name: COLUMN contratos_venda.html; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos_venda.html IS 'Documento como foi emitido; a 2a via imprime exatamente isto.';


--
-- Name: COLUMN contratos_venda.nome_documento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos_venda.nome_documento IS 'Nome do documento no momento da emissao (copia congelada).';


--
-- Name: contratos_venda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contratos_venda ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.contratos_venda_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: diagnostico_canais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnostico_canais (
    id bigint NOT NULL,
    empresa_id bigint,
    etapa text NOT NULL,
    origem_url text,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE diagnostico_canais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.diagnostico_canais IS 'Log temporário do fluxo de conexão de canais (lado navegador). Apagar quando o fluxo estiver estável.';


--
-- Name: diagnostico_canais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnostico_canais_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diagnostico_canais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnostico_canais_id_seq OWNED BY public.diagnostico_canais.id;


--
-- Name: distribuicao_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distribuicao_regras (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    ordem integer DEFAULT 1 NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criterio text DEFAULT 'qualquer'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    destinatarios jsonb DEFAULT '[]'::jsonb NOT NULL,
    rodizio_ptr integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: distribuicao_regras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.distribuicao_regras ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.distribuicao_regras_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: empresa_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_usuarios (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    role text DEFAULT 'vendedor'::text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    ausente boolean DEFAULT false NOT NULL,
    ausente_em timestamp with time zone,
    filial_id bigint,
    CONSTRAINT empresa_usuarios_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'vendedor'::text, 'tecnico'::text])))
);


--
-- Name: COLUMN empresa_usuarios.ausente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresa_usuarios.ausente IS 'Almoço/ausência: não recebe distribuição e liberou os leads dele.';


--
-- Name: empresa_usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_usuarios_id_seq OWNED BY public.empresa_usuarios.id;


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id bigint NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    plano text DEFAULT 'starter'::text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    wl_cor text DEFAULT '#D7282F'::text,
    wl_logo_url text,
    wl_slogan text,
    wl_whatsapp text,
    limite_usuarios integer DEFAULT 3,
    limite_leads integer DEFAULT 500,
    stripe_customer_id text,
    stripe_subscription_id text,
    trial_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stripe_price_id text,
    stripe_status text DEFAULT 'trialing'::text,
    cnpj text,
    telefone text,
    segmento text DEFAULT 'varejo'::text NOT NULL,
    wl_menu jsonb,
    modulos_override jsonb,
    menu_override jsonb,
    menu_config jsonb,
    permissoes jsonb,
    demo boolean DEFAULT false,
    email text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    representante_nome text,
    representante_cpf text,
    banco_nome text,
    banco_agencia text,
    banco_conta text,
    banco_pix text,
    representante_nacionalidade text,
    representante_estado_civil text,
    representante_profissao text,
    CONSTRAINT empresas_plano_check CHECK ((plano = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text]))),
    CONSTRAINT empresas_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'suspenso'::text, 'cancelado'::text]))),
    CONSTRAINT empresas_stripe_status_check CHECK ((stripe_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text])))
);


--
-- Name: COLUMN empresas.wl_menu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.wl_menu IS 'Tema da sidebar (white-label do menu): { preset, fundo, texto, ativo_fundo, ativo_texto }';


--
-- Name: COLUMN empresas.modulos_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.modulos_override IS 'Superadmin: força liga/desliga de módulo do plano por empresa. { bi: true, multi_usuario: false, ... }';


--
-- Name: COLUMN empresas.menu_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.menu_override IS 'Superadmin (camada 3): { hidden: [hrefs], labels: {href: label} } por empresa.';


--
-- Name: COLUMN empresas.menu_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.menu_config IS 'Dono (camada 4): { hidden: [hrefs], labels: {href: label} } dentro do permitido.';


--
-- Name: COLUMN empresas.permissoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.permissoes IS 'Matriz de permissões por papel: { admin: {...}, vendedor: {...}, tecnico: {...} }. owner = total.';


--
-- Name: COLUMN empresas.demo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.demo IS 'Empresa de demonstração (preview de segmento). Excluir de métricas/cobrança/listas reais.';


--
-- Name: COLUMN empresas.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.estado IS 'UF, duas letras.';


--
-- Name: COLUMN empresas.representante_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.representante_nome IS 'Quem assina pela loja nos contratos ({{loja.representante}}).';


--
-- Name: COLUMN empresas.banco_pix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empresas.banco_pix IS 'Chave PIX impressa no contrato. Nao e credencial de cobranca — esta em tenant_payment_config.';


--
-- Name: empresas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresas_id_seq OWNED BY public.empresas.id;


--
-- Name: fichas_financiamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fichas_financiamento (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    banco text,
    valor numeric,
    entrada numeric,
    parcelas integer,
    taxa numeric,
    status text DEFAULT 'enviada'::text NOT NULL,
    observacoes text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint,
    CONSTRAINT fichas_financiamento_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'aprovada'::text, 'negada'::text])))
);


--
-- Name: fichas_financiamento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.fichas_financiamento ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.fichas_financiamento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: filiais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filiais (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    matriz boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    cnpj text,
    telefone text,
    email text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    representante_nome text,
    representante_cpf text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: filiais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.filiais_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: filiais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.filiais_id_seq OWNED BY public.filiais.id;


--
-- Name: fipe_consultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fipe_consultas (
    id bigint NOT NULL,
    tipo smallint NOT NULL,
    codigo_marca integer NOT NULL,
    codigo_modelo integer NOT NULL,
    ano text NOT NULL,
    referencia_codigo integer NOT NULL,
    marca_nome text,
    modelo_nome text,
    ano_label text,
    valor numeric,
    codigo_fipe text,
    mes_referencia text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: fipe_consultas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.fipe_consultas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.fipe_consultas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fipe_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fipe_referencia (
    id smallint DEFAULT 1 NOT NULL,
    codigo integer,
    mes text,
    atualizado_em timestamp with time zone,
    CONSTRAINT fipe_referencia_single CHECK ((id = 1))
);


--
-- Name: followups_gerados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followups_gerados (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    tarefa_id bigint,
    regra text NOT NULL,
    chave text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint
);


--
-- Name: followups_gerados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.followups_gerados ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.followups_gerados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fornecedores (
    id bigint NOT NULL,
    nome_fantasia text NOT NULL,
    razao_social text,
    cnpj text,
    telefone text,
    email text,
    contato text,
    observacoes text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL
);


--
-- Name: fornecedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.fornecedores ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.fornecedores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: funil_etapas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funil_etapas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    cor text DEFAULT '#9199A3'::text NOT NULL,
    tipo text DEFAULT 'normal'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    funil_id bigint,
    probabilidade integer DEFAULT 0 NOT NULL,
    campos_obrigatorios jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT funil_etapas_tipo_check CHECK ((tipo = ANY (ARRAY['normal'::text, 'negociacao'::text, 'ganho'::text, 'perdido'::text])))
);


--
-- Name: COLUMN funil_etapas.probabilidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funil_etapas.probabilidade IS 'Peso (%) da etapa no forecast (Fase 4.4). Ex.: ganho=100, perdido=0.';


--
-- Name: COLUMN funil_etapas.campos_obrigatorios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funil_etapas.campos_obrigatorios IS 'Campos do lead obrigatórios para ENTRAR nesta etapa (Fase 4.6). Ex.: ["telefone","valor_estimado"]. Kanban bloqueia o drop se faltar.';


--
-- Name: funil_etapas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.funil_etapas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.funil_etapas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: funis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funis (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    padrao boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    interno boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE funis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.funis IS 'Múltiplos funis por empresa (Fase 4.1). funil padrão recebe leads sem funil.';


--
-- Name: COLUMN funis.interno; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funis.interno IS 'Funil da equipe (conversas internas: vendedores, contas da própria loja). Leads nele ficam fora das métricas e análises do ZapIntel. 15/10/2026.';


--
-- Name: funis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.funis ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.funis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: garantias_assistencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garantias_assistencias (
    id bigint NOT NULL,
    tipo text DEFAULT 'assistencia'::text,
    protocolo text,
    cliente_id bigint,
    produto_id bigint,
    usuario_id uuid,
    responsavel_tecnico_id uuid,
    imei_serial text,
    defeito_relatado text,
    estado_entrada text,
    parecer_tecnico text,
    orcamento_valor numeric(12,2),
    celular_reserva_fornecido boolean DEFAULT false,
    modelo_reserva text,
    dentro_garantia boolean DEFAULT false,
    dias_garantia_restantes integer DEFAULT 0,
    status text DEFAULT 'aguardando_analise'::text,
    observacoes text,
    data_entrada timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text),
    aprovado_em timestamp with time zone,
    recusado_em timestamp with time zone,
    filial_id bigint
);


--
-- Name: COLUMN garantias_assistencias.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.garantias_assistencias.token IS 'Token do link público de aprovação do orçamento (/os/[token]).';


--
-- Name: garantias_assistencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.garantias_assistencias ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.garantias_assistencias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: historico_bruto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_bruto (
    id bigint NOT NULL,
    empresa_id bigint,
    canal_id bigint,
    tipo text NOT NULL,
    payload jsonb NOT NULL,
    processado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historico_bruto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.historico_bruto ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.historico_bruto_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: imei_consultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imei_consultas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    imei text NOT NULL,
    resultado text NOT NULL,
    motivo text,
    fonte text DEFAULT 'manual'::text NOT NULL,
    observacoes text,
    consultado_por uuid,
    consultado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT imei_consultas_resultado_valido CHECK ((resultado = ANY (ARRAY['aprovado'::text, 'reprovado'::text, 'inconclusivo'::text])))
);


--
-- Name: TABLE imei_consultas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.imei_consultas IS 'Consultas de IMEI na base de aparelhos impedidos. Somente inserção: cada consulta é um fato datado.';


--
-- Name: imei_consultas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.imei_consultas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: imei_consultas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.imei_consultas_id_seq OWNED BY public.imei_consultas.id;


--
-- Name: imoveis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imoveis (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    proprietario_id bigint,
    codigo text,
    titulo text,
    tipo text DEFAULT 'apartamento'::text NOT NULL,
    finalidade text DEFAULT 'venda'::text NOT NULL,
    status text DEFAULT 'disponivel'::text NOT NULL,
    descricao text,
    valor_venda numeric,
    valor_locacao numeric,
    valor_condominio numeric,
    valor_iptu numeric,
    iptu_periodicidade text DEFAULT 'anual'::text,
    area_util numeric,
    area_total numeric,
    quartos integer DEFAULT 0,
    suites integer DEFAULT 0,
    banheiros integer DEFAULT 0,
    vagas integer DEFAULT 0,
    matricula text,
    aceita_permuta boolean DEFAULT false,
    aceita_financiamento boolean DEFAULT false,
    publicar_portais boolean DEFAULT false,
    cep text,
    logradouro text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf text,
    latitude numeric,
    longitude numeric,
    ocultar_numero_publico boolean DEFAULT false,
    fotos jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    captado_por uuid,
    captado_em date
);


--
-- Name: COLUMN imoveis.captado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.imoveis.captado_por IS 'Corretor que captou o imóvel. Alimenta "Captações" no ranking e o rateio da comissão.';


--
-- Name: imoveis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.imoveis ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.imoveis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: integracao_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integracao_eventos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    origem text NOT NULL,
    acao text,
    status text NOT NULL,
    lead_id bigint,
    externo_id text,
    detalhes text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integracao_eventos_status_check CHECK ((status = ANY (ARRAY['sucesso'::text, 'erro'::text, 'ignorado'::text])))
);


--
-- Name: TABLE integracao_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.integracao_eventos IS 'O que cada integração externa mandou e o que o CRM fez — sucesso, erro ou ignorado (repetição).';


--
-- Name: integracao_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integracao_eventos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integracao_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integracao_eventos_id_seq OWNED BY public.integracao_eventos.id;


--
-- Name: inventario_unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventario_unidades (
    id bigint NOT NULL,
    produto_id bigint,
    imei text,
    imei2 text,
    numero_serie text,
    bateria text,
    condicao text,
    cor text,
    armazenamento text,
    preco_custo numeric,
    preco_venda numeric,
    fornecedor_id bigint,
    observacoes text,
    status text DEFAULT 'disponivel'::text,
    usuario_id uuid,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    anatel_resultado text,
    tipo text DEFAULT 'compra'::text,
    estado text DEFAULT 'lacrado'::text,
    custo_reparo numeric,
    cliente_id bigint,
    fotos_urls text,
    empresa_id bigint NOT NULL,
    placa text,
    chassi text,
    renavam text,
    km integer,
    ano integer,
    reservado_lead_id bigint,
    reservado_por uuid,
    reservado_em timestamp with time zone,
    reserva_expira_em timestamp with time zone,
    grupo_pdv uuid,
    recebido_em timestamp with time zone,
    recebido_por uuid,
    quantidade integer DEFAULT 1 NOT NULL,
    filial_id bigint,
    CONSTRAINT inventario_unidades_quantidade_nao_negativa CHECK ((quantidade >= 0))
);


--
-- Name: COLUMN inventario_unidades.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.usuario_id IS 'Vendedor responsavel pela unidade — em entrada por troca, quem aceitou o aparelho.';


--
-- Name: COLUMN inventario_unidades.placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.placa IS 'Veículos: placa (opcional — barco/jetski/0km podem não ter).';


--
-- Name: COLUMN inventario_unidades.chassi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.chassi IS 'Veículos: número do chassi.';


--
-- Name: COLUMN inventario_unidades.renavam; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.renavam IS 'Veículos: RENAVAM.';


--
-- Name: COLUMN inventario_unidades.km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.km IS 'Veículos: quilometragem (usados).';


--
-- Name: COLUMN inventario_unidades.ano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.ano IS 'Veículos: ano/modelo.';


--
-- Name: COLUMN inventario_unidades.reservado_lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.reservado_lead_id IS 'Lead para quem a unidade está reservada (NULL em reserva de entrega pendente do PDV)';


--
-- Name: COLUMN inventario_unidades.reservado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.reservado_por IS 'Vendedor que fez a reserva — só ele ou admin cancela';


--
-- Name: COLUMN inventario_unidades.grupo_pdv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.grupo_pdv IS 'Fechamento do PDV que trouxe esta unidade (entrada por troca).';


--
-- Name: COLUMN inventario_unidades.recebido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.recebido_em IS 'Quando a chegada fisica foi confirmada. Nulo enquanto status = pendente.';


--
-- Name: COLUMN inventario_unidades.quantidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventario_unidades.quantidade IS 'Saldo do lote. Sempre 1 em item serializado (celular, veículo); N em item sem número de série.';


--
-- Name: inventario_unidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventario_unidades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventario_unidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventario_unidades_id_seq OWNED BY public.inventario_unidades.id;


--
-- Name: lancamentos_financeiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos_financeiros (
    id bigint NOT NULL,
    tipo text NOT NULL,
    descricao text NOT NULL,
    valor numeric(12,2) NOT NULL,
    data_venc date NOT NULL,
    data_pgto date,
    status text DEFAULT 'pendente'::text NOT NULL,
    categoria text,
    forma_pgto text,
    referencia_id bigint,
    referencia_tp text,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    filial_id bigint,
    CONSTRAINT lancamentos_financeiros_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'pago'::text, 'atrasado'::text, 'cancelado'::text]))),
    CONSTRAINT lancamentos_financeiros_tipo_check CHECK ((tipo = ANY (ARRAY['receita'::text, 'despesa'::text])))
);


--
-- Name: lancamentos_financeiros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lancamentos_financeiros_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lancamentos_financeiros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lancamentos_financeiros_id_seq OWNED BY public.lancamentos_financeiros.id;


--
-- Name: lead_atribuicoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_atribuicoes (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    de_responsavel uuid,
    para_responsavel uuid,
    por_usuario uuid,
    acao text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint
);


--
-- Name: TABLE lead_atribuicoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_atribuicoes IS 'Histórico de posse/roteamento de leads (Fase 4.7): pegar, devolver, transferir, atribuir.';


--
-- Name: lead_atribuicoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lead_atribuicoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.lead_atribuicoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lead_mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_mensagens (
    id bigint NOT NULL,
    lead_id bigint,
    direcao text NOT NULL,
    conteudo text NOT NULL,
    origem text,
    lida boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    external_id text,
    tipo text DEFAULT 'texto'::text NOT NULL,
    midia_url text,
    status_entrega text,
    erro_envio text,
    status_em timestamp with time zone,
    usuario_id uuid,
    filial_id bigint,
    canal_id bigint,
    transcricao text,
    midia_retida_em timestamp with time zone,
    CONSTRAINT lead_mensagens_direcao_check CHECK ((direcao = ANY (ARRAY['enviada'::text, 'recebida'::text]))),
    CONSTRAINT lead_mensagens_status_entrega_check CHECK ((status_entrega = ANY (ARRAY['enviada'::text, 'entregue'::text, 'lida'::text, 'falhou'::text])))
);


--
-- Name: COLUMN lead_mensagens.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.tipo IS 'texto | imagem | video | audio';


--
-- Name: COLUMN lead_mensagens.midia_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.midia_url IS 'URL pública no bucket chat-midia (Supabase Storage)';


--
-- Name: COLUMN lead_mensagens.status_entrega; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.status_entrega IS 'Status vindo do webhook da Meta. NULL = mensagem recebida do cliente ou canal sem confirmação.';


--
-- Name: COLUMN lead_mensagens.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.usuario_id IS 'Atendente que enviou pelo CRM. NULL = enviada fora do CRM (eco do celular).';


--
-- Name: COLUMN lead_mensagens.canal_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.canal_id IS 'Canal por onde a mensagem entrou ou saiu. A filial da linha vem do LEAD; esta coluna guarda o numero/conta de verdade.';


--
-- Name: COLUMN lead_mensagens.transcricao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.transcricao IS 'Transcricao do audio via Whisper. NULL = nao transcrito; string vazia = sem fala detectada; texto = transcricao.';


--
-- Name: COLUMN lead_mensagens.midia_retida_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_mensagens.midia_retida_em IS 'Quando a retencao removeu o arquivo. NULL = nunca houve arquivo, ou ele ainda esta la.';


--
-- Name: lead_mensagens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lead_mensagens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.lead_mensagens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lead_perfil_busca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_perfil_busca (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    finalidade text,
    tipos text[] DEFAULT '{}'::text[] NOT NULL,
    cidades text[] DEFAULT '{}'::text[] NOT NULL,
    bairros text[] DEFAULT '{}'::text[] NOT NULL,
    preco_min numeric,
    preco_max numeric,
    quartos_min integer,
    vagas_min integer,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cliente_id bigint,
    quartos_max integer,
    suites_min integer,
    area_min numeric,
    area_max numeric,
    caracteristicas text[],
    observacoes text,
    filial_id bigint,
    CONSTRAINT lead_perfil_busca_tem_dono CHECK (((lead_id IS NOT NULL) OR (cliente_id IS NOT NULL)))
);


--
-- Name: lead_perfil_busca_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lead_perfil_busca ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.lead_perfil_busca_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id bigint NOT NULL,
    nome text,
    telefone text,
    instagram text,
    origem text,
    kanban_status text DEFAULT 'novo'::text,
    responsavel_id uuid,
    convertido_em bigint,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    origem_id text,
    ativo boolean DEFAULT true,
    primeira_msg text,
    msgs_nao_lidas integer DEFAULT 0,
    ultima_tratativa timestamp with time zone,
    data_transferencia_funil timestamp with time zone,
    ultima_mensagem_at timestamp with time zone,
    produto_interessado text,
    kanban_ordem integer DEFAULT 0,
    empresa_id bigint NOT NULL,
    valor_estimado numeric(12,2),
    motivo_perda_id bigint,
    perdido_em timestamp with time zone,
    funil_id bigint,
    interesse jsonb,
    foto_url text,
    responsavel_desde timestamp with time zone,
    devolvido_em timestamp with time zone,
    devolucoes integer DEFAULT 0 NOT NULL,
    ultima_recebida_at timestamp with time zone,
    ultima_enviada_at timestamp with time zone,
    anuncio jsonb,
    filial_id bigint
);


--
-- Name: COLUMN leads.interesse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.interesse IS 'Veículos: perfil de interesse do lead p/ match com o estoque ({categoria,marca,modelo,ano_min,ano_max,preco_max,km_max}).';


--
-- Name: COLUMN leads.foto_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.foto_url IS 'Foto de perfil copiada para o bucket chat-midia. Null = sem foto (sempre o caso no WhatsApp).';


--
-- Name: COLUMN leads.responsavel_desde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.responsavel_desde IS 'Quando o responsável atual assumiu — base do prazo de devolução à esteira.';


--
-- Name: COLUMN leads.devolvido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.devolvido_em IS 'Última vez que o lead voltou à esteira por falta de resposta.';


--
-- Name: COLUMN leads.anuncio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.anuncio IS 'Anúncio que originou o contato (Click-to-WhatsApp / IG Ads). Sempre o mais recente; o histórico de cada entrada fica no chat, como mensagem tipo "anuncio".';


--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.leads ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lista_espera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lista_espera (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    telefone text,
    observacao text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lista_espera_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lista_espera ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.lista_espera_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: marcas_produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcas_produtos (
    id bigint NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ativo boolean DEFAULT true,
    ordem integer DEFAULT 0,
    empresa_id bigint NOT NULL
);


--
-- Name: marcas_produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.marcas_produtos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.marcas_produtos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mensagens_internas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens_internas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    autor_id uuid NOT NULL,
    tipo text DEFAULT 'mural'::text NOT NULL,
    destinatario_id uuid,
    conteudo text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mensagens_internas_tipo_check CHECK ((tipo = ANY (ARRAY['mural'::text, 'direto'::text])))
);


--
-- Name: mensagens_internas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_internas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mensagens_internas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    escopo text DEFAULT 'pessoa'::text NOT NULL,
    usuario_id uuid,
    tipo text DEFAULT 'vendas'::text NOT NULL,
    alvo numeric DEFAULT 0 NOT NULL,
    periodo text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint
);


--
-- Name: metas_comissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas_comissoes (
    id bigint NOT NULL,
    usuario_id uuid,
    mes_ano text NOT NULL,
    meta_vendas_valor numeric(12,2) DEFAULT 0,
    meta_vendas_qtd integer DEFAULT 0,
    percentual_comissao_padrao numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    filial_id bigint
);


--
-- Name: metas_comissoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metas_comissoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.metas_comissoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: metas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.metas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: modelos_mensagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modelos_mensagem (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    idioma text DEFAULT 'pt_BR'::text NOT NULL,
    categoria text DEFAULT 'UTILITY'::text NOT NULL,
    corpo text NOT NULL,
    variaveis jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    motivo_recusa text,
    meta_id text,
    ultima_sync_em timestamp with time zone,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_mensagem_categoria_check CHECK ((categoria = ANY (ARRAY['UTILITY'::text, 'MARKETING'::text, 'AUTHENTICATION'::text]))),
    CONSTRAINT modelos_mensagem_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'pausado'::text, 'desativado'::text])))
);


--
-- Name: TABLE modelos_mensagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.modelos_mensagem IS 'Espelho dos templates aprovados na Meta. Necessários para retomar conversa fora da janela de 24h.';


--
-- Name: modelos_mensagem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modelos_mensagem_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modelos_mensagem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modelos_mensagem_id_seq OWNED BY public.modelos_mensagem.id;


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id bigint NOT NULL,
    nome text NOT NULL,
    marca_id bigint,
    categoria_id bigint,
    subcategoria_id bigint,
    cores text[],
    armazenamentos text[],
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    codigos text,
    categoria_tipo text DEFAULT 'celular'::text,
    empresa_id bigint NOT NULL,
    preco numeric,
    descricao text,
    foto_url text,
    disponivel boolean DEFAULT true,
    garantia_dias integer
);


--
-- Name: COLUMN produtos.preco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.preco IS 'Food: preço do item no cardápio.';


--
-- Name: COLUMN produtos.garantia_dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.garantia_dias IS 'Garantia em dias impressa no contrato. NULL = usa o padrao da loja.';


--
-- Name: modelos_produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modelos_produtos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modelos_produtos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modelos_produtos_id_seq OWNED BY public.produtos.id;


--
-- Name: motivos_perda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motivos_perda (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    label text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE motivos_perda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.motivos_perda IS 'Motivos de perda por empresa (Fase 4.2). Obrigatório ao mover lead para etapa tipo=perdido.';


--
-- Name: motivos_perda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.motivos_perda ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.motivos_perda_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: movimentacao_estoque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimentacao_estoque (
    id bigint NOT NULL,
    produto_id bigint,
    usuario_id uuid,
    tipo_movimento text NOT NULL,
    quantidade integer NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    filial_id bigint
);


--
-- Name: movimentacao_estoque_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.movimentacao_estoque ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.movimentacao_estoque_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: negocios_imobiliarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negocios_imobiliarios (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    imovel_id bigint,
    lead_id bigint,
    cliente_id bigint,
    tipo text NOT NULL,
    valor numeric(14,2) NOT NULL,
    corretor_id uuid,
    captador_id uuid,
    status text DEFAULT 'contrato'::text NOT NULL,
    assinado_em date,
    vistoria_em date,
    chaves_entregues_em date,
    locacao_inicio date,
    locacao_fim date,
    observacoes text,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    percentual numeric(6,3),
    comissao_total numeric(14,2),
    comissao_captador numeric(14,2),
    comissao_vendedor numeric(14,2),
    cashback numeric(14,2) DEFAULT 0 NOT NULL,
    comissao_status text DEFAULT 'pendente'::text NOT NULL,
    comissao_paga_em date,
    cliente_nome text,
    imovel_codigo text,
    origem text DEFAULT 'funil'::text NOT NULL,
    cashback_percentual numeric,
    comissao_aprovada_em date,
    CONSTRAINT negocios_imob_origem_check CHECK ((origem = ANY (ARRAY['funil'::text, 'manual'::text]))),
    CONSTRAINT negocios_imob_tem_referencia CHECK ((((origem = 'funil'::text) AND (imovel_id IS NOT NULL)) OR ((origem = 'manual'::text) AND (COALESCE(btrim(cliente_nome), ''::text) <> ''::text)))),
    CONSTRAINT negocios_imobiliarios_comissao_status_check CHECK ((comissao_status = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'paga'::text, 'cancelada'::text]))),
    CONSTRAINT negocios_imobiliarios_status_check CHECK ((status = ANY (ARRAY['contrato'::text, 'vistoria'::text, 'entregue'::text, 'finalizado'::text, 'cancelado'::text]))),
    CONSTRAINT negocios_imobiliarios_tipo_check CHECK ((tipo = ANY (ARRAY['venda'::text, 'locacao'::text]))),
    CONSTRAINT negocios_imobiliarios_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: TABLE negocios_imobiliarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.negocios_imobiliarios IS 'Negócio fechado (venda ou locação) de um imóvel. Base da comissão e do painel Vendas × Locações.';


--
-- Name: COLUMN negocios_imobiliarios.percentual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.negocios_imobiliarios.percentual IS 'Taxa aplicada sobre o valor do negócio, congelada no fechamento.';


--
-- Name: COLUMN negocios_imobiliarios.comissao_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.negocios_imobiliarios.comissao_total IS 'valor x percentual, congelado. A parte da casa é o total menos captador, vendedor e cashback.';


--
-- Name: COLUMN negocios_imobiliarios.cashback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.negocios_imobiliarios.cashback IS 'Valor devolvido ao cliente. DEFINIÇÃO A CONFIRMAR com o dono — ver lib/comissao-imob.ts.';


--
-- Name: negocios_imobiliarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.negocios_imobiliarios ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.negocios_imobiliarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notificacao_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacao_prefs (
    usuario_id uuid NOT NULL,
    prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notificacao_prefs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notificacao_prefs IS 'Preferências de notificação por usuário (Fase 2.B Dono #9): quais eventos geram push/badge — lead_novo, sla, tarefa, pagamento. Tabela própria (não usuarios) por causa do grant/trigger de escalação.';


--
-- Name: orcamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orcamentos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    cliente_nome text NOT NULL,
    cliente_telefone text,
    tipo text DEFAULT 'assistencia'::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    aparelho text,
    imei text,
    defeito text,
    prazo_dias integer,
    garantia_dias integer,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    aparelho_novo text,
    valor_novo numeric,
    aparelho_usado text,
    valor_entrada numeric,
    total numeric DEFAULT 0 NOT NULL,
    observacoes text,
    os_id bigint,
    aprovado_em timestamp with time zone,
    recusado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    unidade_id bigint,
    valor_devolver numeric DEFAULT 0 NOT NULL,
    acerto text,
    usuario_id uuid,
    cliente_id bigint,
    filial_id bigint,
    troca_cotacao_id bigint
);


--
-- Name: COLUMN orcamentos.valor_devolver; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orcamentos.valor_devolver IS 'Saldo a favor do cliente (aparelho de entrada vale mais que o que ele leva). Exclusivo com `total`: um dos dois e sempre zero.';


--
-- Name: COLUMN orcamentos.acerto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orcamentos.acerto IS 'Como o saldo a favor do cliente foi acertado: dinheiro | credito | produto | nenhum. Só tem significado quando valor_devolver > 0.';


--
-- Name: COLUMN orcamentos.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orcamentos.usuario_id IS 'Vendedor que criou o orçamento — base do escopo por usuário.';


--
-- Name: COLUMN orcamentos.cliente_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orcamentos.cliente_id IS 'Cadastro do cliente, quando ele já existe. Nulo quando o orçamento foi feito para um lead ou para um nome digitado à mão — cliente_nome/cliente_telefone seguem sendo o que o cliente vê no link.';


--
-- Name: orcamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orcamentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orcamentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_webhook_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_webhook_eventos (
    id bigint NOT NULL,
    provider text NOT NULL,
    provider_ref text NOT NULL,
    event_type text,
    processado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE payment_webhook_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_webhook_eventos IS 'Log de eventos de webhook de pagamento. Escrito pelo service role; leitura restrita a superadmin (policy pwe_superadmin_read).';


--
-- Name: payment_webhook_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_webhook_eventos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payment_webhook_eventos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    mesa text,
    cliente_nome text,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'recebido'::text NOT NULL,
    observacoes text,
    origem text DEFAULT 'cardapio'::text,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint
);


--
-- Name: pedidos_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos_compra (
    id bigint NOT NULL,
    fornecedor_id bigint,
    descricao text,
    valor_total numeric(12,2),
    status text DEFAULT 'pendente'::text,
    observacoes text,
    usuario_id uuid,
    data_pedido date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    filial_id bigint,
    solicitado_em timestamp with time zone,
    solicitado_por uuid
);


--
-- Name: COLUMN pedidos_compra.solicitado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos_compra.solicitado_em IS 'Quando o pedido foi efetivamente feito ao fornecedor. Nulo = ninguem pediu ainda.';


--
-- Name: COLUMN pedidos_compra.solicitado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos_compra.solicitado_por IS 'Quem apertou "Pedido feito" — so admin/dono marcam, mas fica registrado para auditar.';


--
-- Name: pedidos_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pedidos_compra ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pedidos_compra_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pedidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pedidos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: planos_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planos_config (
    id text NOT NULL,
    nome text NOT NULL,
    descricao text,
    preco_centavos integer DEFAULT 0 NOT NULL,
    stripe_price_id text,
    limite_usuarios integer DEFAULT 1 NOT NULL,
    limite_leads integer DEFAULT 100 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    destaque boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    cor text DEFAULT '#5C6E84'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pre_vendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_vendas (
    id bigint NOT NULL,
    inventario_unidade_id bigint,
    produto_id integer,
    valor_venda numeric,
    vendedor_id uuid,
    canal_venda text,
    desconto_valor numeric,
    observacoes text,
    status text DEFAULT 'pendente'::text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    grupo_id uuid,
    venda_id bigint,
    empresa_id bigint NOT NULL,
    filial_id bigint
);


--
-- Name: pre_vendas_new_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pre_vendas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pre_vendas_new_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: propostas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propostas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    cliente_nome text DEFAULT ''::text NOT NULL,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacoes text,
    total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint,
    CONSTRAINT propostas_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'enviada'::text, 'aceita'::text, 'recusada'::text])))
);


--
-- Name: TABLE propostas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.propostas IS 'Propostas comerciais (Fase 4.5). itens = [{descricao, qtd, valor}]. token = link público /proposta/[token] (lido via service).';


--
-- Name: propostas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.propostas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.propostas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.push_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rastreamento_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rastreamento_config (
    empresa_id bigint NOT NULL,
    public_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    meta_pixel_id text,
    capi_token_enc text,
    capi_ativo boolean DEFAULT false NOT NULL,
    capi_test_code text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rastreamento_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rastreamento_eventos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    visita_id bigint,
    lead_id bigint,
    tipo text DEFAULT 'lead'::text NOT NULL,
    event_id text,
    order_id text,
    valor numeric(14,2),
    moeda text DEFAULT 'BRL'::text NOT NULL,
    produto text,
    contato_email text,
    contato_fone text,
    capi_status text DEFAULT 'pendente'::text NOT NULL,
    capi_response jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rastreamento_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_eventos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rastreamento_eventos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rastreamento_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rastreamento_links (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    slug text NOT NULL,
    titulo text,
    destino_url text NOT NULL,
    wa_numero text,
    wa_texto text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    cliques bigint DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rastreamento_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_links ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rastreamento_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rastreamento_visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rastreamento_visitas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    tracking_id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_code text,
    link_id bigint,
    lead_id bigint,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    fbclid text,
    gclid text,
    gbraid text,
    wbraid text,
    ta_cod text,
    referrer text,
    page_url text,
    ip text,
    user_agent text,
    fbp text,
    fbc text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rastreamento_visitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_visitas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rastreamento_visitas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit (
    chave text NOT NULL,
    janela timestamp with time zone NOT NULL,
    contador integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE rate_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rate_limit IS 'Contador por (chave, janela) para limitar rotas públicas. chave = hash do IP + segredo; nunca o IP.';


--
-- Name: segmentos_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segmentos_config (
    chave text NOT NULL,
    label text NOT NULL,
    descricao text,
    hidden_hrefs jsonb DEFAULT '[]'::jsonb NOT NULL,
    label_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    modulos_extra jsonb DEFAULT '[]'::jsonb NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modulos_habilitados jsonb,
    menu_layout jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: COLUMN segmentos_config.menu_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.segmentos_config.menu_layout IS 'Ordem do menu por grupo: {"Hoje": ["/dashboard","/leads"], "__grupos": ["Hoje","Comercial"]}. Grupo ausente mantem a ordem do catalogo.';


--
-- Name: servicos_reparo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos_reparo (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    nome text NOT NULL,
    categoria text,
    preco numeric(12,2) DEFAULT 0 NOT NULL,
    tempo_estimado_min integer,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint
);


--
-- Name: servicos_reparo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.servicos_reparo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.servicos_reparo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: solicitacoes_marketing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitacoes_marketing (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    item text NOT NULL,
    objetivo text,
    canais jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'solicitado'::text NOT NULL,
    solicitante_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: solicitacoes_marketing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.solicitacoes_marketing ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.solicitacoes_marketing_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: storage_orfaos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.storage_orfaos AS
 SELECT name,
    created_at,
    ((metadata ->> 'size'::text))::bigint AS bytes
   FROM storage.objects o
  WHERE ((bucket_id = 'chat-midia'::text) AND (NOT (EXISTS ( SELECT 1
           FROM public.lead_mensagens m
          WHERE ((m.midia_url ~~ '%/chat-midia/%'::text) AND (split_part(m.midia_url, '/chat-midia/'::text, 2) = o.name))))) AND (NOT (EXISTS ( SELECT 1
           FROM public.leads l
          WHERE ((l.foto_url ~~ '%/chat-midia/%'::text) AND (split_part(l.foto_url, '/chat-midia/'::text, 2) = o.name))))));


--
-- Name: stripe_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_eventos (
    id text NOT NULL,
    tipo text NOT NULL,
    empresa_id bigint,
    payload jsonb,
    processado_em timestamp with time zone DEFAULT now()
);


--
-- Name: subcategorias_produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategorias_produtos (
    id bigint NOT NULL,
    nome text NOT NULL,
    categoria_id bigint,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    ordem integer DEFAULT 0,
    empresa_id bigint NOT NULL
);


--
-- Name: subcategorias_produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subcategorias_produtos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subcategorias_produtos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: superadmin_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superadmin_logs (
    id bigint NOT NULL,
    admin_user_id uuid NOT NULL,
    empresa_id bigint,
    acao text NOT NULL,
    detalhes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: superadmin_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.superadmin_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.superadmin_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tabela_precos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tabela_precos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    modelo text NOT NULL,
    armazenamento text,
    condicao text DEFAULT 'novo'::text NOT NULL,
    preco_sugerido numeric(12,2) DEFAULT 0 NOT NULL,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tabela_precos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tabela_precos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tabela_precos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tarefas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    responsavel_id uuid,
    titulo text NOT NULL,
    descricao text,
    tipo text DEFAULT 'outro'::text NOT NULL,
    vencimento timestamp with time zone,
    concluida boolean DEFAULT false NOT NULL,
    concluida_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    filial_id bigint
);


--
-- Name: tarefas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tarefas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.tarefas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: taxas_pagamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxas_pagamento (
    id bigint NOT NULL,
    forma_pagamento text NOT NULL,
    bandeira text,
    parcelas integer DEFAULT 1,
    percentual_taxa numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    ativo boolean DEFAULT true,
    empresa_id bigint NOT NULL
);


--
-- Name: taxas_pagamento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.taxas_pagamento ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.taxas_pagamento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tenant_payment_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_payment_config (
    empresa_id bigint NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    ativo boolean DEFAULT false NOT NULL,
    credenciais_cipher text,
    modo text DEFAULT 'producao'::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modo_valido CHECK ((modo = ANY (ARRAY['producao'::text, 'sandbox'::text]))),
    CONSTRAINT provider_valido CHECK ((provider = ANY (ARRAY['manual'::text, 'mercadopago'::text, 'asaas'::text, 'efibank'::text, 'pagseguro'::text])))
);


--
-- Name: troca_cotacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.troca_cotacoes (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    filial_id bigint,
    usuario_id uuid,
    lead_id bigint,
    cliente_id bigint,
    cliente_nome text,
    modelo text NOT NULL,
    armazenamento text DEFAULT ''::text NOT NULL,
    imei text,
    na_troca numeric DEFAULT 0 NOT NULL,
    avarias jsonb DEFAULT '[]'::jsonb NOT NULL,
    descontos_total numeric DEFAULT 0 NOT NULL,
    bonus numeric DEFAULT 0 NOT NULL,
    valor_final numeric DEFAULT 0 NOT NULL,
    checklist jsonb DEFAULT '{}'::jsonb NOT NULL,
    observacoes text,
    status text DEFAULT 'rascunho'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    numero integer,
    usada_em timestamp with time zone,
    venda_id bigint
);


--
-- Name: troca_cotacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.troca_cotacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: troca_cotacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.troca_cotacoes_id_seq OWNED BY public.troca_cotacoes.id;


--
-- Name: troca_precos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.troca_precos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    modelo text NOT NULL,
    armazenamento text DEFAULT ''::text NOT NULL,
    na_troca numeric,
    descontos jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: troca_precos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.troca_precos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: troca_precos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.troca_precos_id_seq OWNED BY public.troca_precos.id;


--
-- Name: troca_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.troca_regras (
    empresa_id bigint NOT NULL,
    bonus_seminovo numeric DEFAULT 0 NOT NULL,
    corte_bateria integer DEFAULT 80 NOT NULL,
    observacoes text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    nome text NOT NULL,
    email text,
    role text DEFAULT 'vendedor'::text NOT NULL,
    modulos_acesso text[],
    permissoes jsonb,
    ultimo_acesso timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_super_admin boolean DEFAULT false NOT NULL,
    impersonando_empresa_id bigint,
    impersonando_expires_at timestamp with time zone,
    filial_atual_id bigint
);


--
-- Name: v_empresas_plano; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_empresas_plano WITH (security_invoker='true') AS
 SELECT id,
    nome,
    plano,
    status,
    trial_ends_at,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status
   FROM public.empresas e
  WHERE (id = public.get_empresa_id());


--
-- Name: veiculo_dados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo_dados (
    unidade_id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    placa text,
    chassi text,
    renavam text,
    km integer,
    ano integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE veiculo_dados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculo_dados IS 'Dados de veículo de uma unidade de estoque (placa, chassi, renavam, km, ano). Saiu de inventario_unidades na Fase 3 do isolamento por segmento — ver docs/PLANO-ISOLAMENTO-SEGMENTOS.md.';


--
-- Name: v_inventario_veiculo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_inventario_veiculo WITH (security_invoker='true') AS
 SELECT u.id AS unidade_id,
    u.empresa_id,
    COALESCE(v.placa, u.placa) AS placa,
    COALESCE(v.chassi, u.chassi) AS chassi,
    COALESCE(v.renavam, u.renavam) AS renavam,
    COALESCE(v.km, u.km) AS km,
    COALESCE(v.ano, u.ano) AS ano,
    (v.unidade_id IS NOT NULL) AS migrado
   FROM (public.inventario_unidades u
     LEFT JOIN public.veiculo_dados v ON ((v.unidade_id = u.id)));


--
-- Name: VIEW v_inventario_veiculo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_inventario_veiculo IS 'Dados de veículo por unidade, lendo de veiculo_dados com queda para as colunas antigas de inventario_unidades. Ponte da Fase 3: permite migrar o código sem apagar coluna nenhuma.';


--
-- Name: v_leads_nao_lidas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_leads_nao_lidas WITH (security_invoker='true') AS
 SELECT m.empresa_id,
    m.lead_id,
    (count(*))::integer AS nao_lidas
   FROM (public.lead_mensagens m
     JOIN public.leads l ON (((l.id = m.lead_id) AND l.ativo)))
  WHERE ((m.lida = false) AND (m.direcao = 'recebida'::text))
  GROUP BY m.empresa_id, m.lead_id;


--
-- Name: VIEW v_leads_nao_lidas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_leads_nao_lidas IS 'Nao lidas por lead (uma linha por lead, nao por mensagem). Ver a migracao contar_nao_lidas_no_banco.';


--
-- Name: v_orfaos_chat_midia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_orfaos_chat_midia WITH (security_invoker='true') AS
 WITH refs AS (
         SELECT DISTINCT split_part(lead_mensagens.midia_url, '/chat-midia/'::text, 2) AS nome
           FROM public.lead_mensagens
          WHERE (lead_mensagens.midia_url ~~ '%/chat-midia/%'::text)
        UNION
         SELECT DISTINCT split_part(leads.foto_url, '/chat-midia/'::text, 2) AS split_part
           FROM public.leads
          WHERE (leads.foto_url ~~ '%/chat-midia/%'::text)
        )
 SELECT o.id,
    o.name,
    ((o.metadata ->> 'size'::text))::bigint AS bytes,
    (o.metadata ->> 'mimetype'::text) AS mime,
    o.created_at
   FROM (storage.objects o
     LEFT JOIN refs r ON ((r.nome = o.name)))
  WHERE ((o.bucket_id = 'chat-midia'::text) AND (r.nome IS NULL));


--
-- Name: vendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas (
    id bigint NOT NULL,
    cliente_id bigint,
    vendedor_id uuid,
    valor_venda numeric(12,2) NOT NULL,
    valor_custo numeric(12,2) DEFAULT 0,
    lucro numeric(12,2) GENERATED ALWAYS AS ((valor_venda - valor_custo)) STORED,
    forma_pagamento text,
    parcelas integer DEFAULT 1,
    canal_venda text DEFAULT 'loja_fisica'::text,
    desconto_valor numeric(12,2) DEFAULT 0,
    desconto_motivo text,
    desconto_aprovado_por uuid,
    observacoes text,
    usuario_id uuid,
    data_venda timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'concluida'::text,
    comissao numeric DEFAULT 0,
    produto_id bigint,
    empresa_id bigint NOT NULL,
    numero_serie text,
    comanda text,
    pedido_compra_id bigint,
    unidade_id bigint,
    grupo_pdv uuid,
    quantidade integer DEFAULT 1 NOT NULL,
    filial_id bigint,
    previsao_entrega date
);


--
-- Name: COLUMN vendas.numero_serie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.numero_serie IS 'IMEI ou número de série da unidade vendida (rastreabilidade do item físico no PDV)';


--
-- Name: COLUMN vendas.comanda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.comanda IS 'Food: mesa/comanda associada à venda (PDV modo comandas).';


--
-- Name: COLUMN vendas.grupo_pdv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.grupo_pdv IS 'Mesmo valor para todas as vendas de um fechamento do PDV. Usado para segurar a comissao do fechamento inteiro quando um aparelho de troca ainda nao chegou.';


--
-- Name: COLUMN vendas.quantidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.quantidade IS 'Unidades vendidas nesta linha. 1 em item serializado.';


--
-- Name: COLUMN vendas.previsao_entrega; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.previsao_entrega IS 'Dia prometido ao CLIENTE na encomenda. Nulo = sem prazo combinado. Não confundir com a previsão do fornecedor, que é do pedido de compra.';


--
-- Name: vendas_alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas_alertas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    venda_id bigint NOT NULL,
    tipo text NOT NULL,
    mensagem text NOT NULL,
    valor_referencia numeric,
    valor_informado numeric,
    aceito_por uuid,
    aceito_em timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint
);


--
-- Name: TABLE vendas_alertas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vendas_alertas IS 'Aceites explícitos do vendedor em condições fora do padrão. Somente leitura e inserção — não é editável por quem opera.';


--
-- Name: vendas_alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendas_alertas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendas_alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendas_alertas_id_seq OWNED BY public.vendas_alertas.id;


--
-- Name: vendas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.vendas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vendas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vendas_pagamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas_pagamentos (
    id bigint NOT NULL,
    venda_id bigint,
    forma_pagamento text NOT NULL,
    valor_pago numeric(12,2) NOT NULL,
    bandeira_cartao text,
    parcelas integer DEFAULT 1,
    valor_com_juros numeric(12,2),
    created_at timestamp with time zone DEFAULT now(),
    empresa_id bigint NOT NULL,
    filial_id bigint
);


--
-- Name: vendas_pagamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.vendas_pagamentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vendas_pagamentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vendas_termos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas_termos (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    venda_id bigint NOT NULL,
    tipo text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    arquivo_url text,
    assinado_em timestamp with time zone,
    assinado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    filial_id bigint,
    CONSTRAINT vendas_termos_status_valido CHECK ((status = ANY (ARRAY['pendente'::text, 'assinado'::text])))
);


--
-- Name: TABLE vendas_termos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vendas_termos IS 'Termos que o cliente assina numa venda (garantia, troca). Fila de pendentes em /garantia.';


--
-- Name: vendas_termos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendas_termos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendas_termos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendas_termos_id_seq OWNED BY public.vendas_termos.id;


--
-- Name: visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitas (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    lead_id bigint,
    imovel_id bigint,
    corretor_id uuid,
    data_hora timestamp with time zone NOT NULL,
    status text DEFAULT 'agendada'::text NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    titulo text,
    tipo text DEFAULT 'visita'::text NOT NULL,
    fim timestamp with time zone,
    local text,
    participantes text,
    cliente_id bigint,
    filial_id bigint,
    CONSTRAINT visitas_fim_depois_check CHECK (((fim IS NULL) OR (fim >= data_hora))),
    CONSTRAINT visitas_tipo_check CHECK ((tipo = ANY (ARRAY['visita'::text, 'vistoria'::text, 'retorno'::text, 'apresentacao'::text, 'follow_up'::text, 'reuniao'::text, 'particular'::text, 'outros'::text])))
);


--
-- Name: COLUMN visitas.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitas.tipo IS 'visita|vistoria|retorno|apresentacao|follow_up|reuniao|particular|outros';


--
-- Name: COLUMN visitas.participantes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitas.participantes IS 'E-mails/telefones de convidados que não são usuários do CRM (texto livre).';


--
-- Name: visitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.visitas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.visitas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: zapintel_midia_retida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zapintel_midia_retida (
    id bigint NOT NULL,
    mensagem_id bigint NOT NULL,
    arquivo text NOT NULL,
    url_antiga text NOT NULL,
    dias_janela integer NOT NULL,
    retirado_em timestamp with time zone DEFAULT now() NOT NULL,
    tipo text DEFAULT 'audio'::text NOT NULL
);


--
-- Name: zapintel_audio_retido_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zapintel_audio_retido_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zapintel_audio_retido_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zapintel_audio_retido_id_seq OWNED BY public.zapintel_midia_retida.id;


--
-- Name: zapintel_conversa_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zapintel_conversa_cache (
    empresa_id bigint NOT NULL,
    chave text NOT NULL,
    dados jsonb NOT NULL,
    gerado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zapintel_lead_perfil; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zapintel_lead_perfil (
    lead_id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    perfil jsonb NOT NULL,
    marca bigint NOT NULL,
    mensagens integer NOT NULL,
    transcritos integer DEFAULT 0 NOT NULL,
    modelo text,
    versao text NOT NULL,
    ms integer,
    gerado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zapintel_venda_lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zapintel_venda_lead (
    venda_id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    cliente_id bigint,
    lead_id bigint,
    como text NOT NULL,
    confianca text NOT NULL,
    dias_ate_venda integer,
    casado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zapintel_venda_lead_confianca_check CHECK ((confianca = ANY (ARRAY['alta'::text, 'media'::text, 'nenhuma'::text])))
);


--
-- Name: TABLE zapintel_venda_lead; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.zapintel_venda_lead IS 'Ponte venda -> conversa do ZapIntel. Inferida por telefone (ultimos 8 digitos), com o metodo e a confianca gravados ao lado. Casar por nome foi testado e descartado: "Ana Beatriz" casa com 130 leads.';


--
-- Name: acessos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos ALTER COLUMN id SET DEFAULT nextval('public.acessos_id_seq'::regclass);


--
-- Name: canais_conectados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_conectados ALTER COLUMN id SET DEFAULT nextval('public.canais_conectados_id_seq'::regclass);


--
-- Name: diagnostico_canais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostico_canais ALTER COLUMN id SET DEFAULT nextval('public.diagnostico_canais_id_seq'::regclass);


--
-- Name: empresa_usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios ALTER COLUMN id SET DEFAULT nextval('public.empresa_usuarios_id_seq'::regclass);


--
-- Name: empresas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas ALTER COLUMN id SET DEFAULT nextval('public.empresas_id_seq'::regclass);


--
-- Name: filiais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais ALTER COLUMN id SET DEFAULT nextval('public.filiais_id_seq'::regclass);


--
-- Name: imei_consultas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imei_consultas ALTER COLUMN id SET DEFAULT nextval('public.imei_consultas_id_seq'::regclass);


--
-- Name: integracao_eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_eventos ALTER COLUMN id SET DEFAULT nextval('public.integracao_eventos_id_seq'::regclass);


--
-- Name: inventario_unidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades ALTER COLUMN id SET DEFAULT nextval('public.inventario_unidades_id_seq'::regclass);


--
-- Name: lancamentos_financeiros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_financeiros ALTER COLUMN id SET DEFAULT nextval('public.lancamentos_financeiros_id_seq'::regclass);


--
-- Name: modelos_mensagem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_mensagem ALTER COLUMN id SET DEFAULT nextval('public.modelos_mensagem_id_seq'::regclass);


--
-- Name: produtos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos ALTER COLUMN id SET DEFAULT nextval('public.modelos_produtos_id_seq'::regclass);


--
-- Name: troca_cotacoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes ALTER COLUMN id SET DEFAULT nextval('public.troca_cotacoes_id_seq'::regclass);


--
-- Name: troca_precos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_precos ALTER COLUMN id SET DEFAULT nextval('public.troca_precos_id_seq'::regclass);


--
-- Name: vendas_alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas ALTER COLUMN id SET DEFAULT nextval('public.vendas_alertas_id_seq'::regclass);


--
-- Name: vendas_termos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos ALTER COLUMN id SET DEFAULT nextval('public.vendas_termos_id_seq'::regclass);


--
-- Name: zapintel_midia_retida id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_midia_retida ALTER COLUMN id SET DEFAULT nextval('public.zapintel_audio_retido_id_seq'::regclass);


--
-- Name: acessos acessos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT acessos_pkey PRIMARY KEY (id);


--
-- Name: assistente_config assistente_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistente_config
    ADD CONSTRAINT assistente_config_pkey PRIMARY KEY (id);


--
-- Name: assistente_uso assistente_uso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistente_uso
    ADD CONSTRAINT assistente_uso_pkey PRIMARY KEY (id);


--
-- Name: automacoes automacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automacoes
    ADD CONSTRAINT automacoes_pkey PRIMARY KEY (id);


--
-- Name: avaliacoes_usados avaliacoes_usados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes_usados
    ADD CONSTRAINT avaliacoes_usados_pkey PRIMARY KEY (id);


--
-- Name: avisos_plataforma avisos_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_plataforma
    ADD CONSTRAINT avisos_plataforma_pkey PRIMARY KEY (id);


--
-- Name: cadencia_execucoes cadencia_execucoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_execucoes
    ADD CONSTRAINT cadencia_execucoes_pkey PRIMARY KEY (id);


--
-- Name: cadencia_inscricoes cadencia_inscricoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_inscricoes
    ADD CONSTRAINT cadencia_inscricoes_pkey PRIMARY KEY (id);


--
-- Name: cadencia_passos cadencia_passos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_passos
    ADD CONSTRAINT cadencia_passos_pkey PRIMARY KEY (id);


--
-- Name: cadencias cadencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencias
    ADD CONSTRAINT cadencias_pkey PRIMARY KEY (id);


--
-- Name: campanhas_fidelidade campanhas_fidelidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanhas_fidelidade
    ADD CONSTRAINT campanhas_fidelidade_pkey PRIMARY KEY (id);


--
-- Name: canais_conectados canais_conectados_ext_uidx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_conectados
    ADD CONSTRAINT canais_conectados_ext_uidx UNIQUE (tipo, external_id);


--
-- Name: canais_conectados canais_conectados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_conectados
    ADD CONSTRAINT canais_conectados_pkey PRIMARY KEY (id);


--
-- Name: categorias_produtos categorias_produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_produtos
    ADD CONSTRAINT categorias_produtos_pkey PRIMARY KEY (id);


--
-- Name: chamadas chamadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamadas
    ADD CONSTRAINT chamadas_pkey PRIMARY KEY (id);


--
-- Name: chat_leituras chat_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_leituras
    ADD CONSTRAINT chat_leituras_pkey PRIMARY KEY (empresa_id, usuario_id, conversa);


--
-- Name: chaves_imoveis chaves_imoveis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chaves_imoveis
    ADD CONSTRAINT chaves_imoveis_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: cobrancas cobrancas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_pkey PRIMARY KEY (id);


--
-- Name: comissoes comissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_pkey PRIMARY KEY (id);


--
-- Name: configuracoes_sistema configuracoes_sistema_empresa_chave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_sistema
    ADD CONSTRAINT configuracoes_sistema_empresa_chave_key UNIQUE (empresa_id, chave);


--
-- Name: configuracoes_sistema configuracoes_sistema_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_sistema
    ADD CONSTRAINT configuracoes_sistema_pkey PRIMARY KEY (id);


--
-- Name: contrato_documentos contrato_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_documentos
    ADD CONSTRAINT contrato_documentos_pkey PRIMARY KEY (id);


--
-- Name: contrato_modelos contrato_modelos_empresa_id_versao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_modelos
    ADD CONSTRAINT contrato_modelos_empresa_id_versao_key UNIQUE (empresa_id, versao);


--
-- Name: contrato_modelos contrato_modelos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_modelos
    ADD CONSTRAINT contrato_modelos_pkey PRIMARY KEY (id);


--
-- Name: contratos_venda contratos_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_pkey PRIMARY KEY (id);


--
-- Name: diagnostico_canais diagnostico_canais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostico_canais
    ADD CONSTRAINT diagnostico_canais_pkey PRIMARY KEY (id);


--
-- Name: distribuicao_regras distribuicao_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribuicao_regras
    ADD CONSTRAINT distribuicao_regras_pkey PRIMARY KEY (id);


--
-- Name: empresa_usuarios empresa_usuarios_empresa_id_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_empresa_id_usuario_id_key UNIQUE (empresa_id, usuario_id);


--
-- Name: empresa_usuarios empresa_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_slug_key UNIQUE (slug);


--
-- Name: fichas_financiamento fichas_financiamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_financiamento
    ADD CONSTRAINT fichas_financiamento_pkey PRIMARY KEY (id);


--
-- Name: filiais filiais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_pkey PRIMARY KEY (id);


--
-- Name: fipe_consultas fipe_consultas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fipe_consultas
    ADD CONSTRAINT fipe_consultas_pkey PRIMARY KEY (id);


--
-- Name: fipe_consultas fipe_consultas_tipo_codigo_marca_codigo_modelo_ano_referenc_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fipe_consultas
    ADD CONSTRAINT fipe_consultas_tipo_codigo_marca_codigo_modelo_ano_referenc_key UNIQUE (tipo, codigo_marca, codigo_modelo, ano, referencia_codigo);


--
-- Name: fipe_referencia fipe_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fipe_referencia
    ADD CONSTRAINT fipe_referencia_pkey PRIMARY KEY (id);


--
-- Name: followups_gerados followups_gerados_chave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_chave_key UNIQUE (chave);


--
-- Name: followups_gerados followups_gerados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_pkey PRIMARY KEY (id);


--
-- Name: fornecedores fornecedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);


--
-- Name: funil_etapas funil_etapas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funil_etapas
    ADD CONSTRAINT funil_etapas_pkey PRIMARY KEY (id);


--
-- Name: funis funis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funis
    ADD CONSTRAINT funis_pkey PRIMARY KEY (id);


--
-- Name: garantias_assistencias garantias_assistencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_pkey PRIMARY KEY (id);


--
-- Name: garantias_assistencias garantias_assistencias_protocolo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_protocolo_key UNIQUE (protocolo);


--
-- Name: historico_bruto historico_bruto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_bruto
    ADD CONSTRAINT historico_bruto_pkey PRIMARY KEY (id);


--
-- Name: imei_consultas imei_consultas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imei_consultas
    ADD CONSTRAINT imei_consultas_pkey PRIMARY KEY (id);


--
-- Name: imoveis imoveis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imoveis
    ADD CONSTRAINT imoveis_pkey PRIMARY KEY (id);


--
-- Name: integracao_eventos integracao_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_eventos
    ADD CONSTRAINT integracao_eventos_pkey PRIMARY KEY (id);


--
-- Name: inventario_unidades inventario_unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_pkey PRIMARY KEY (id);


--
-- Name: lancamentos_financeiros lancamentos_financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_financeiros
    ADD CONSTRAINT lancamentos_financeiros_pkey PRIMARY KEY (id);


--
-- Name: lead_atribuicoes lead_atribuicoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_atribuicoes
    ADD CONSTRAINT lead_atribuicoes_pkey PRIMARY KEY (id);


--
-- Name: lead_mensagens lead_mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_pkey PRIMARY KEY (id);


--
-- Name: lead_perfil_busca lead_perfil_busca_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_lead_id_key UNIQUE (lead_id);


--
-- Name: lead_perfil_busca lead_perfil_busca_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: lista_espera lista_espera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_pkey PRIMARY KEY (id);


--
-- Name: marcas_produtos marcas_produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas_produtos
    ADD CONSTRAINT marcas_produtos_pkey PRIMARY KEY (id);


--
-- Name: mensagens_internas mensagens_internas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_internas
    ADD CONSTRAINT mensagens_internas_pkey PRIMARY KEY (id);


--
-- Name: metas_comissoes metas_comissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_comissoes
    ADD CONSTRAINT metas_comissoes_pkey PRIMARY KEY (id);


--
-- Name: metas metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_pkey PRIMARY KEY (id);


--
-- Name: modelos_mensagem modelos_mensagem_nome_uidx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_mensagem
    ADD CONSTRAINT modelos_mensagem_nome_uidx UNIQUE (empresa_id, nome, idioma);


--
-- Name: modelos_mensagem modelos_mensagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_mensagem
    ADD CONSTRAINT modelos_mensagem_pkey PRIMARY KEY (id);


--
-- Name: motivos_perda motivos_perda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivos_perda
    ADD CONSTRAINT motivos_perda_pkey PRIMARY KEY (id);


--
-- Name: movimentacao_estoque movimentacao_estoque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_pkey PRIMARY KEY (id);


--
-- Name: negocios_imobiliarios negocios_imobiliarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_pkey PRIMARY KEY (id);


--
-- Name: notificacao_prefs notificacao_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacao_prefs
    ADD CONSTRAINT notificacao_prefs_pkey PRIMARY KEY (usuario_id);


--
-- Name: orcamentos orcamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_pkey PRIMARY KEY (id);


--
-- Name: orcamentos orcamentos_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_token_key UNIQUE (token);


--
-- Name: payment_webhook_eventos payment_webhook_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_webhook_eventos
    ADD CONSTRAINT payment_webhook_eventos_pkey PRIMARY KEY (id);


--
-- Name: payment_webhook_eventos payment_webhook_eventos_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_webhook_eventos
    ADD CONSTRAINT payment_webhook_eventos_unique UNIQUE (provider, provider_ref);


--
-- Name: pedidos_compra pedidos_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_pkey PRIMARY KEY (id);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: planos_config planos_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos_config
    ADD CONSTRAINT planos_config_pkey PRIMARY KEY (id);


--
-- Name: pre_vendas pre_vendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: propostas propostas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_pkey PRIMARY KEY (id);


--
-- Name: propostas propostas_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_token_key UNIQUE (token);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rastreamento_config rastreamento_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_config
    ADD CONSTRAINT rastreamento_config_pkey PRIMARY KEY (empresa_id);


--
-- Name: rastreamento_config rastreamento_config_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_config
    ADD CONSTRAINT rastreamento_config_public_token_key UNIQUE (public_token);


--
-- Name: rastreamento_eventos rastreamento_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_eventos
    ADD CONSTRAINT rastreamento_eventos_pkey PRIMARY KEY (id);


--
-- Name: rastreamento_links rastreamento_links_empresa_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_links
    ADD CONSTRAINT rastreamento_links_empresa_id_slug_key UNIQUE (empresa_id, slug);


--
-- Name: rastreamento_links rastreamento_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_links
    ADD CONSTRAINT rastreamento_links_pkey PRIMARY KEY (id);


--
-- Name: rastreamento_visitas rastreamento_visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_visitas
    ADD CONSTRAINT rastreamento_visitas_pkey PRIMARY KEY (id);


--
-- Name: rate_limit rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit
    ADD CONSTRAINT rate_limit_pkey PRIMARY KEY (chave, janela);


--
-- Name: segmentos_config segmentos_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segmentos_config
    ADD CONSTRAINT segmentos_config_pkey PRIMARY KEY (chave);


--
-- Name: servicos_reparo servicos_reparo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_reparo
    ADD CONSTRAINT servicos_reparo_pkey PRIMARY KEY (id);


--
-- Name: solicitacoes_marketing solicitacoes_marketing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_marketing
    ADD CONSTRAINT solicitacoes_marketing_pkey PRIMARY KEY (id);


--
-- Name: stripe_eventos stripe_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_eventos
    ADD CONSTRAINT stripe_eventos_pkey PRIMARY KEY (id);


--
-- Name: subcategorias_produtos subcategorias_produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias_produtos
    ADD CONSTRAINT subcategorias_produtos_pkey PRIMARY KEY (id);


--
-- Name: superadmin_logs superadmin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_logs
    ADD CONSTRAINT superadmin_logs_pkey PRIMARY KEY (id);


--
-- Name: tabela_precos tabela_precos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabela_precos
    ADD CONSTRAINT tabela_precos_pkey PRIMARY KEY (id);


--
-- Name: tarefas tarefas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_pkey PRIMARY KEY (id);


--
-- Name: taxas_pagamento taxas_pagamento_forma_pagamento_bandeira_parcelas_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxas_pagamento
    ADD CONSTRAINT taxas_pagamento_forma_pagamento_bandeira_parcelas_key UNIQUE (forma_pagamento, bandeira, parcelas);


--
-- Name: taxas_pagamento taxas_pagamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxas_pagamento
    ADD CONSTRAINT taxas_pagamento_pkey PRIMARY KEY (id);


--
-- Name: tenant_payment_config tenant_payment_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_payment_config
    ADD CONSTRAINT tenant_payment_config_pkey PRIMARY KEY (empresa_id);


--
-- Name: complementos_empresa tracker_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complementos_empresa
    ADD CONSTRAINT tracker_addons_pkey PRIMARY KEY (empresa_id);


--
-- Name: troca_cotacoes troca_cotacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_pkey PRIMARY KEY (id);


--
-- Name: troca_precos troca_precos_empresa_id_modelo_armazenamento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_precos
    ADD CONSTRAINT troca_precos_empresa_id_modelo_armazenamento_key UNIQUE (empresa_id, modelo, armazenamento);


--
-- Name: troca_precos troca_precos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_precos
    ADD CONSTRAINT troca_precos_pkey PRIMARY KEY (id);


--
-- Name: troca_regras troca_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_regras
    ADD CONSTRAINT troca_regras_pkey PRIMARY KEY (empresa_id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: veiculo_dados veiculo_dados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_dados
    ADD CONSTRAINT veiculo_dados_pkey PRIMARY KEY (unidade_id);


--
-- Name: vendas_alertas vendas_alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas
    ADD CONSTRAINT vendas_alertas_pkey PRIMARY KEY (id);


--
-- Name: vendas_pagamentos vendas_pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pagamentos
    ADD CONSTRAINT vendas_pagamentos_pkey PRIMARY KEY (id);


--
-- Name: vendas vendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_pkey PRIMARY KEY (id);


--
-- Name: vendas_termos vendas_termos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_pkey PRIMARY KEY (id);


--
-- Name: vendas_termos vendas_termos_venda_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_venda_id_tipo_key UNIQUE (venda_id, tipo);


--
-- Name: visitas visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_pkey PRIMARY KEY (id);


--
-- Name: zapintel_midia_retida zapintel_audio_retido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_midia_retida
    ADD CONSTRAINT zapintel_audio_retido_pkey PRIMARY KEY (id);


--
-- Name: zapintel_conversa_cache zapintel_conversa_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_conversa_cache
    ADD CONSTRAINT zapintel_conversa_cache_pkey PRIMARY KEY (empresa_id, chave);


--
-- Name: zapintel_lead_perfil zapintel_lead_perfil_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_lead_perfil
    ADD CONSTRAINT zapintel_lead_perfil_pkey PRIMARY KEY (lead_id);


--
-- Name: zapintel_venda_lead zapintel_venda_lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_venda_lead
    ADD CONSTRAINT zapintel_venda_lead_pkey PRIMARY KEY (venda_id);


--
-- Name: acessos_usuario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX acessos_usuario_id_idx ON public.acessos USING btree (usuario_id);


--
-- Name: avaliacoes_usados_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacoes_usados_filial_idx ON public.avaliacoes_usados USING btree (empresa_id, filial_id);


--
-- Name: canais_conectados_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canais_conectados_empresa_idx ON public.canais_conectados USING btree (empresa_id);


--
-- Name: canais_conectados_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canais_conectados_status_idx ON public.canais_conectados USING btree (empresa_id, status);


--
-- Name: canais_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canais_filial_idx ON public.canais_conectados USING btree (empresa_id, filial_id);


--
-- Name: chamadas_empresa_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamadas_empresa_id_idx ON public.chamadas USING btree (empresa_id);


--
-- Name: chamadas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamadas_filial_idx ON public.chamadas USING btree (empresa_id, filial_id);


--
-- Name: clientes_corretor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_corretor_idx ON public.clientes USING btree (empresa_id, corretor_id);


--
-- Name: clientes_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_filial_idx ON public.clientes USING btree (empresa_id, filial_id);


--
-- Name: clientes_proprietario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_proprietario_idx ON public.clientes USING btree (empresa_id) WHERE proprietario;


--
-- Name: clientes_um_por_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_um_por_lead ON public.clientes USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: cobrancas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cobrancas_filial_idx ON public.cobrancas USING btree (empresa_id, filial_id);


--
-- Name: comissoes_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comissoes_filial_idx ON public.comissoes USING btree (empresa_id, filial_id);


--
-- Name: contrato_documentos_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contrato_documentos_empresa_idx ON public.contrato_documentos USING btree (empresa_id, arquivado, nome);


--
-- Name: contrato_modelos_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contrato_modelos_doc_idx ON public.contrato_modelos USING btree (documento_id, versao DESC);


--
-- Name: contrato_modelos_um_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contrato_modelos_um_ativo ON public.contrato_modelos USING btree (documento_id) WHERE ativo;


--
-- Name: contratos_venda_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contratos_venda_cliente_id_idx ON public.contratos_venda USING btree (cliente_id);


--
-- Name: contratos_venda_documento_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contratos_venda_documento_id_idx ON public.contratos_venda USING btree (documento_id);


--
-- Name: contratos_venda_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contratos_venda_empresa_idx ON public.contratos_venda USING btree (empresa_id, created_at DESC);


--
-- Name: contratos_venda_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contratos_venda_filial_idx ON public.contratos_venda USING btree (empresa_id, filial_id);


--
-- Name: contratos_venda_vendas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contratos_venda_vendas_idx ON public.contratos_venda USING gin (venda_ids);


--
-- Name: diagnostico_canais_recente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnostico_canais_recente_idx ON public.diagnostico_canais USING btree (created_at DESC);


--
-- Name: fichas_financiamento_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fichas_financiamento_filial_idx ON public.fichas_financiamento USING btree (empresa_id, filial_id);


--
-- Name: filiais_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX filiais_empresa_idx ON public.filiais USING btree (empresa_id) WHERE ativo;


--
-- Name: filiais_nome_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX filiais_nome_unico ON public.filiais USING btree (empresa_id, lower(nome));


--
-- Name: filiais_uma_matriz; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX filiais_uma_matriz ON public.filiais USING btree (empresa_id) WHERE matriz;


--
-- Name: funil_etapas_funil_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX funil_etapas_funil_slug_key ON public.funil_etapas USING btree (funil_id, slug);


--
-- Name: garantias_assistencias_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantias_assistencias_filial_idx ON public.garantias_assistencias USING btree (empresa_id, filial_id);


--
-- Name: historico_bruto_canal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historico_bruto_canal_idx ON public.historico_bruto USING btree (canal_id, created_at);


--
-- Name: idx_acessos_abertos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acessos_abertos ON public.acessos USING btree (empresa_id, usuario_id, saida) WHERE (saida IS NULL);


--
-- Name: idx_acessos_empresa_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acessos_empresa_entrada ON public.acessos USING btree (empresa_id, entrada DESC);


--
-- Name: idx_assistente_uso_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistente_uso_empresa ON public.assistente_uso USING btree (empresa_id, created_at);


--
-- Name: idx_avaliacoes_usados_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avaliacoes_usados_empresa ON public.avaliacoes_usados USING btree (empresa_id, created_at DESC);


--
-- Name: idx_avaliacoes_usados_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avaliacoes_usados_lead ON public.avaliacoes_usados USING btree (lead_id);


--
-- Name: idx_avisos_plataforma_ativos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avisos_plataforma_ativos ON public.avisos_plataforma USING btree (ativo, expira_em);


--
-- Name: idx_cadencia_insc_fila; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadencia_insc_fila ON public.cadencia_inscricoes USING btree (empresa_id, responsavel_id, status, proxima_acao_em);


--
-- Name: idx_cadencia_passos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadencia_passos ON public.cadencia_passos USING btree (cadencia_id, ordem);


--
-- Name: idx_campanhas_fidelidade_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campanhas_fidelidade_empresa ON public.campanhas_fidelidade USING btree (empresa_id);


--
-- Name: idx_cat_prod_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cat_prod_empresa_id ON public.categorias_produtos USING btree (empresa_id);


--
-- Name: idx_cat_prod_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cat_prod_usuario_id ON public.categorias_produtos USING btree (usuario_id);


--
-- Name: idx_chamadas_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamadas_lead ON public.chamadas USING btree (lead_id, created_at DESC);


--
-- Name: idx_chaves_imoveis_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chaves_imoveis_empresa ON public.chaves_imoveis USING btree (empresa_id);


--
-- Name: idx_chaves_imoveis_imovel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chaves_imoveis_imovel ON public.chaves_imoveis USING btree (imovel_id);


--
-- Name: idx_clientes_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_empresa ON public.clientes USING btree (empresa_id);


--
-- Name: idx_clientes_empresa_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_empresa_nome ON public.clientes USING btree (empresa_id, nome);


--
-- Name: idx_clientes_empresa_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_empresa_telefone ON public.clientes USING btree (empresa_id, telefone);


--
-- Name: idx_clientes_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_usuario_id ON public.clientes USING btree (usuario_id);


--
-- Name: idx_cobrancas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_empresa ON public.cobrancas USING btree (empresa_id);


--
-- Name: idx_cobrancas_empresa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_empresa_created ON public.cobrancas USING btree (empresa_id, created_at DESC);


--
-- Name: idx_cobrancas_provider_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_provider_ref ON public.cobrancas USING btree (provider, provider_ref);


--
-- Name: idx_cobrancas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_status ON public.cobrancas USING btree (empresa_id, status);


--
-- Name: idx_comissoes_empresa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_empresa_created ON public.comissoes USING btree (empresa_id, created_at DESC);


--
-- Name: idx_comissoes_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_empresa_id ON public.comissoes USING btree (empresa_id);


--
-- Name: idx_comissoes_empresa_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_empresa_usuario ON public.comissoes USING btree (empresa_id, usuario_id);


--
-- Name: idx_comissoes_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_usuario_id ON public.comissoes USING btree (usuario_id);


--
-- Name: idx_comissoes_venda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_venda_id ON public.comissoes USING btree (venda_id);


--
-- Name: idx_comissoes_zerado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_zerado_por ON public.comissoes USING btree (zerado_por);


--
-- Name: idx_configuracoes_sistema_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_configuracoes_sistema_empresa_id ON public.configuracoes_sistema USING btree (empresa_id);


--
-- Name: idx_distribuicao_regras; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribuicao_regras ON public.distribuicao_regras USING btree (empresa_id, ativo, ordem);


--
-- Name: idx_empresa_usuarios_emp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_usuarios_emp ON public.empresa_usuarios USING btree (empresa_id);


--
-- Name: idx_empresa_usuarios_usr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_usuarios_usr ON public.empresa_usuarios USING btree (usuario_id);


--
-- Name: idx_empresas_stripe_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresas_stripe_customer ON public.empresas USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- Name: idx_empresas_stripe_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresas_stripe_sub ON public.empresas USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_fichas_fin_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fichas_fin_lead ON public.fichas_financiamento USING btree (lead_id);


--
-- Name: idx_followups_gerados_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_gerados_empresa ON public.followups_gerados USING btree (empresa_id);


--
-- Name: idx_fornecedores_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fornecedores_empresa_id ON public.fornecedores USING btree (empresa_id);


--
-- Name: idx_funil_etapas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funil_etapas_empresa ON public.funil_etapas USING btree (empresa_id, ordem);


--
-- Name: idx_ga_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ga_token ON public.garantias_assistencias USING btree (token);


--
-- Name: idx_garantias_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_cliente_id ON public.garantias_assistencias USING btree (cliente_id);


--
-- Name: idx_garantias_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_empresa_id ON public.garantias_assistencias USING btree (empresa_id);


--
-- Name: idx_garantias_empresa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_empresa_status ON public.garantias_assistencias USING btree (empresa_id, status);


--
-- Name: idx_garantias_empresa_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_empresa_tipo ON public.garantias_assistencias USING btree (empresa_id, tipo);


--
-- Name: idx_garantias_produto_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_produto_id ON public.garantias_assistencias USING btree (produto_id);


--
-- Name: idx_garantias_resp_tecnico_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_resp_tecnico_id ON public.garantias_assistencias USING btree (responsavel_tecnico_id);


--
-- Name: idx_garantias_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_usuario_id ON public.garantias_assistencias USING btree (usuario_id);


--
-- Name: idx_imoveis_cidade_bairro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imoveis_cidade_bairro ON public.imoveis USING btree (empresa_id, cidade, bairro);


--
-- Name: idx_imoveis_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imoveis_empresa ON public.imoveis USING btree (empresa_id);


--
-- Name: idx_imoveis_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imoveis_status ON public.imoveis USING btree (empresa_id, status);


--
-- Name: idx_imoveis_valor_venda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imoveis_valor_venda ON public.imoveis USING btree (empresa_id, valor_venda);


--
-- Name: idx_inventario_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_cliente_id ON public.inventario_unidades USING btree (cliente_id);


--
-- Name: idx_inventario_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_empresa ON public.inventario_unidades USING btree (empresa_id);


--
-- Name: idx_inventario_empresa_imei; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_empresa_imei ON public.inventario_unidades USING btree (empresa_id, imei);


--
-- Name: idx_inventario_empresa_serie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_empresa_serie ON public.inventario_unidades USING btree (empresa_id, numero_serie);


--
-- Name: idx_inventario_empresa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_empresa_status ON public.inventario_unidades USING btree (empresa_id, status);


--
-- Name: idx_inventario_fornecedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_fornecedor_id ON public.inventario_unidades USING btree (fornecedor_id);


--
-- Name: idx_inventario_produto_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_produto_id ON public.inventario_unidades USING btree (produto_id);


--
-- Name: idx_lancamentos_data_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_data_venc ON public.lancamentos_financeiros USING btree (data_venc);


--
-- Name: idx_lancamentos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_empresa ON public.lancamentos_financeiros USING btree (empresa_id);


--
-- Name: idx_lancamentos_empresa_data_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_empresa_data_venc ON public.lancamentos_financeiros USING btree (empresa_id, data_venc DESC);


--
-- Name: idx_lancamentos_empresa_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_empresa_ref ON public.lancamentos_financeiros USING btree (empresa_id, referencia_tp, referencia_id);


--
-- Name: idx_lancamentos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_status ON public.lancamentos_financeiros USING btree (status);


--
-- Name: idx_lancamentos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tipo ON public.lancamentos_financeiros USING btree (tipo);


--
-- Name: idx_lead_mensagens_audio_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_mensagens_audio_pendente ON public.lead_mensagens USING btree (empresa_id) WHERE ((tipo = 'audio'::text) AND (transcricao IS NULL) AND (midia_url IS NOT NULL));


--
-- Name: idx_lead_mensagens_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_mensagens_usuario ON public.lead_mensagens USING btree (empresa_id, usuario_id);


--
-- Name: idx_lead_msgs_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_msgs_empresa_id ON public.lead_mensagens USING btree (empresa_id);


--
-- Name: idx_lead_msgs_empresa_lida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_msgs_empresa_lida ON public.lead_mensagens USING btree (empresa_id, lida);


--
-- Name: idx_lead_msgs_lead_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_msgs_lead_created ON public.lead_mensagens USING btree (lead_id, created_at);


--
-- Name: idx_lead_msgs_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_msgs_lead_id ON public.lead_mensagens USING btree (lead_id);


--
-- Name: idx_leads_convertido_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_convertido_em ON public.leads USING btree (convertido_em);


--
-- Name: idx_leads_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_empresa ON public.leads USING btree (empresa_id);


--
-- Name: idx_leads_empresa_kanban; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_empresa_kanban ON public.leads USING btree (empresa_id, kanban_status);


--
-- Name: idx_leads_empresa_ultima_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_empresa_ultima_msg ON public.leads USING btree (empresa_id, ultima_mensagem_at DESC NULLS LAST);


--
-- Name: idx_leads_kanban_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_kanban_status ON public.leads USING btree (kanban_status) WHERE (ativo = true);


--
-- Name: idx_leads_responsavel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_responsavel_id ON public.leads USING btree (responsavel_id);


--
-- Name: idx_leads_ultima_mensagem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_ultima_mensagem ON public.leads USING btree (ultima_mensagem_at DESC);


--
-- Name: idx_lista_espera_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lista_espera_empresa ON public.lista_espera USING btree (empresa_id, created_at);


--
-- Name: idx_marcas_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marcas_empresa_id ON public.marcas_produtos USING btree (empresa_id);


--
-- Name: idx_metas_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_empresa_id ON public.metas_comissoes USING btree (empresa_id);


--
-- Name: idx_metas_empresa_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_empresa_usuario ON public.metas_comissoes USING btree (empresa_id, usuario_id);


--
-- Name: idx_metas_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_periodo ON public.metas USING btree (empresa_id, periodo);


--
-- Name: idx_metas_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_usuario_id ON public.metas_comissoes USING btree (usuario_id);


--
-- Name: idx_mi_direto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mi_direto ON public.mensagens_internas USING btree (empresa_id, autor_id, destinatario_id, created_at) WHERE (tipo = 'direto'::text);


--
-- Name: idx_mi_mural; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mi_mural ON public.mensagens_internas USING btree (empresa_id, created_at) WHERE (tipo = 'mural'::text);


--
-- Name: idx_movimentacao_empresa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacao_empresa_created ON public.movimentacao_estoque USING btree (empresa_id, created_at DESC);


--
-- Name: idx_movimentacao_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacao_empresa_id ON public.movimentacao_estoque USING btree (empresa_id);


--
-- Name: idx_movimentacao_produto_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacao_produto_id ON public.movimentacao_estoque USING btree (produto_id);


--
-- Name: idx_movimentacao_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacao_usuario_id ON public.movimentacao_estoque USING btree (usuario_id);


--
-- Name: idx_orcamentos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orcamentos ON public.orcamentos USING btree (empresa_id, status, created_at);


--
-- Name: idx_orcamentos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orcamentos_usuario ON public.orcamentos USING btree (empresa_id, usuario_id);


--
-- Name: idx_pedidos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos ON public.pedidos USING btree (empresa_id, status, created_at);


--
-- Name: idx_pedidos_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_empresa_id ON public.pedidos_compra USING btree (empresa_id);


--
-- Name: idx_pedidos_fornecedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_fornecedor_id ON public.pedidos_compra USING btree (fornecedor_id);


--
-- Name: idx_pedidos_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_usuario_id ON public.pedidos_compra USING btree (usuario_id);


--
-- Name: idx_perfil_busca_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perfil_busca_empresa ON public.lead_perfil_busca USING btree (empresa_id);


--
-- Name: idx_pre_vendas_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_vendas_empresa_id ON public.pre_vendas USING btree (empresa_id);


--
-- Name: idx_pre_vendas_inventario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_vendas_inventario_id ON public.pre_vendas USING btree (inventario_unidade_id);


--
-- Name: idx_pre_vendas_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_vendas_usuario_id ON public.pre_vendas USING btree (usuario_id);


--
-- Name: idx_pre_vendas_venda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_vendas_venda_id ON public.pre_vendas USING btree (venda_id);


--
-- Name: idx_pre_vendas_vendedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_vendas_vendedor_id ON public.pre_vendas USING btree (vendedor_id);


--
-- Name: idx_produtos_categoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_categoria_id ON public.produtos USING btree (categoria_id);


--
-- Name: idx_produtos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_empresa ON public.produtos USING btree (empresa_id);


--
-- Name: idx_produtos_marca_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_marca_id ON public.produtos USING btree (marca_id);


--
-- Name: idx_produtos_subcategoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_subcategoria_id ON public.produtos USING btree (subcategoria_id);


--
-- Name: idx_propostas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_propostas_empresa ON public.propostas USING btree (empresa_id, created_at DESC);


--
-- Name: idx_ps_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ps_usuario ON public.push_subscriptions USING btree (usuario_id);


--
-- Name: idx_rastr_eventos_capi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_eventos_capi ON public.rastreamento_eventos USING btree (capi_status);


--
-- Name: idx_rastr_eventos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_eventos_empresa ON public.rastreamento_eventos USING btree (empresa_id, criado_em DESC);


--
-- Name: idx_rastr_eventos_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_eventos_lead ON public.rastreamento_eventos USING btree (lead_id);


--
-- Name: idx_rastr_links_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_links_empresa ON public.rastreamento_links USING btree (empresa_id);


--
-- Name: idx_rastr_visitas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_visitas_empresa ON public.rastreamento_visitas USING btree (empresa_id, criado_em DESC);


--
-- Name: idx_rastr_visitas_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_visitas_lead ON public.rastreamento_visitas USING btree (lead_id);


--
-- Name: idx_rastr_visitas_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_visitas_tid ON public.rastreamento_visitas USING btree (tracking_id);


--
-- Name: idx_rastr_visitas_vcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rastr_visitas_vcode ON public.rastreamento_visitas USING btree (empresa_id, visitor_code);


--
-- Name: idx_servicos_reparo_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_reparo_empresa ON public.servicos_reparo USING btree (empresa_id, ativo);


--
-- Name: idx_solic_mkt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solic_mkt ON public.solicitacoes_marketing USING btree (empresa_id, status);


--
-- Name: idx_stripe_eventos_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_eventos_empresa_id ON public.stripe_eventos USING btree (empresa_id);


--
-- Name: idx_subcat_categoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcat_categoria_id ON public.subcategorias_produtos USING btree (categoria_id);


--
-- Name: idx_subcat_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcat_empresa_id ON public.subcategorias_produtos USING btree (empresa_id);


--
-- Name: idx_superadmin_logs_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superadmin_logs_admin ON public.superadmin_logs USING btree (admin_user_id);


--
-- Name: idx_superadmin_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superadmin_logs_created ON public.superadmin_logs USING btree (created_at DESC);


--
-- Name: idx_superadmin_logs_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superadmin_logs_empresa ON public.superadmin_logs USING btree (empresa_id);


--
-- Name: idx_tabela_precos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tabela_precos_empresa ON public.tabela_precos USING btree (empresa_id, ativo);


--
-- Name: idx_tarefas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_empresa ON public.tarefas USING btree (empresa_id, responsavel_id, concluida);


--
-- Name: idx_tarefas_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_venc ON public.tarefas USING btree (vencimento);


--
-- Name: idx_taxas_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_taxas_empresa_id ON public.taxas_pagamento USING btree (empresa_id);


--
-- Name: idx_vendas_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_cliente_id ON public.vendas USING btree (cliente_id);


--
-- Name: idx_vendas_desconto_aprovado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_desconto_aprovado_por ON public.vendas USING btree (desconto_aprovado_por);


--
-- Name: idx_vendas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_empresa ON public.vendas USING btree (empresa_id);


--
-- Name: idx_vendas_empresa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_empresa_created ON public.vendas USING btree (empresa_id, created_at DESC);


--
-- Name: idx_vendas_empresa_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_empresa_data_status ON public.vendas USING btree (empresa_id, data_venda DESC, status);


--
-- Name: idx_vendas_empresa_data_venda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_empresa_data_venda ON public.vendas USING btree (empresa_id, data_venda DESC);


--
-- Name: idx_vendas_empresa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_empresa_status ON public.vendas USING btree (empresa_id, status);


--
-- Name: idx_vendas_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_usuario_id ON public.vendas USING btree (usuario_id);


--
-- Name: idx_vendas_vendedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_vendedor_id ON public.vendas USING btree (vendedor_id);


--
-- Name: idx_visitas_corretor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitas_corretor ON public.visitas USING btree (corretor_id);


--
-- Name: idx_visitas_empresa_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitas_empresa_data ON public.visitas USING btree (empresa_id, data_hora);


--
-- Name: idx_vp_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vp_empresa_id ON public.vendas_pagamentos USING btree (empresa_id);


--
-- Name: idx_vp_venda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vp_venda_id ON public.vendas_pagamentos USING btree (venda_id);


--
-- Name: imei_consultas_busca_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX imei_consultas_busca_idx ON public.imei_consultas USING btree (empresa_id, imei, consultado_em DESC);


--
-- Name: imoveis_captado_por_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX imoveis_captado_por_idx ON public.imoveis USING btree (captado_por) WHERE (captado_por IS NOT NULL);


--
-- Name: integracao_eventos_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracao_eventos_empresa_idx ON public.integracao_eventos USING btree (empresa_id, created_at DESC);


--
-- Name: integracao_eventos_externo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracao_eventos_externo_idx ON public.integracao_eventos USING btree (empresa_id, origem, externo_id);


--
-- Name: inventario_unidades_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventario_unidades_filial_idx ON public.inventario_unidades USING btree (empresa_id, filial_id);


--
-- Name: inventario_unidades_grupo_pdv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventario_unidades_grupo_pdv_idx ON public.inventario_unidades USING btree (empresa_id, grupo_pdv);


--
-- Name: inventario_unidades_pendentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventario_unidades_pendentes_idx ON public.inventario_unidades USING btree (empresa_id, status) WHERE (status = 'pendente'::text);


--
-- Name: inventario_unidades_reservado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventario_unidades_reservado_idx ON public.inventario_unidades USING btree (reservado_lead_id);


--
-- Name: inventario_unidades_usuario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventario_unidades_usuario_id_idx ON public.inventario_unidades USING btree (usuario_id);


--
-- Name: lancamentos_financeiros_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_financeiros_filial_idx ON public.lancamentos_financeiros USING btree (empresa_id, filial_id);


--
-- Name: lead_atribuicoes_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_atribuicoes_filial_idx ON public.lead_atribuicoes USING btree (empresa_id, filial_id);


--
-- Name: lead_mensagens_canal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_canal_idx ON public.lead_mensagens USING btree (canal_id) WHERE (canal_id IS NOT NULL);


--
-- Name: lead_mensagens_dash_por_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_dash_por_data ON public.lead_mensagens USING btree (empresa_id, created_at) INCLUDE (direcao, filial_id, lead_id);


--
-- Name: lead_mensagens_dash_por_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_dash_por_lead ON public.lead_mensagens USING btree (empresa_id, lead_id) INCLUDE (direcao, created_at);


--
-- Name: lead_mensagens_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_mensagens_external_id_key ON public.lead_mensagens USING btree (external_id);


--
-- Name: lead_mensagens_external_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_mensagens_external_id_uidx ON public.lead_mensagens USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: lead_mensagens_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_filial_idx ON public.lead_mensagens USING btree (empresa_id, filial_id);


--
-- Name: lead_mensagens_nao_lidas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_nao_lidas_idx ON public.lead_mensagens USING btree (lead_id) WHERE ((lida = false) AND (direcao = 'recebida'::text));


--
-- Name: lead_mensagens_status_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_status_lookup_idx ON public.lead_mensagens USING btree (empresa_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: lead_mensagens_usuario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_mensagens_usuario_id_idx ON public.lead_mensagens USING btree (usuario_id);


--
-- Name: lead_perfil_busca_um_por_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_perfil_busca_um_por_cliente ON public.lead_perfil_busca USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);


--
-- Name: leads_anuncio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_anuncio_idx ON public.leads USING btree (((anuncio IS NOT NULL))) WHERE (anuncio IS NOT NULL);


--
-- Name: leads_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_filial_idx ON public.leads USING btree (empresa_id, filial_id);


--
-- Name: leads_funil_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_funil_id_idx ON public.leads USING btree (funil_id);


--
-- Name: leads_motivo_perda_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_motivo_perda_id_idx ON public.leads USING btree (motivo_perda_id);


--
-- Name: leads_origem_loja_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_origem_loja_uidx ON public.leads USING btree (empresa_id, origem_id, COALESCE(filial_id, (0)::bigint)) WHERE ((ativo = true) AND (origem_id IS NOT NULL));


--
-- Name: metas_comissoes_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metas_comissoes_filial_idx ON public.metas_comissoes USING btree (empresa_id, filial_id);


--
-- Name: metas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metas_filial_idx ON public.metas USING btree (empresa_id, filial_id);


--
-- Name: modelos_mensagem_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modelos_mensagem_empresa_idx ON public.modelos_mensagem USING btree (empresa_id, status);


--
-- Name: movimentacao_estoque_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movimentacao_estoque_filial_idx ON public.movimentacao_estoque USING btree (empresa_id, filial_id);


--
-- Name: negocios_imob_comissao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negocios_imob_comissao_idx ON public.negocios_imobiliarios USING btree (empresa_id, comissao_status);


--
-- Name: negocios_imob_empresa_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negocios_imob_empresa_status_idx ON public.negocios_imobiliarios USING btree (empresa_id, status);


--
-- Name: negocios_imob_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negocios_imob_lead_idx ON public.negocios_imobiliarios USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: negocios_imob_um_ativo_por_imovel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX negocios_imob_um_ativo_por_imovel ON public.negocios_imobiliarios USING btree (imovel_id) WHERE (status = ANY (ARRAY['contrato'::text, 'vistoria'::text, 'entregue'::text]));


--
-- Name: orcamentos_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orcamentos_cliente_id_idx ON public.orcamentos USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);


--
-- Name: orcamentos_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orcamentos_filial_idx ON public.orcamentos USING btree (empresa_id, filial_id);


--
-- Name: payment_webhook_eventos_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_webhook_eventos_lookup ON public.payment_webhook_eventos USING btree (provider, provider_ref);


--
-- Name: pedidos_compra_a_solicitar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_compra_a_solicitar ON public.pedidos_compra USING btree (empresa_id) WHERE ((solicitado_em IS NULL) AND (status = 'aberto'::text));


--
-- Name: pedidos_compra_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_compra_filial_idx ON public.pedidos_compra USING btree (empresa_id, filial_id);


--
-- Name: pedidos_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_filial_idx ON public.pedidos USING btree (empresa_id, filial_id);


--
-- Name: pre_vendas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_vendas_filial_idx ON public.pre_vendas USING btree (empresa_id, filial_id);


--
-- Name: propostas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX propostas_filial_idx ON public.propostas USING btree (empresa_id, filial_id);


--
-- Name: servicos_reparo_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicos_reparo_filial_idx ON public.servicos_reparo USING btree (empresa_id, filial_id);


--
-- Name: tarefas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tarefas_filial_idx ON public.tarefas USING btree (empresa_id, filial_id);


--
-- Name: troca_cotacoes_numero_por_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX troca_cotacoes_numero_por_empresa ON public.troca_cotacoes USING btree (empresa_id, numero);


--
-- Name: troca_cotacoes_recentes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX troca_cotacoes_recentes ON public.troca_cotacoes USING btree (empresa_id, created_at DESC);


--
-- Name: uq_cadencia_insc_ativa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cadencia_insc_ativa ON public.cadencia_inscricoes USING btree (cadencia_id, lead_id) WHERE (status = 'ativa'::text);


--
-- Name: veiculo_dados_placa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_dados_placa_idx ON public.veiculo_dados USING btree (empresa_id, placa) WHERE (placa IS NOT NULL);


--
-- Name: vendas_alertas_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_alertas_empresa_idx ON public.vendas_alertas USING btree (empresa_id, aceito_em DESC);


--
-- Name: vendas_alertas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_alertas_filial_idx ON public.vendas_alertas USING btree (empresa_id, filial_id);


--
-- Name: vendas_alertas_venda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_alertas_venda_idx ON public.vendas_alertas USING btree (venda_id);


--
-- Name: vendas_encomendas_abertas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_encomendas_abertas ON public.vendas USING btree (empresa_id, previsao_entrega) WHERE (status = ANY (ARRAY['encomenda'::text, 'pendente_entrega'::text]));


--
-- Name: vendas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_filial_idx ON public.vendas USING btree (empresa_id, filial_id);


--
-- Name: vendas_grupo_pdv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_grupo_pdv_idx ON public.vendas USING btree (empresa_id, grupo_pdv);


--
-- Name: vendas_pagamentos_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_pagamentos_filial_idx ON public.vendas_pagamentos USING btree (empresa_id, filial_id);


--
-- Name: vendas_pedido_compra_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_pedido_compra_id_idx ON public.vendas USING btree (pedido_compra_id);


--
-- Name: vendas_produto_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_produto_id_idx ON public.vendas USING btree (produto_id);


--
-- Name: vendas_termos_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_termos_fila_idx ON public.vendas_termos USING btree (empresa_id, status, criado_em DESC);


--
-- Name: vendas_termos_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_termos_filial_idx ON public.vendas_termos USING btree (empresa_id, filial_id);


--
-- Name: vendas_unidade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_unidade_id_idx ON public.vendas USING btree (unidade_id);


--
-- Name: visitas_filial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitas_filial_idx ON public.visitas USING btree (empresa_id, filial_id);


--
-- Name: zapintel_audio_retido_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapintel_audio_retido_msg_idx ON public.zapintel_midia_retida USING btree (mensagem_id);


--
-- Name: zapintel_lead_perfil_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapintel_lead_perfil_empresa_idx ON public.zapintel_lead_perfil USING btree (empresa_id);


--
-- Name: zapintel_venda_lead_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapintel_venda_lead_lead_id_idx ON public.zapintel_venda_lead USING btree (lead_id);


--
-- Name: zapintel_venda_lead_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapintel_venda_lead_lead_idx ON public.zapintel_venda_lead USING btree (empresa_id, lead_id);


--
-- Name: avaliacoes_usados avaliacoes_usados_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER avaliacoes_usados_preencher_filial BEFORE INSERT ON public.avaliacoes_usados FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: chamadas chamadas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chamadas_preencher_filial BEFORE INSERT ON public.chamadas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: cobrancas cobrancas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cobrancas_preencher_filial BEFORE INSERT ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: comissoes comissoes_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comissoes_preencher_filial BEFORE INSERT ON public.comissoes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: contratos_venda contratos_venda_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contratos_venda_preencher_filial BEFORE INSERT ON public.contratos_venda FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: fichas_financiamento fichas_financiamento_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fichas_financiamento_preencher_filial BEFORE INSERT ON public.fichas_financiamento FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: leads filial_desce_para_os_filhos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_desce_para_os_filhos AFTER UPDATE OF filial_id ON public.leads FOR EACH ROW WHEN ((new.filial_id IS DISTINCT FROM old.filial_id)) EXECUTE FUNCTION public.propagar_filial_do_lead();


--
-- Name: cadencia_inscricoes filial_do_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_do_lead BEFORE INSERT ON public.cadencia_inscricoes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial_do_lead();


--
-- Name: clientes filial_do_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_do_lead BEFORE INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial_do_lead();


--
-- Name: followups_gerados filial_do_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_do_lead BEFORE INSERT ON public.followups_gerados FOR EACH ROW EXECUTE FUNCTION public.preencher_filial_do_lead();


--
-- Name: lead_mensagens filial_do_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_do_lead BEFORE INSERT ON public.lead_mensagens FOR EACH ROW EXECUTE FUNCTION public.preencher_filial_do_lead();


--
-- Name: lead_perfil_busca filial_do_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filial_do_lead BEFORE INSERT ON public.lead_perfil_busca FOR EACH ROW EXECUTE FUNCTION public.preencher_filial_do_lead();


--
-- Name: garantias_assistencias garantias_assistencias_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER garantias_assistencias_preencher_filial BEFORE INSERT ON public.garantias_assistencias FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: inventario_unidades inventario_unidades_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventario_unidades_preencher_filial BEFORE INSERT ON public.inventario_unidades FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: lancamentos_financeiros lancamentos_financeiros_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lancamentos_financeiros_preencher_filial BEFORE INSERT ON public.lancamentos_financeiros FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: lead_atribuicoes lead_atribuicoes_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_atribuicoes_preencher_filial BEFORE INSERT ON public.lead_atribuicoes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: lead_mensagens lead_marcos_conversa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_marcos_conversa AFTER INSERT ON public.lead_mensagens FOR EACH ROW EXECUTE FUNCTION public.tg_lead_marcos_conversa();


--
-- Name: leads leads_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_preencher_filial BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: metas_comissoes metas_comissoes_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER metas_comissoes_preencher_filial BEFORE INSERT ON public.metas_comissoes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: metas metas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER metas_preencher_filial BEFORE INSERT ON public.metas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: movimentacao_estoque movimentacao_estoque_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER movimentacao_estoque_preencher_filial BEFORE INSERT ON public.movimentacao_estoque FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: lead_mensagens nao_lidas_sincroniza; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nao_lidas_sincroniza AFTER INSERT OR DELETE ON public.lead_mensagens FOR EACH ROW EXECUTE FUNCTION public.sincronizar_nao_lidas();


--
-- Name: lead_mensagens nao_lidas_sincroniza_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nao_lidas_sincroniza_upd AFTER UPDATE OF lida, direcao ON public.lead_mensagens FOR EACH ROW EXECUTE FUNCTION public.sincronizar_nao_lidas();


--
-- Name: orcamentos orcamentos_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orcamentos_preencher_filial BEFORE INSERT ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: pedidos_compra pedidos_compra_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pedidos_compra_preencher_filial BEFORE INSERT ON public.pedidos_compra FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: pedidos pedidos_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pedidos_preencher_filial BEFORE INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: pre_vendas pre_vendas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pre_vendas_preencher_filial BEFORE INSERT ON public.pre_vendas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: propostas propostas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propostas_preencher_filial BEFORE INSERT ON public.propostas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: servicos_reparo servicos_reparo_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER servicos_reparo_preencher_filial BEFORE INSERT ON public.servicos_reparo FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: tarefas tarefas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tarefas_preencher_filial BEFORE INSERT ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: empresas trg_empresas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: leads trg_enforce_lead_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_lead_limit BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_limit();


--
-- Name: imoveis trg_imoveis_marca_proprietario; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_imoveis_marca_proprietario AFTER INSERT OR UPDATE OF proprietario_id ON public.imoveis FOR EACH ROW EXECUTE FUNCTION public.marcar_cliente_proprietario();


--
-- Name: imoveis trg_imoveis_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_imoveis_updated_at BEFORE UPDATE ON public.imoveis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: lancamentos_financeiros trg_lancamentos_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON public.lancamentos_financeiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: lead_perfil_busca trg_perfil_busca_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_perfil_busca_updated_at BEFORE UPDATE ON public.lead_perfil_busca FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: planos_config trg_planos_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_planos_config_updated_at BEFORE UPDATE ON public.planos_config FOR EACH ROW EXECUTE FUNCTION public.set_planos_config_updated_at();


--
-- Name: usuarios trg_prevent_privilege_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_privilege_escalation BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();


--
-- Name: visitas trg_visitas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visitas_updated_at BEFORE UPDATE ON public.visitas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: troca_cotacoes troca_cotacoes_numerar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER troca_cotacoes_numerar BEFORE INSERT ON public.troca_cotacoes FOR EACH ROW EXECUTE FUNCTION public.numerar_cotacao_troca();


--
-- Name: troca_cotacoes troca_cotacoes_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER troca_cotacoes_preencher_filial BEFORE INSERT ON public.troca_cotacoes FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: vendas_alertas vendas_alertas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendas_alertas_preencher_filial BEFORE INSERT ON public.vendas_alertas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: vendas_pagamentos vendas_pagamentos_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendas_pagamentos_preencher_filial BEFORE INSERT ON public.vendas_pagamentos FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: vendas vendas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendas_preencher_filial BEFORE INSERT ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: vendas_termos vendas_termos_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendas_termos_preencher_filial BEFORE INSERT ON public.vendas_termos FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: visitas visitas_preencher_filial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visitas_preencher_filial BEFORE INSERT ON public.visitas FOR EACH ROW EXECUTE FUNCTION public.preencher_filial();


--
-- Name: lead_mensagens zapintel_ao_vivo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapintel_ao_vivo AFTER INSERT ON public.lead_mensagens REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.tg_zapintel_mensagens_ao_vivo();


--
-- Name: zapintel_lead_perfil zapintel_ficha_ao_vivo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapintel_ficha_ao_vivo AFTER INSERT OR UPDATE ON public.zapintel_lead_perfil FOR EACH ROW EXECUTE FUNCTION public.tg_zapintel_ficha_ao_vivo();


--
-- Name: vendas zapintel_vendas_ao_vivo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapintel_vendas_ao_vivo AFTER INSERT ON public.vendas REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.tg_zapintel_vendas_ao_vivo();


--
-- Name: acessos acessos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT acessos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: acessos acessos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT acessos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: automacoes automacoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automacoes
    ADD CONSTRAINT automacoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: avaliacoes_usados avaliacoes_usados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes_usados
    ADD CONSTRAINT avaliacoes_usados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: avaliacoes_usados avaliacoes_usados_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes_usados
    ADD CONSTRAINT avaliacoes_usados_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: avaliacoes_usados avaliacoes_usados_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes_usados
    ADD CONSTRAINT avaliacoes_usados_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: avaliacoes_usados avaliacoes_usados_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes_usados
    ADD CONSTRAINT avaliacoes_usados_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.inventario_unidades(id) ON DELETE SET NULL;


--
-- Name: cadencia_execucoes cadencia_execucoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_execucoes
    ADD CONSTRAINT cadencia_execucoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: cadencia_execucoes cadencia_execucoes_inscricao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_execucoes
    ADD CONSTRAINT cadencia_execucoes_inscricao_id_fkey FOREIGN KEY (inscricao_id) REFERENCES public.cadencia_inscricoes(id) ON DELETE CASCADE;


--
-- Name: cadencia_inscricoes cadencia_inscricoes_cadencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_inscricoes
    ADD CONSTRAINT cadencia_inscricoes_cadencia_id_fkey FOREIGN KEY (cadencia_id) REFERENCES public.cadencias(id) ON DELETE CASCADE;


--
-- Name: cadencia_inscricoes cadencia_inscricoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_inscricoes
    ADD CONSTRAINT cadencia_inscricoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: cadencia_inscricoes cadencia_inscricoes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_inscricoes
    ADD CONSTRAINT cadencia_inscricoes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id);


--
-- Name: cadencia_inscricoes cadencia_inscricoes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_inscricoes
    ADD CONSTRAINT cadencia_inscricoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: cadencia_passos cadencia_passos_cadencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_passos
    ADD CONSTRAINT cadencia_passos_cadencia_id_fkey FOREIGN KEY (cadencia_id) REFERENCES public.cadencias(id) ON DELETE CASCADE;


--
-- Name: cadencia_passos cadencia_passos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencia_passos
    ADD CONSTRAINT cadencia_passos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: cadencias cadencias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadencias
    ADD CONSTRAINT cadencias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: campanhas_fidelidade campanhas_fidelidade_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanhas_fidelidade
    ADD CONSTRAINT campanhas_fidelidade_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: canais_conectados canais_conectados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_conectados
    ADD CONSTRAINT canais_conectados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: canais_conectados canais_conectados_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_conectados
    ADD CONSTRAINT canais_conectados_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: categorias_produtos categorias_produtos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_produtos
    ADD CONSTRAINT categorias_produtos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: categorias_produtos categorias_produtos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_produtos
    ADD CONSTRAINT categorias_produtos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: chamadas chamadas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamadas
    ADD CONSTRAINT chamadas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: chamadas chamadas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamadas
    ADD CONSTRAINT chamadas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: chamadas chamadas_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamadas
    ADD CONSTRAINT chamadas_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: chat_leituras chat_leituras_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_leituras
    ADD CONSTRAINT chat_leituras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_leituras chat_leituras_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_leituras
    ADD CONSTRAINT chat_leituras_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: chaves_imoveis chaves_imoveis_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chaves_imoveis
    ADD CONSTRAINT chaves_imoveis_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: chaves_imoveis chaves_imoveis_imovel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chaves_imoveis
    ADD CONSTRAINT chaves_imoveis_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES public.imoveis(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: clientes clientes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id);


--
-- Name: clientes clientes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: cobrancas cobrancas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: cobrancas cobrancas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: cobrancas cobrancas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: cobrancas cobrancas_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.garantias_assistencias(id) ON DELETE SET NULL;


--
-- Name: cobrancas cobrancas_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobrancas
    ADD CONSTRAINT cobrancas_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE SET NULL;


--
-- Name: comissoes comissoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: comissoes comissoes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: comissoes comissoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: comissoes comissoes_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: comissoes comissoes_zerado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_zerado_por_fkey FOREIGN KEY (zerado_por) REFERENCES public.usuarios(id);


--
-- Name: configuracoes_sistema configuracoes_sistema_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_sistema
    ADD CONSTRAINT configuracoes_sistema_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: contrato_documentos contrato_documentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_documentos
    ADD CONSTRAINT contrato_documentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: contrato_documentos contrato_documentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_documentos
    ADD CONSTRAINT contrato_documentos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: contrato_modelos contrato_modelos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_modelos
    ADD CONSTRAINT contrato_modelos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: contrato_modelos contrato_modelos_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_modelos
    ADD CONSTRAINT contrato_modelos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.contrato_documentos(id) ON DELETE CASCADE;


--
-- Name: contrato_modelos contrato_modelos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_modelos
    ADD CONSTRAINT contrato_modelos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: contratos_venda contratos_venda_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: contratos_venda contratos_venda_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: contratos_venda contratos_venda_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.contrato_documentos(id) ON DELETE SET NULL;


--
-- Name: contratos_venda contratos_venda_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: contratos_venda contratos_venda_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_venda
    ADD CONSTRAINT contratos_venda_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: distribuicao_regras distribuicao_regras_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribuicao_regras
    ADD CONSTRAINT distribuicao_regras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_usuarios empresa_usuarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_usuarios empresa_usuarios_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: empresa_usuarios empresa_usuarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: empresa_usuarios empresa_usuarios_usuario_public_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_usuario_public_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: fichas_financiamento fichas_financiamento_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_financiamento
    ADD CONSTRAINT fichas_financiamento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: fichas_financiamento fichas_financiamento_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_financiamento
    ADD CONSTRAINT fichas_financiamento_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: fichas_financiamento fichas_financiamento_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_financiamento
    ADD CONSTRAINT fichas_financiamento_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: filiais filiais_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: followups_gerados followups_gerados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: followups_gerados followups_gerados_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id);


--
-- Name: followups_gerados followups_gerados_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: followups_gerados followups_gerados_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_gerados
    ADD CONSTRAINT followups_gerados_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE SET NULL;


--
-- Name: fornecedores fornecedores_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: funil_etapas funil_etapas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funil_etapas
    ADD CONSTRAINT funil_etapas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: funil_etapas funil_etapas_funil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funil_etapas
    ADD CONSTRAINT funil_etapas_funil_id_fkey FOREIGN KEY (funil_id) REFERENCES public.funis(id) ON DELETE CASCADE;


--
-- Name: funis funis_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funis
    ADD CONSTRAINT funis_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: garantias_assistencias garantias_assistencias_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: garantias_assistencias garantias_assistencias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: garantias_assistencias garantias_assistencias_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: garantias_assistencias garantias_assistencias_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);


--
-- Name: garantias_assistencias garantias_assistencias_responsavel_tecnico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_responsavel_tecnico_id_fkey FOREIGN KEY (responsavel_tecnico_id) REFERENCES public.usuarios(id);


--
-- Name: garantias_assistencias garantias_assistencias_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias_assistencias
    ADD CONSTRAINT garantias_assistencias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: imei_consultas imei_consultas_consultado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imei_consultas
    ADD CONSTRAINT imei_consultas_consultado_por_fkey FOREIGN KEY (consultado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: imei_consultas imei_consultas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imei_consultas
    ADD CONSTRAINT imei_consultas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: imoveis imoveis_captado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imoveis
    ADD CONSTRAINT imoveis_captado_por_fkey FOREIGN KEY (captado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: imoveis imoveis_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imoveis
    ADD CONSTRAINT imoveis_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: imoveis imoveis_proprietario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imoveis
    ADD CONSTRAINT imoveis_proprietario_id_fkey FOREIGN KEY (proprietario_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: integracao_eventos integracao_eventos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_eventos
    ADD CONSTRAINT integracao_eventos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: integracao_eventos integracao_eventos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_eventos
    ADD CONSTRAINT integracao_eventos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: inventario_unidades inventario_unidades_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: inventario_unidades inventario_unidades_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: inventario_unidades inventario_unidades_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: inventario_unidades inventario_unidades_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: inventario_unidades inventario_unidades_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);


--
-- Name: inventario_unidades inventario_unidades_recebido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_recebido_por_fkey FOREIGN KEY (recebido_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: inventario_unidades inventario_unidades_reservado_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_reservado_lead_id_fkey FOREIGN KEY (reservado_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: inventario_unidades inventario_unidades_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_unidades
    ADD CONSTRAINT inventario_unidades_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);


--
-- Name: lancamentos_financeiros lancamentos_financeiros_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_financeiros
    ADD CONSTRAINT lancamentos_financeiros_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: lancamentos_financeiros lancamentos_financeiros_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_financeiros
    ADD CONSTRAINT lancamentos_financeiros_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: lead_atribuicoes lead_atribuicoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_atribuicoes
    ADD CONSTRAINT lead_atribuicoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: lead_atribuicoes lead_atribuicoes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_atribuicoes
    ADD CONSTRAINT lead_atribuicoes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: lead_atribuicoes lead_atribuicoes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_atribuicoes
    ADD CONSTRAINT lead_atribuicoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_mensagens lead_mensagens_canal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES public.canais_conectados(id) ON DELETE SET NULL;


--
-- Name: lead_mensagens lead_mensagens_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: lead_mensagens lead_mensagens_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id);


--
-- Name: lead_mensagens lead_mensagens_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_mensagens lead_mensagens_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_mensagens
    ADD CONSTRAINT lead_mensagens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_perfil_busca lead_perfil_busca_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: lead_perfil_busca lead_perfil_busca_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: lead_perfil_busca lead_perfil_busca_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id);


--
-- Name: lead_perfil_busca lead_perfil_busca_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_perfil_busca
    ADD CONSTRAINT lead_perfil_busca_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_convertido_em_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_convertido_em_fkey FOREIGN KEY (convertido_em) REFERENCES public.clientes(id);


--
-- Name: leads leads_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: leads leads_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: leads leads_funil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_funil_id_fkey FOREIGN KEY (funil_id) REFERENCES public.funis(id) ON DELETE SET NULL;


--
-- Name: leads leads_motivo_perda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_motivo_perda_id_fkey FOREIGN KEY (motivo_perda_id) REFERENCES public.motivos_perda(id) ON DELETE SET NULL;


--
-- Name: leads leads_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.usuarios(id);


--
-- Name: lista_espera lista_espera_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: marcas_produtos marcas_produtos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas_produtos
    ADD CONSTRAINT marcas_produtos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: mensagens_internas mensagens_internas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_internas
    ADD CONSTRAINT mensagens_internas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: metas_comissoes metas_comissoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_comissoes
    ADD CONSTRAINT metas_comissoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: metas_comissoes metas_comissoes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_comissoes
    ADD CONSTRAINT metas_comissoes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: metas_comissoes metas_comissoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_comissoes
    ADD CONSTRAINT metas_comissoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: metas metas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: metas metas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: modelos_mensagem modelos_mensagem_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_mensagem
    ADD CONSTRAINT modelos_mensagem_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: motivos_perda motivos_perda_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivos_perda
    ADD CONSTRAINT motivos_perda_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: movimentacao_estoque movimentacao_estoque_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: movimentacao_estoque movimentacao_estoque_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: movimentacao_estoque movimentacao_estoque_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);


--
-- Name: movimentacao_estoque movimentacao_estoque_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: negocios_imobiliarios negocios_imobiliarios_captador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_captador_id_fkey FOREIGN KEY (captador_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_corretor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_imovel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES public.imoveis(id) ON DELETE RESTRICT;


--
-- Name: negocios_imobiliarios negocios_imobiliarios_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios_imobiliarios
    ADD CONSTRAINT negocios_imobiliarios_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: notificacao_prefs notificacao_prefs_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacao_prefs
    ADD CONSTRAINT notificacao_prefs_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: orcamentos orcamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: orcamentos orcamentos_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_troca_cotacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_troca_cotacao_id_fkey FOREIGN KEY (troca_cotacao_id) REFERENCES public.troca_cotacoes(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.inventario_unidades(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedidos_compra pedidos_compra_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: pedidos_compra pedidos_compra_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: pedidos_compra pedidos_compra_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: pedidos_compra pedidos_compra_solicitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_solicitado_por_fkey FOREIGN KEY (solicitado_por) REFERENCES public.usuarios(id);


--
-- Name: pedidos_compra pedidos_compra_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_compra
    ADD CONSTRAINT pedidos_compra_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: pedidos pedidos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: pedidos pedidos_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: pre_vendas pre_vendas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: pre_vendas pre_vendas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: pre_vendas pre_vendas_inventario_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_inventario_unidade_id_fkey FOREIGN KEY (inventario_unidade_id) REFERENCES public.inventario_unidades(id);


--
-- Name: pre_vendas pre_vendas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: pre_vendas pre_vendas_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: pre_vendas pre_vendas_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_vendas
    ADD CONSTRAINT pre_vendas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: produtos produtos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_produtos(id);


--
-- Name: produtos produtos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: produtos produtos_marca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES public.marcas_produtos(id);


--
-- Name: produtos produtos_subcategoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias_produtos(id);


--
-- Name: propostas propostas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: propostas propostas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: propostas propostas_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: rastreamento_config rastreamento_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_config
    ADD CONSTRAINT rastreamento_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: rastreamento_eventos rastreamento_eventos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_eventos
    ADD CONSTRAINT rastreamento_eventos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: rastreamento_eventos rastreamento_eventos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_eventos
    ADD CONSTRAINT rastreamento_eventos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: rastreamento_eventos rastreamento_eventos_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_eventos
    ADD CONSTRAINT rastreamento_eventos_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.rastreamento_visitas(id) ON DELETE SET NULL;


--
-- Name: rastreamento_links rastreamento_links_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_links
    ADD CONSTRAINT rastreamento_links_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: rastreamento_visitas rastreamento_visitas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_visitas
    ADD CONSTRAINT rastreamento_visitas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: rastreamento_visitas rastreamento_visitas_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_visitas
    ADD CONSTRAINT rastreamento_visitas_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: rastreamento_visitas rastreamento_visitas_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rastreamento_visitas
    ADD CONSTRAINT rastreamento_visitas_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.rastreamento_links(id) ON DELETE SET NULL;


--
-- Name: servicos_reparo servicos_reparo_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_reparo
    ADD CONSTRAINT servicos_reparo_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: solicitacoes_marketing solicitacoes_marketing_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_marketing
    ADD CONSTRAINT solicitacoes_marketing_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: stripe_eventos stripe_eventos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_eventos
    ADD CONSTRAINT stripe_eventos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: subcategorias_produtos subcategorias_produtos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias_produtos
    ADD CONSTRAINT subcategorias_produtos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_produtos(id) ON DELETE CASCADE;


--
-- Name: subcategorias_produtos subcategorias_produtos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias_produtos
    ADD CONSTRAINT subcategorias_produtos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: superadmin_logs superadmin_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_logs
    ADD CONSTRAINT superadmin_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.usuarios(id);


--
-- Name: superadmin_logs superadmin_logs_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_logs
    ADD CONSTRAINT superadmin_logs_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: tarefas tarefas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: tarefas tarefas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: tarefas tarefas_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: tarefas tarefas_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: taxas_pagamento taxas_pagamento_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxas_pagamento
    ADD CONSTRAINT taxas_pagamento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: tenant_payment_config tenant_payment_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_payment_config
    ADD CONSTRAINT tenant_payment_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: complementos_empresa tracker_addons_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complementos_empresa
    ADD CONSTRAINT tracker_addons_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: troca_cotacoes troca_cotacoes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: troca_cotacoes troca_cotacoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: troca_cotacoes troca_cotacoes_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: troca_cotacoes troca_cotacoes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: troca_cotacoes troca_cotacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: troca_cotacoes troca_cotacoes_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_cotacoes
    ADD CONSTRAINT troca_cotacoes_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE SET NULL;


--
-- Name: troca_precos troca_precos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_precos
    ADD CONSTRAINT troca_precos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: troca_regras troca_regras_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.troca_regras
    ADD CONSTRAINT troca_regras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_filial_atual_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_filial_atual_id_fkey FOREIGN KEY (filial_atual_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_impersonando_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_impersonando_empresa_id_fkey FOREIGN KEY (impersonando_empresa_id) REFERENCES public.empresas(id) ON DELETE SET NULL;


--
-- Name: veiculo_dados veiculo_dados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_dados
    ADD CONSTRAINT veiculo_dados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: veiculo_dados veiculo_dados_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_dados
    ADD CONSTRAINT veiculo_dados_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.inventario_unidades(id) ON DELETE CASCADE;


--
-- Name: vendas_alertas vendas_alertas_aceito_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas
    ADD CONSTRAINT vendas_alertas_aceito_por_fkey FOREIGN KEY (aceito_por) REFERENCES public.usuarios(id);


--
-- Name: vendas_alertas vendas_alertas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas
    ADD CONSTRAINT vendas_alertas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: vendas_alertas vendas_alertas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas
    ADD CONSTRAINT vendas_alertas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: vendas_alertas vendas_alertas_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_alertas
    ADD CONSTRAINT vendas_alertas_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE CASCADE;


--
-- Name: vendas vendas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: vendas vendas_desconto_aprovado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_desconto_aprovado_por_fkey FOREIGN KEY (desconto_aprovado_por) REFERENCES public.usuarios(id);


--
-- Name: vendas vendas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: vendas vendas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: vendas_pagamentos vendas_pagamentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pagamentos
    ADD CONSTRAINT vendas_pagamentos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: vendas_pagamentos vendas_pagamentos_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pagamentos
    ADD CONSTRAINT vendas_pagamentos_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: vendas_pagamentos vendas_pagamentos_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pagamentos
    ADD CONSTRAINT vendas_pagamentos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE CASCADE;


--
-- Name: vendas vendas_pedido_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_pedido_compra_id_fkey FOREIGN KEY (pedido_compra_id) REFERENCES public.pedidos_compra(id) ON DELETE SET NULL;


--
-- Name: vendas vendas_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: vendas_termos vendas_termos_assinado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_assinado_por_fkey FOREIGN KEY (assinado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: vendas_termos vendas_termos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: vendas_termos vendas_termos_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: vendas_termos vendas_termos_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_termos
    ADD CONSTRAINT vendas_termos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE CASCADE;


--
-- Name: vendas vendas_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.inventario_unidades(id) ON DELETE SET NULL;


--
-- Name: vendas vendas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: vendas vendas_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: visitas visitas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: visitas visitas_corretor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: visitas visitas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: visitas visitas_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: visitas visitas_imovel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES public.imoveis(id) ON DELETE SET NULL;


--
-- Name: visitas visitas_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: zapintel_lead_perfil zapintel_lead_perfil_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_lead_perfil
    ADD CONSTRAINT zapintel_lead_perfil_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: zapintel_venda_lead zapintel_venda_lead_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_venda_lead
    ADD CONSTRAINT zapintel_venda_lead_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: zapintel_venda_lead zapintel_venda_lead_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapintel_venda_lead
    ADD CONSTRAINT zapintel_venda_lead_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE CASCADE;


--
-- Name: acessos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acessos ENABLE ROW LEVEL SECURITY;

--
-- Name: acessos acessos_atualiza_proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acessos_atualiza_proprio ON public.acessos FOR UPDATE USING (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid))));


--
-- Name: acessos acessos_insere_proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acessos_insere_proprio ON public.acessos FOR INSERT WITH CHECK (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid))));


--
-- Name: acessos acessos_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acessos_leitura ON public.acessos FOR SELECT USING (((empresa_id = public.get_empresa_id()) AND ((usuario_id = ( SELECT auth.uid() AS uid)) OR public.is_empresa_admin(empresa_id))));


--
-- Name: assistente_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistente_config ENABLE ROW LEVEL SECURITY;

--
-- Name: assistente_uso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistente_uso ENABLE ROW LEVEL SECURITY;

--
-- Name: automacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: automacoes automacoes_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY automacoes_tenant ON public.automacoes USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: avaliacoes_usados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avaliacoes_usados ENABLE ROW LEVEL SECURITY;

--
-- Name: avaliacoes_usados avaliacoes_usados_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avaliacoes_usados_tenant ON public.avaliacoes_usados USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: avisos_plataforma; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avisos_plataforma ENABLE ROW LEVEL SECURITY;

--
-- Name: avisos_plataforma avisos_superadmin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avisos_superadmin_all ON public.avisos_plataforma USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: avisos_plataforma avisos_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avisos_tenant_read ON public.avisos_plataforma FOR SELECT TO authenticated USING (((ativo = true) AND ((expira_em IS NULL) OR (expira_em > now()))));


--
-- Name: cadencias cad_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cad_tenant ON public.cadencias USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: cadencia_execucoes cade_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cade_tenant ON public.cadencia_execucoes USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: cadencia_execucoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_execucoes ENABLE ROW LEVEL SECURITY;

--
-- Name: cadencia_inscricoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_inscricoes ENABLE ROW LEVEL SECURITY;

--
-- Name: cadencia_passos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadencia_passos ENABLE ROW LEVEL SECURITY;

--
-- Name: cadencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadencias ENABLE ROW LEVEL SECURITY;

--
-- Name: cadencia_inscricoes cadi_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadi_tenant ON public.cadencia_inscricoes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: cadencia_passos cadp_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadp_tenant ON public.cadencia_passos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: campanhas_fidelidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campanhas_fidelidade ENABLE ROW LEVEL SECURITY;

--
-- Name: campanhas_fidelidade campanhas_fidelidade_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campanhas_fidelidade_tenant ON public.campanhas_fidelidade USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: canais_conectados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canais_conectados ENABLE ROW LEVEL SECURITY;

--
-- Name: canais_conectados canais_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canais_escrita ON public.canais_conectados USING (((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = canais_conectados.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true)))) AND ((filial_id IS NULL) OR (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[filial_id])))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = canais_conectados.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true)))));


--
-- Name: canais_conectados canais_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canais_leitura ON public.canais_conectados FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = canais_conectados.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.ativo = true)))) AND ((filial_id IS NULL) OR (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[filial_id]))));


--
-- Name: categorias_produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: chamadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;

--
-- Name: chamadas chamadas_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chamadas_tenant ON public.chamadas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: chat_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_leituras ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_leituras chat_leituras_propria; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_leituras_propria ON public.chat_leituras USING (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid))));


--
-- Name: chaves_imoveis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chaves_imoveis ENABLE ROW LEVEL SECURITY;

--
-- Name: chaves_imoveis chaves_imoveis_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chaves_imoveis_tenant ON public.chaves_imoveis USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: cobrancas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;

--
-- Name: cobrancas cobrancas_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cobrancas_tenant ON public.cobrancas USING (((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = cobrancas.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.ativo = true)))) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = cobrancas.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.ativo = true)))) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: comissoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

--
-- Name: complementos_empresa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.complementos_empresa ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracoes_sistema config_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_delete ON public.configuracoes_sistema FOR DELETE USING (public.is_empresa_admin(empresa_id));


--
-- Name: configuracoes_sistema config_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_insert ON public.configuracoes_sistema FOR INSERT WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: configuracoes_sistema config_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_read ON public.configuracoes_sistema FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: configuracoes_sistema config_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_update ON public.configuracoes_sistema FOR UPDATE USING (public.is_empresa_admin(empresa_id)) WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: configuracoes_sistema; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

--
-- Name: contrato_documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contrato_documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: contrato_modelos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contrato_modelos ENABLE ROW LEVEL SECURITY;

--
-- Name: contratos_venda contrato_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrato_tenant_insert ON public.contratos_venda FOR INSERT WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: contratos_venda contrato_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrato_tenant_select ON public.contratos_venda FOR SELECT USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: contratos_venda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contratos_venda ENABLE ROW LEVEL SECURITY;

--
-- Name: diagnostico_canais diag_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diag_insert ON public.diagnostico_canais FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: diagnostico_canais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnostico_canais ENABLE ROW LEVEL SECURITY;

--
-- Name: distribuicao_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.distribuicao_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: contrato_documentos doc_delete_dono_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_delete_dono_admin ON public.contrato_documentos FOR DELETE TO authenticated USING (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id)));


--
-- Name: contrato_documentos doc_insert_dono_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_insert_dono_admin ON public.contrato_documentos FOR INSERT TO authenticated WITH CHECK (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id)));


--
-- Name: contrato_documentos doc_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_tenant_select ON public.contrato_documentos FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: contrato_documentos doc_update_dono_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_update_dono_admin ON public.contrato_documentos FOR UPDATE TO authenticated USING (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id))) WITH CHECK (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id)));


--
-- Name: distribuicao_regras dr_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dr_tenant ON public.distribuicao_regras USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: empresa_usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_usuarios empresa_usuarios_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresa_usuarios_delete ON public.empresa_usuarios FOR DELETE USING (public.is_empresa_admin(empresa_id));


--
-- Name: empresa_usuarios empresa_usuarios_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresa_usuarios_insert ON public.empresa_usuarios FOR INSERT WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: empresa_usuarios empresa_usuarios_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresa_usuarios_read ON public.empresa_usuarios FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: empresa_usuarios empresa_usuarios_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresa_usuarios_update ON public.empresa_usuarios FOR UPDATE USING (public.is_empresa_admin(empresa_id)) WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas empresas_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresas_isolamento ON public.empresas USING ((id = public.get_empresa_id()));


--
-- Name: fichas_financiamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fichas_financiamento ENABLE ROW LEVEL SECURITY;

--
-- Name: fichas_financiamento fichas_financiamento_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fichas_financiamento_tenant ON public.fichas_financiamento USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: filiais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

--
-- Name: filiais filiais_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY filiais_delete ON public.filiais FOR DELETE USING (public.is_empresa_admin(empresa_id));


--
-- Name: filiais filiais_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY filiais_insert ON public.filiais FOR INSERT WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: filiais filiais_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY filiais_leitura ON public.filiais FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: filiais filiais_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY filiais_update ON public.filiais FOR UPDATE USING (public.is_empresa_admin(empresa_id)) WITH CHECK (public.is_empresa_admin(empresa_id));


--
-- Name: fipe_consultas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fipe_consultas ENABLE ROW LEVEL SECURITY;

--
-- Name: fipe_consultas fipe_consultas_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fipe_consultas_read ON public.fipe_consultas FOR SELECT TO authenticated USING (true);


--
-- Name: fipe_referencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fipe_referencia ENABLE ROW LEVEL SECURITY;

--
-- Name: fipe_referencia fipe_referencia_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fipe_referencia_read ON public.fipe_referencia FOR SELECT TO authenticated USING (true);


--
-- Name: followups_gerados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followups_gerados ENABLE ROW LEVEL SECURITY;

--
-- Name: followups_gerados followups_gerados tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "followups_gerados tenant" ON public.followups_gerados USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: fornecedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

--
-- Name: funil_etapas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funil_etapas ENABLE ROW LEVEL SECURITY;

--
-- Name: funil_etapas funil_etapas_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funil_etapas_rw ON public.funil_etapas USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: funis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funis ENABLE ROW LEVEL SECURITY;

--
-- Name: funis funis_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funis_tenant ON public.funis USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: garantias_assistencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.garantias_assistencias ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_bruto; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_bruto ENABLE ROW LEVEL SECURITY;

--
-- Name: imei_consultas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.imei_consultas ENABLE ROW LEVEL SECURITY;

--
-- Name: imei_consultas imei_consultas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY imei_consultas_insert ON public.imei_consultas FOR INSERT WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: imei_consultas imei_consultas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY imei_consultas_select ON public.imei_consultas FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: imoveis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.imoveis ENABLE ROW LEVEL SECURITY;

--
-- Name: imoveis imoveis_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY imoveis_isolamento ON public.imoveis USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: integracao_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integracao_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: integracao_eventos integracao_eventos_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integracao_eventos_leitura ON public.integracao_eventos FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: inventario_unidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventario_unidades ENABLE ROW LEVEL SECURITY;

--
-- Name: lancamentos_financeiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_atribuicoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_atribuicoes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_atribuicoes lead_atribuicoes_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_atribuicoes_tenant ON public.lead_atribuicoes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: lead_mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_mensagens ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_perfil_busca; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_perfil_busca ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: lista_espera; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;

--
-- Name: lista_espera lista_espera_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lista_espera_tenant ON public.lista_espera USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: marcas_produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marcas_produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens_internas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_internas ENABLE ROW LEVEL SECURITY;

--
-- Name: metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

--
-- Name: metas_comissoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metas_comissoes ENABLE ROW LEVEL SECURITY;

--
-- Name: metas metas_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metas_tenant ON public.metas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: mensagens_internas mi_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mi_delete ON public.mensagens_internas FOR DELETE USING (((empresa_id = public.get_empresa_id()) AND (autor_id = ( SELECT auth.uid() AS uid))));


--
-- Name: mensagens_internas mi_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mi_insert ON public.mensagens_internas FOR INSERT WITH CHECK (((empresa_id = public.get_empresa_id()) AND (autor_id = ( SELECT auth.uid() AS uid))));


--
-- Name: mensagens_internas mi_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mi_select ON public.mensagens_internas FOR SELECT USING (((empresa_id = public.get_empresa_id()) AND ((tipo = 'mural'::text) OR (autor_id = ( SELECT auth.uid() AS uid)) OR (destinatario_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: contrato_modelos modelo_insert_dono_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modelo_insert_dono_admin ON public.contrato_modelos FOR INSERT TO authenticated WITH CHECK (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id)));


--
-- Name: contrato_modelos modelo_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modelo_tenant_select ON public.contrato_modelos FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: contrato_modelos modelo_update_dono_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modelo_update_dono_admin ON public.contrato_modelos FOR UPDATE TO authenticated USING (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id))) WITH CHECK (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND public.is_empresa_admin(empresa_id)));


--
-- Name: modelos_mensagem modelos_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modelos_escrita ON public.modelos_mensagem USING ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = modelos_mensagem.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = modelos_mensagem.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true)))));


--
-- Name: modelos_mensagem modelos_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modelos_leitura ON public.modelos_mensagem FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = modelos_mensagem.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.ativo = true)))));


--
-- Name: modelos_mensagem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modelos_mensagem ENABLE ROW LEVEL SECURITY;

--
-- Name: motivos_perda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motivos_perda ENABLE ROW LEVEL SECURITY;

--
-- Name: motivos_perda motivos_perda_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY motivos_perda_tenant ON public.motivos_perda USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: movimentacao_estoque; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimentacao_estoque ENABLE ROW LEVEL SECURITY;

--
-- Name: negocios_imobiliarios negocios_imob_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY negocios_imob_isolamento ON public.negocios_imobiliarios USING ((empresa_id = public.get_empresa_id()));


--
-- Name: negocios_imobiliarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negocios_imobiliarios ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacao_prefs notif_prefs_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_prefs_own ON public.notificacao_prefs TO authenticated USING ((usuario_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((usuario_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notificacao_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificacao_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: orcamentos orc_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orc_tenant ON public.orcamentos USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: orcamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_webhook_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_webhook_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_compra; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos pedidos_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pedidos_tenant ON public.pedidos USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: lead_perfil_busca perfil_busca_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY perfil_busca_isolamento ON public.lead_perfil_busca USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: planos_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planos_config ENABLE ROW LEVEL SECURITY;

--
-- Name: planos_config planos_config_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planos_config_leitura ON public.planos_config FOR SELECT USING (((ativo = true) OR public.is_super_admin()));


--
-- Name: pre_vendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pre_vendas ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: propostas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;

--
-- Name: propostas propostas_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propostas_tenant ON public.propostas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: push_subscriptions ps_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_tenant ON public.push_subscriptions USING (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (usuario_id = ( SELECT auth.uid() AS uid))));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_webhook_eventos pwe_superadmin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pwe_superadmin_read ON public.payment_webhook_eventos FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: rastreamento_config rastr_config_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_config_escrita ON public.rastreamento_config USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = rastreamento_config.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true)))))) WITH CHECK ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = rastreamento_config.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true))))));


--
-- Name: rastreamento_config rastr_config_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_config_leitura ON public.rastreamento_config FOR SELECT USING ((public.is_super_admin() OR (empresa_id = public.get_empresa_id())));


--
-- Name: rastreamento_eventos rastr_eventos_super; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_eventos_super ON public.rastreamento_eventos USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: rastreamento_eventos rastr_eventos_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_eventos_tenant_read ON public.rastreamento_eventos FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: rastreamento_links rastr_links_acesso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_links_acesso ON public.rastreamento_links USING ((public.is_super_admin() OR (empresa_id = public.get_empresa_id()))) WITH CHECK ((public.is_super_admin() OR (empresa_id = public.get_empresa_id())));


--
-- Name: rastreamento_visitas rastr_visitas_super; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_visitas_super ON public.rastreamento_visitas USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: rastreamento_visitas rastr_visitas_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rastr_visitas_tenant_read ON public.rastreamento_visitas FOR SELECT USING ((empresa_id = public.get_empresa_id()));


--
-- Name: rastreamento_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_config ENABLE ROW LEVEL SECURITY;

--
-- Name: rastreamento_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: rastreamento_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_links ENABLE ROW LEVEL SECURITY;

--
-- Name: rastreamento_visitas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rastreamento_visitas ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: segmentos_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segmentos_config ENABLE ROW LEVEL SECURITY;

--
-- Name: segmentos_config segmentos_config_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segmentos_config_read ON public.segmentos_config FOR SELECT TO authenticated USING (true);


--
-- Name: servicos_reparo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servicos_reparo ENABLE ROW LEVEL SECURITY;

--
-- Name: servicos_reparo servicos_reparo_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY servicos_reparo_tenant ON public.servicos_reparo USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: solicitacoes_marketing sm_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sm_tenant ON public.solicitacoes_marketing USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: solicitacoes_marketing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solicitacoes_marketing ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_eventos stripe_eventos_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stripe_eventos_service_only ON public.stripe_eventos USING (false) WITH CHECK (false);


--
-- Name: subcategorias_produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcategorias_produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas superadmin_atualiza_empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_atualiza_empresas ON public.empresas FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: empresas superadmin_le_empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_le_empresas ON public.empresas FOR SELECT USING (public.is_super_admin());


--
-- Name: superadmin_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superadmin_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmin_logs superadmin_logs_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_logs_escrita ON public.superadmin_logs FOR INSERT WITH CHECK ((public.is_super_admin() AND (admin_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: superadmin_logs superadmin_logs_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_logs_leitura ON public.superadmin_logs FOR SELECT USING (public.is_super_admin());


--
-- Name: tabela_precos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;

--
-- Name: tabela_precos tabela_precos_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tabela_precos_tenant ON public.tabela_precos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: tarefas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefas tarefas_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tarefas_isolamento ON public.tarefas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: taxas_pagamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxas_pagamento ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_produtos tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.categorias_produtos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: clientes tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.clientes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: comissoes tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.comissoes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: fornecedores tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.fornecedores USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: garantias_assistencias tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.garantias_assistencias USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: inventario_unidades tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.inventario_unidades USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: lancamentos_financeiros tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.lancamentos_financeiros USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: lead_mensagens tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.lead_mensagens USING (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK ((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)));


--
-- Name: leads tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.leads USING (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = ( SELECT public.get_empresa_id() AS get_empresa_id)) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: marcas_produtos tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.marcas_produtos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: metas_comissoes tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.metas_comissoes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: movimentacao_estoque tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.movimentacao_estoque USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: pedidos_compra tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.pedidos_compra USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: pre_vendas tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.pre_vendas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: produtos tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.produtos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: subcategorias_produtos tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.subcategorias_produtos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: taxas_pagamento tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.taxas_pagamento USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: vendas tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.vendas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: vendas_pagamentos tenant_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolamento ON public.vendas_pagamentos USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: tenant_payment_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_payment_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_payment_config tpc_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpc_escrita ON public.tenant_payment_config USING ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = tenant_payment_config.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = tenant_payment_config.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (eu.ativo = true)))));


--
-- Name: tenant_payment_config tpc_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpc_leitura ON public.tenant_payment_config FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.empresa_usuarios eu
  WHERE ((eu.empresa_id = tenant_payment_config.empresa_id) AND (eu.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu.ativo = true)))));


--
-- Name: complementos_empresa tracker_addons_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tracker_addons_select ON public.complementos_empresa FOR SELECT USING (((empresa_id = public.get_empresa_id()) OR public.is_super_admin()));


--
-- Name: complementos_empresa tracker_addons_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tracker_addons_write ON public.complementos_empresa USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: troca_cotacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.troca_cotacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: troca_cotacoes troca_cotacoes_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY troca_cotacoes_tenant ON public.troca_cotacoes USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: troca_precos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.troca_precos ENABLE ROW LEVEL SECURITY;

--
-- Name: troca_precos troca_precos_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY troca_precos_tenant ON public.troca_precos USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: troca_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.troca_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: troca_regras troca_regras_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY troca_regras_tenant ON public.troca_regras USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.empresa_usuarios meu
     JOIN public.empresa_usuarios alvo ON ((alvo.empresa_id = meu.empresa_id)))
  WHERE ((meu.usuario_id = ( SELECT auth.uid() AS uid)) AND (meu.ativo = true) AND (meu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (alvo.usuario_id = usuarios.id)))));


--
-- Name: usuarios usuarios_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.empresa_usuarios meu
     JOIN public.empresa_usuarios alvo ON ((alvo.empresa_id = meu.empresa_id)))
  WHERE ((meu.usuario_id = ( SELECT auth.uid() AS uid)) AND (meu.ativo = true) AND (meu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (alvo.usuario_id = usuarios.id))))));


--
-- Name: usuarios usuarios_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_leitura ON public.usuarios FOR SELECT USING ((public.is_super_admin() OR (id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.empresa_usuarios eu1
     JOIN public.empresa_usuarios eu2 ON ((eu1.empresa_id = eu2.empresa_id)))
  WHERE ((eu1.usuario_id = ( SELECT auth.uid() AS uid)) AND (eu2.usuario_id = usuarios.id) AND (eu1.ativo = true))))));


--
-- Name: usuarios usuarios_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.empresa_usuarios meu
     JOIN public.empresa_usuarios alvo ON ((alvo.empresa_id = meu.empresa_id)))
  WHERE ((meu.usuario_id = ( SELECT auth.uid() AS uid)) AND (meu.ativo = true) AND (meu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (alvo.usuario_id = usuarios.id)))))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.empresa_usuarios meu
     JOIN public.empresa_usuarios alvo ON ((alvo.empresa_id = meu.empresa_id)))
  WHERE ((meu.usuario_id = ( SELECT auth.uid() AS uid)) AND (meu.ativo = true) AND (meu.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (alvo.usuario_id = usuarios.id))))));


--
-- Name: veiculo_dados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_dados ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculo_dados veiculo_dados_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY veiculo_dados_isolamento ON public.veiculo_dados USING ((empresa_id = public.get_empresa_id())) WITH CHECK ((empresa_id = public.get_empresa_id()));


--
-- Name: vendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_alertas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas_alertas ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_alertas vendas_alertas_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendas_alertas_tenant_insert ON public.vendas_alertas FOR INSERT WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: vendas_alertas vendas_alertas_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendas_alertas_tenant_select ON public.vendas_alertas FOR SELECT USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: vendas_pagamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas_pagamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_termos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas_termos ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_termos vendas_termos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendas_termos_insert ON public.vendas_termos FOR INSERT WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: vendas_termos vendas_termos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendas_termos_select ON public.vendas_termos FOR SELECT USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: vendas_termos vendas_termos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendas_termos_update ON public.vendas_termos FOR UPDATE USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: visitas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

--
-- Name: visitas visitas_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitas_isolamento ON public.visitas USING (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)]))) WITH CHECK (((empresa_id = public.get_empresa_id()) AND (( SELECT public.filiais_visiveis() AS filiais_visiveis) @> ARRAY[COALESCE(filial_id, (0)::bigint)])));


--
-- Name: zapintel_conversa_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zapintel_conversa_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: zapintel_lead_perfil; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zapintel_lead_perfil ENABLE ROW LEVEL SECURITY;

--
-- Name: zapintel_midia_retida; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zapintel_midia_retida ENABLE ROW LEVEL SECURITY;

--
-- Name: zapintel_venda_lead; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zapintel_venda_lead ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



--
-- Gatilho de produção fora do schema public: perfil em public.usuarios para cada login novo.
--
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

--
-- Job do pg_cron em produção (cron.job, jobid 1 em 19/10/2026).
--
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zapintel-conversa-aquecer') THEN
    INSERT INTO cron.job (schedule, command, nodename, nodeport, database, username, active, jobname)
    VALUES ('0 5 * * *',
            'select public.zapintel_conversa_aquecer(e.empresa_id) from public.complementos_empresa e where e.zapintel_ativo',
            'localhost', 5432, 'postgres', 'postgres', true, 'zapintel-conversa-aquecer');
  END IF;
END $$;

-- =====================================================================================
-- CORRIDA DE IDENTIDADE: o mesmo Direct em duas entregas simultâneas criava dois contatos
-- e dois negócios (22/10/2026).
--
-- O QUE ACONTECIA: um Direct do Instagram chega duas vezes no mesmo instante (os dois
-- conectores da Meta, Página e login do Instagram). As duas requisições procuravam o
-- contato pela identidade, não achavam, e cada uma criava o seu; a gravação da identidade
-- da segunda batia na chave única (empresa_id, canal_tipo, external_id) e o
-- `on conflict do nothing` descartava em silêncio, sem reler o dono. core_negocio_do_canal
-- procurava negócio aberto DAQUELE contato: dois contatos, dois negócios. Produção:
-- 6509/6510 (20/10 19:58, 26 ms), 6528/6529 (21/10 11:14, 101 ms), 6555/6556 (21/10
-- 19:55, 16 ms). No Supabase local, duas conexões sincronizadas reproduziram 10 em 10.
--
-- O QUE MUDA:
--   1. compat_leads_iud (INSERT na view leads, o caminho da webhook-leads) e
--      mensagem_registrar (identidade sem lead_id) travam a identidade com
--      pg_advisory_xact_lock(hashtext(empresa:canal:id)) ANTES de procurar: a segunda
--      entrega espera a primeira terminar e acha o contato dela.
--   2. Se ainda assim a identidade conflitar (quem gravou não passou pela trava), relê o
--      dono, descarta o contato recém-criado e segue com o existente.
--   3. core_negocio_do_canal trava (empresa, contato, loja) — duas mensagens do mesmo
--      contato sem negócio aberto também não abrem dois — e grava a origem no negócio
--      novo (_lead.origem / _lead.origem_id), que desde o corte saía vazia.
--   4. webhook_mid_novo: a Edge descarta a segunda entrega do mesmo Direct pelo mid
--      (janela de 60 s, em ops.webhook_recebidos, a mesma tabela do reenvio por hash).
--   5. Fusão dos três pares gêmeos e dos três contatos herdados do corte com dois
--      negócios abertos na mesma loja (ver o bloco do fim).
--
-- Volta: supabase/scripts/volta/volta-corrida-identidade.sql (definições de 22/10 tiradas
-- da produção; a fusão de dados não volta — está registrada em contato_fusoes e eventos).
-- =====================================================================================

-- ── 3. core_negocio_do_canal: trava por contato e loja, e origem no negócio novo ────────
-- A assinatura ganha dois parâmetros com padrão; os chamadores antigos (4 e 5 argumentos)
-- seguem valendo. Drop + create porque create or replace não muda a lista de parâmetros.
drop function if exists public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean);

create function public.core_negocio_do_canal(p_empresa bigint, p_contato bigint, p_filial bigint,
  p_primeira_msg text default null, p_so_existente boolean default false,
  p_origem text default null, p_origem_id text default null)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_etapa_antes bigint;
begin
  -- Duas mensagens do mesmo contato na mesma loja, sem negócio aberto, chegando juntas:
  -- a segunda espera a primeira e encontra o negócio que ela abriu.
  perform pg_advisory_xact_lock(hashtext('negocio:' || p_empresa || ':' || p_contato || ':' || coalesce(p_filial, -1)));

  select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;
  select n.id into v_negocio from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
     and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
   order by (n.funil_id is not distinct from v_funil) desc, n.created_at desc, n.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  select n.id, coalesce(n.funil_id, v_funil), n.etapa_id into v_negocio, v_funil_neg, v_etapa_antes
    from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
   order by n.created_at desc, n.id desc limit 1;
  if p_so_existente then return v_negocio; end if;

  if v_negocio is null then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg,
                                                                              'origem', p_origem, 'origem_id', p_origem_id))))
    returning id into v_negocio;
    return v_negocio;
  end if;

  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = v_negocio;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao)
  values (p_empresa, v_negocio, v_etapa_antes, coalesce(v_etapa, v_etapa_antes), 'reaberto_por_mensagem');
  return v_negocio;
end $function$;

revoke execute on function public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean, text, text) to service_role;

-- ── 1 e 2. compat_leads_iud: trava a identidade e não deixa contato órfão ──────────────
create or replace function public.compat_leads_iud()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_contato bigint; v_negocio bigint; v_e164 text; e record; v_status text; v_dados jsonb;
  v_criado boolean := false; v_dono bigint;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    select contato_id into v_contato from negocios where id = old.id;
    delete from negocios where id = old.id;
    if v_contato is not null and not exists (select 1 from negocios where contato_id = v_contato) then
      if exists (select 1 from contatos where id = v_contato and dados ? '_cliente') then
        delete from conversas where contato_id = v_contato;
      else
        delete from contatos where id = v_contato;
      end if;
    end if;
    return old;
  end if;

  perform compat_guarda(new.empresa_id);
  v_e164 := core_telefone_e164(new.telefone);
  select * into e from compat_etapa(new.empresa_id, new.funil_id, coalesce(new.kanban_status, 'novo'));
  v_status := case when e.tipo = 'ganho' then 'ganho' when e.tipo = 'perdido' then 'perdido'
                   when e.etapa_id is null and new.perdido_em is not null then 'perdido' else 'aberto' end;
  v_dados := jsonb_strip_nulls(jsonb_build_object('produto_interessado', nullif(new.produto_interessado, ''),
               '_interesse', new.interesse, '_anuncio', new.anuncio));

  if tg_op = 'INSERT' then
    -- A mesma identidade chegando em duas entregas simultâneas: a segunda espera aqui até a
    -- primeira terminar, e então acha o contato que ela criou.
    if new.origem is not null and new.origem_id is not null then
      perform pg_advisory_xact_lock(hashtext(new.empresa_id || ':' || new.origem || ':' || new.origem_id));
    end if;
    if v_e164 is not null then
      select id into v_contato from contatos where empresa_id = new.empresa_id and telefone_e164 = v_e164;
    end if;
    if v_contato is null and new.origem is not null and new.origem_id is not null then
      select contato_id into v_contato from contato_identidades
       where empresa_id = new.empresa_id and canal_tipo = new.origem and external_id = new.origem_id;
    end if;
    if v_contato is null then
      insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, foto_url, origem, origem_id,
                            responsavel_id, responsavel_desde, ativo, observacoes)
      values (new.empresa_id, new.filial_id, new.nome, new.telefone, v_e164, new.instagram, new.foto_url, new.origem, new.origem_id,
              new.responsavel_id, new.responsavel_desde, true, new.observacoes)
      returning id into v_contato;
      v_criado := true;
    end if;
    if new.origem is not null and new.origem_id is not null then
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id)
      values (new.empresa_id, v_contato, new.origem, new.origem_id) on conflict do nothing
      returning contato_id into v_dono;
      -- Conflitou (alguém gravou sem passar pela trava): a identidade já tem dono. O contato
      -- que esta chamada acabou de criar não tem nada pendurado — sai, e segue o do dono.
      if v_dono is null then
        select contato_id into v_dono from contato_identidades
         where empresa_id = new.empresa_id and canal_tipo = new.origem and external_id = new.origem_id;
        if v_criado and v_dono is distinct from v_contato then
          delete from contatos where id = v_contato;
          v_contato := v_dono;
        end if;
      end if;
    end if;
    -- Lead que vem de CANAL (o webhook não achou lead ativo e insere um): usa o negócio aberto
    -- ou reabre o do contato nesta loja, em vez de abrir outro (core_negocio_do_canal). Lead
    -- criado à mão (outra origem) continua criando negócio novo: é decisão de quem cadastrou.
    if new.origem in ('whatsapp', 'instagram', 'messenger') and new.origem_id is not null then
      v_negocio := core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id, new.primeira_msg, false,
                                         new.origem, new.origem_id);
      if v_negocio is not null then
        if new.anuncio is not null then
          update negocios set dados = dados || jsonb_build_object('_anuncio', new.anuncio) where id = v_negocio;
        end if;
        select l.* into new from public.leads l where l.id = v_negocio;
        return new;
      end if;
    end if;
    insert into negocios (id, empresa_id, filial_id, contato_id, funil_id, etapa_id, ordem, valor_estimado, responsavel_id, status,
                          motivo_perda_id, perdido_em, entrou_etapa_em, devolucoes, devolvido_em, dados, created_at)
    values (coalesce(new.id, nextval(pg_get_serial_sequence('public.negocios', 'id'))), new.empresa_id, new.filial_id, v_contato,
            e.funil_id, e.etapa_id, coalesce(new.kanban_ordem, 0), new.valor_estimado, new.responsavel_id, v_status,
            new.motivo_perda_id, new.perdido_em, coalesce(new.data_transferencia_funil, now()), coalesce(new.devolucoes, 0),
            new.devolvido_em,
            v_dados || jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object(
              'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
              'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
              'origem', new.origem, 'origem_id', new.origem_id,
              'kanban_status', case when e.etapa_id is null then coalesce(new.kanban_status, 'novo') end))),
            coalesce(new.created_at, now()))
    returning id into v_negocio;
  else
    v_negocio := old.id;
    select contato_id into v_contato from negocios where id = old.id;
    update contatos set nome = new.nome, telefone = new.telefone,
           telefone_e164 = case when v_e164 is null or not exists (select 1 from contatos x where x.empresa_id = new.empresa_id
                                                                     and x.telefone_e164 = v_e164 and x.id <> v_contato)
                                then v_e164 else telefone_e164 end,
           instagram = new.instagram, foto_url = new.foto_url, origem = new.origem, origem_id = new.origem_id,
           observacoes = new.observacoes
     where id = v_contato
       and (nome, telefone, instagram, foto_url, origem, origem_id, observacoes)
           is distinct from (new.nome, new.telefone, new.instagram, new.foto_url, new.origem, new.origem_id, new.observacoes);
    update negocios n set
      funil_id = e.funil_id, etapa_id = e.etapa_id, ordem = coalesce(new.kanban_ordem, 0), valor_estimado = new.valor_estimado,
      responsavel_id = new.responsavel_id, status = v_status, motivo_perda_id = new.motivo_perda_id, perdido_em = new.perdido_em,
      entrou_etapa_em = case when new.data_transferencia_funil is distinct from old.data_transferencia_funil
                             then new.data_transferencia_funil else n.entrou_etapa_em end,
      devolucoes = coalesce(new.devolucoes, 0), devolvido_em = new.devolvido_em, filial_id = new.filial_id,
      dados = (n.dados - 'produto_interessado' - '_interesse' - '_anuncio') || v_dados
              || jsonb_build_object('_lead', coalesce(n.dados -> '_lead', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                   'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
                   'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
                   'kanban_status', case when e.etapa_id is null then new.kanban_status end)))
     where n.id = old.id;
  end if;
  select l.* into new from public.leads l where l.id = v_negocio;
  return new;
end $function$;

-- ── 1 e 2. mensagem_registrar: a mesma trava no caminho da identidade ──────────────────
create or replace function public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  d           jsonb := coalesce(p_dados, '{}'::jsonb);
  v_negocio   bigint := nullif(d ->> 'lead_id', '')::bigint;
  v_filial    bigint := nullif(d ->> 'filial_id', '')::bigint;
  v_ident     text := nullif(d ->> 'identidade', '');
  v_enviada   boolean := coalesce(d ->> 'direcao', '') <> 'recebida';
  v_canal_tipo   text;
  v_canal_filial bigint;
  v_tipo      text;
  v_contato   bigint;
  v_resp      uuid;
  v_conversa  bigint;
  v_e164      text;
  v_id        bigint;
  v_lead_filial bigint;
  v_criado    boolean := false;
  v_dono      bigint;
begin
  if p_external_id is not null and exists (select 1 from mensagens where external_id = p_external_id) then
    return null;
  end if;
  if p_canal_id is not null then
    select tipo, filial_id into v_canal_tipo, v_canal_filial from canais where id = p_canal_id and empresa_id = p_empresa;
    if not found then
      raise exception 'mensagem_registrar: canal % não é da empresa %', p_canal_id, p_empresa using errcode = '42501';
    end if;
  end if;
  v_tipo := coalesce(nullif(d ->> 'origem', ''), v_canal_tipo);
  -- A loja da mensagem é a do canal; filial_id do chamador só vale para canal sem loja.
  v_filial := coalesce(v_canal_filial, v_filial);

  if v_negocio is not null then
    select n.contato_id, n.filial_id, n.responsavel_id into v_contato, v_lead_filial, v_resp
      from negocios n where n.id = v_negocio and n.empresa_id = p_empresa;
    if v_contato is null then
      raise exception 'mensagem_registrar: lead % não é da empresa %', v_negocio, p_empresa using errcode = '42501';
    end if;
    v_filial := coalesce(v_filial, v_lead_filial);
    -- Lead de outra loja que o canal: a mensagem é da loja do canal, e o contato tem de ter
    -- negócio nela, senão a conversa não aparece em card nenhum (lead_mensagens é por loja).
    if v_canal_filial is not null and v_lead_filial is distinct from v_canal_filial then
      perform core_negocio_do_canal(p_empresa, v_contato, v_canal_filial, d ->> 'conteudo', v_enviada, v_tipo, null);
    end if;
  else
    if v_ident is null or v_tipo is null then
      raise exception 'mensagem_registrar: informe lead_id, ou identidade com origem/canal' using errcode = '23502';
    end if;
    -- A mesma identidade em duas entregas simultâneas: a segunda espera a primeira terminar.
    perform pg_advisory_xact_lock(hashtext(p_empresa || ':' || v_tipo || ':' || v_ident));
    select contato_id into v_contato from contato_identidades
     where empresa_id = p_empresa and canal_tipo = v_tipo and external_id = v_ident;
    if v_contato is null then
      v_e164 := case when v_tipo = 'whatsapp' then core_telefone_e164(v_ident) end;
      if v_e164 is not null then
        select id into v_contato from contatos where empresa_id = p_empresa and telefone_e164 = v_e164;
      end if;
      if v_contato is null then
        insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, origem, origem_id)
        values (p_empresa, v_filial, coalesce(nullif(d ->> 'nome', ''), v_ident),
                case when v_tipo = 'whatsapp' then v_ident end, v_e164, nullif(d ->> 'instagram', ''), v_tipo, v_ident)
        returning id into v_contato;
        v_criado := true;
      end if;
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (p_empresa, v_contato, v_tipo, v_ident, p_canal_id) on conflict do nothing
      returning contato_id into v_dono;
      -- Conflitou: a identidade já tem dono; o contato recém-criado sai e segue o do dono.
      if v_dono is null then
        select contato_id into v_dono from contato_identidades
         where empresa_id = p_empresa and canal_tipo = v_tipo and external_id = v_ident;
        if v_criado and v_dono is distinct from v_contato then
          delete from contatos where id = v_contato;
          v_contato := v_dono;
        end if;
      end if;
    end if;

    -- O negócio do contato NA LOJA DO CANAL: o aberto, ou reabre o mais recente, ou cria
    -- (core_negocio_do_canal). Mensagem enviada pela loja só usa o que existe.
    v_negocio := core_negocio_do_canal(p_empresa, v_contato, v_filial, d ->> 'conteudo', v_enviada, v_tipo, v_ident);
    if v_negocio is not null then
      select coalesce(v_filial, n.filial_id), n.responsavel_id into v_filial, v_resp from negocios n where n.id = v_negocio;
    end if;
  end if;

  select id into v_conversa from conversas
   where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
  if v_conversa is null then
    insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
    values (p_empresa, v_filial, v_contato, p_canal_id, v_resp)
    on conflict on constraint conversas_contato_canal_key do nothing
    returning id into v_conversa;
    if v_conversa is null then
      select id into v_conversa from conversas
       where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
    end if;
  end if;

  insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id,
                         midia_url, midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id,
                         canal_id, created_at)
  values (p_empresa, v_filial, v_conversa, v_contato, d ->> 'direcao',
          coalesce(d ->> 'conteudo', ''), coalesce(nullif(d ->> 'tipo', ''), 'texto'), v_tipo, p_external_id,
          d ->> 'midia_url', (d ->> 'midia_retida_em')::timestamptz, d ->> 'transcricao', d ->> 'status_entrega',
          (d ->> 'status_em')::timestamptz, d ->> 'erro_envio', coalesce((d ->> 'lida')::boolean, false),
          (d ->> 'usuario_id')::uuid, p_canal_id, coalesce((d ->> 'created_at')::timestamptz, now()))
  on conflict (external_id) where external_id is not null do nothing
  returning id into v_id;
  return v_id;
end $function$;

-- ── 4. webhook_mid_novo: a segunda entrega do mesmo Direct é descartada pela Edge ───────
-- Mesma tabela do reenvio por hash, com chave 'mid:<id da mensagem>' e janela de 60 s
-- (o reenvio por hash fica 24 h; o mid só precisa cobrir as entregas simultâneas). Devolve
-- TRUE para a primeira entrega (processar) e FALSE para as seguintes. Na falha de banco a
-- Edge esquece o mid com webhook_reenvio_esquecer, para o reenvio da Meta não ser descartado.
create or replace function public.webhook_mid_novo(p_mid text, p_conta text)
  returns boolean
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_canal bigint;
  v_novo  boolean;
begin
  delete from ops.webhook_recebidos where hash like 'mid:%' and recebido_em < now() - interval '60 seconds';
  select c.id into v_canal from public.canais c where c.external_id = p_conta order by c.id limit 1;
  insert into ops.webhook_recebidos (hash, canal_id, tamanho) values ('mid:' || p_mid, v_canal, 0)
  on conflict (hash) do nothing
  returning true into v_novo;
  return coalesce(v_novo, false);
end $$;

revoke execute on function public.webhook_mid_novo(text, text) from public, anon, authenticated;
grant execute on function public.webhook_mid_novo(text, text) to service_role;

-- ── 5. Fusão dos duplicados de 20–21/10 e dos herdados do corte ────────────────────────
-- Pares gêmeos (mesmo origem_id, criados no mesmo instante): fica o contato mais antigo
-- (core_fundir_contatos move identidade, conversas, mensagens e tudo que aponta para o
-- contato, e registra em contato_fusoes e eventos). Herdados: o mesmo contato com dois
-- negócios abertos na mesma loja, vindos de dois leads antigos unidos no corte.
-- Nos dois casos o negócio mais recente vira o principal: recebe tarefas, chamadas e o
-- trabalho comercial pendurado no outro, que sai do funil (_lead.ativo = false, como no
-- "zerar do funil"; nada é apagado) com registro em negocio_historico e eventos.
-- Idempotente: grupo que já não está no estado esperado é pulado com aviso.
do $$
declare
  g record;
  v_ct_princ bigint; v_ct_rem bigint;
  v_principal bigint; v_outro bigint;
begin
  for g in select * from (values
      -- empresa, contato que fica, contato que sai (null = mesmo contato), negócios do grupo
      (1::bigint, 3640::bigint, 3641::bigint, array[6509, 6510]::bigint[]),
      (1, 3660, 3661, array[6528, 6529]),
      (1, 3686, 3687, array[6555, 6556]),
      (1, 522,  null, array[617, 983]),
      (1, 45,   null, array[1777, 3607]),
      (1, 1049, null, array[4237, 4301])
    ) as t(empresa, fica, sai, negocios)
  loop
    -- Guarda: só mexe se o banco estiver no estado em que o par foi visto em produção —
    -- os negócios listados são dos contatos listados, e os gêmeos têm o mesmo origem_id.
    -- Em outro banco (cópia, local) os mesmos números podem ser de outras pessoas.
    if (select count(*) from negocios n where n.id = any(g.negocios) and n.empresa_id = g.empresa
          and n.contato_id in (g.fica, coalesce(g.sai, g.fica))) <> cardinality(g.negocios) then
      raise notice 'grupo %: negócios não são dos contatos %/%, pulado', g.negocios, g.fica, g.sai;
      continue;
    end if;
    if g.sai is not null then
      if (select c.origem_id from contatos c where c.id = g.fica and c.empresa_id = g.empresa)
         is distinct from (select c.origem_id from contatos c where c.id = g.sai and c.empresa_id = g.empresa)
         or not exists (select 1 from contatos where id = g.sai) then
        raise notice 'fusão %/%: não são gêmeos (origem_id diferente ou ausente), pulado', g.fica, g.sai;
        continue;
      end if;
      perform core_fundir_contatos(g.empresa, g.fica, g.sai);
    end if;

    -- os negócios do grupo, abertos e no funil, do contato que ficou
    select n.id into v_principal from negocios n
     where n.id = any(g.negocios) and n.contato_id = g.fica and n.status = 'aberto'
       and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
     order by n.created_at desc, n.id desc limit 1;
    if v_principal is null then
      raise notice 'grupo %: nenhum negócio aberto, pulado', g.negocios;
      continue;
    end if;

    for v_outro in select n.id from negocios n
                    where n.id = any(g.negocios) and n.id <> v_principal and n.contato_id = g.fica
                      and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
    loop
      update tarefas set lead_id = v_principal where lead_id = v_outro;
      update tarefas set negocio_id = v_principal where negocio_id = v_outro;
      update chamadas set lead_id = v_principal where lead_id = v_outro;
      update visitas set lead_id = v_principal where lead_id = v_outro;
      update assistencia_orcamentos set lead_id = v_principal where lead_id = v_outro;
      update vendas_propostas set lead_id = v_principal where lead_id = v_outro;
      update vendas_fichas_financiamento set lead_id = v_principal where lead_id = v_outro;
      update estoque_unidades set reservado_lead_id = v_principal where reservado_lead_id = v_outro;
      update avaliacao_usados set lead_id = v_principal where lead_id = v_outro;
      update avaliacao_cotacoes set lead_id = v_principal where lead_id = v_outro;

      -- o principal herda responsável e etapa só se não tiver: quem já trabalhou nele decide
      update negocios p set responsavel_id = coalesce(p.responsavel_id, o.responsavel_id)
        from negocios o where p.id = v_principal and o.id = v_outro;

      update negocios set dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb)
                                    || jsonb_build_object('ativo', false, 'fundido_em', v_principal))
       where id = v_outro;
      insert into negocio_historico (empresa_id, negocio_id, acao) values (g.empresa, v_outro, 'fundido');
      insert into eventos (empresa_id, tipo, entidade, entidade_id, dados)
      values (g.empresa, 'negocio.fundido', 'negocio', v_principal,
              jsonb_build_object('removido_do_funil', v_outro, 'contato', g.fica, 'contato_removido', g.sai,
                                 'motivo', '22/10/2026: duplicado (corrida de identidade ou herdado do corte)'));
    end loop;
  end loop;
end $$;

-- VOLTA da 20261118000300_entrada_sempre_gravada.sql: devolve o limite de leads e a mensagem_registrar de antes
-- (corpos de 18/11/2026, iguais aos de produção antes da 0300), tira o job, a tabela de alertas e a coluna.
-- A Edge nova convive com a volta (o update de entrada_pendente_desde falha e só loga); voltar a Edge junto
-- (versão anterior guardada no 06) se quiser o comportamento antigo inteiro.
begin;
select cron.unschedule('entrada-parada') where exists (select 1 from cron.job where jobname = 'entrada-parada');

CREATE OR REPLACE FUNCTION public.core_limite_negocios()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limite int;
  v_abertos int;
begin
  if new.status <> 'aberto' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'aberto' then return new; end if;
  select coalesce(nullif(greatest(e.limite_leads, 0), 0), pc.limite_leads) into v_limite
    from empresas e left join planos_config pc on pc.id = e.plano
   where e.id = new.empresa_id;
  if v_limite is null then return new; end if;
  select count(*) into v_abertos from negocios where empresa_id = new.empresa_id and status = 'aberto';
  if v_abertos >= v_limite then
    raise exception 'LEAD_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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


drop table if exists public.alertas_entrada;
alter table public.canais drop column if exists entrada_pendente_desde;
commit;

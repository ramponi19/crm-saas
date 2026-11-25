-- NUNCA SEM DONO — chave universal `distribuicao.sem_dono` (Lucas, 24/11/2026).
--
-- Valor por empresa e por loja (config da M2/D6): 'esteira' (PADRÃO: tudo como hoje, o negócio sem responsável fica
-- na Esteira, visível para todos) ou 'roleta' (o negócio aberto que ficaria sem dono vai para o próximo da roleta de
-- vendas da loja — a mesma regra e o mesmo ponteiro de lib/roleta.ts: ativos, presentes, pessoas, participantes;
-- empresa com menos de duas lojas = todos; sem loja = matriz). Nenhuma empresa muda sem pedir.
--
-- Uma função faz a regra: core_sem_dono_aplicar(negócio, excluir). Chamam-na: a entrada pelo canal (lead novo ou
-- reaberto), o "devolver" (/api/leads/atribuir), a ausência (/api/ausencia), a devolução automática à esteira
-- (lib/esteira.ts) e a saída da equipe (gatilho abaixo).
-- SAÍDA DA EQUIPE (desativar ou remover alguém): os negócios ABERTOS dela saem dela — para a esteira (modo esteira)
-- ou para a roleta (modo roleta). Antes ficavam com o desligado, invisíveis para os vendedores. É a única mudança
-- que vale também no modo esteira.
--
-- Volta: supabase/scripts/volta/volta-sem-dono.sql
-- Teste: supabase/scripts/testes/teste-sem-dono.sql

do $$
begin
  if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc
       where oid = 'public.core_negocio_do_canal(bigint,bigint,bigint,text,boolean,text,text)'::regprocedure), '-')
     <> 'a76c8696e3d3a22209400477e9e4c5c6' then
    raise exception 'core_negocio_do_canal mudou desde a 0800; revise antes de aplicar';
  end if;
  if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc
       where oid = 'public.negocio_atribuir(bigint,uuid,text,uuid)'::regprocedure), '-') = '-' then
    raise exception 'negocio_atribuir não existe';
  end if;
end $$;

-- ── 1. O modo da loja ────────────────────────────────────────────────────────────────────────────
create or replace function public.core_sem_dono_modo(p_empresa bigint, p_filial bigint)
returns text language sql stable set search_path = public, pg_temp as $$
  select case when public.config_valor_emp(p_empresa, 'distribuicao', 'sem_dono', p_filial) #>> '{}' = 'roleta' then 'roleta' else 'esteira' end
$$;

-- ── 2. A roleta de vendas no banco (espelha lib/roleta.ts: mesmos elegíveis, mesma chave de ponteiro) ─────
create or replace function public.core_roleta_leads_proximo(p_empresa bigint, p_filial bigint, p_excluir uuid[] default '{}')
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_lojas int; v_matriz bigint; v_alvo bigint; v_chave text; v_ids uuid[]; v_ultimo uuid; v_idx int; v_prox uuid;
begin
  select count(*), (array_agg(id order by id) filter (where matriz))[1] into v_lojas, v_matriz
    from public.filiais where empresa_id = p_empresa and ativo;
  if v_lojas >= 2 then
    v_alvo := coalesce(p_filial, v_matriz);
    if v_alvo is null then return null; end if;
  end if;
  v_chave := case when v_lojas < 2 then 'roleta_leads' else 'roleta_leads:' || v_alvo end;
  perform pg_advisory_xact_lock(hashtext(p_empresa || ':' || v_chave));
  select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}') into v_ids
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
     and not eu.conta_servico and eu.participa_roleta and eu.usuario_id is not null
     and not (eu.usuario_id = any(coalesce(p_excluir, '{}')))
     and (v_lojas < 2 or eu.filial_id = v_alvo or (eu.filial_id is null and v_alvo = v_matriz));
  if cardinality(v_ids) = 0 then return null; end if;
  select nullif(valor ->> 'ultimo_usuario_id', '')::uuid into v_ultimo
    from public.configuracoes_sistema where empresa_id = p_empresa and chave = v_chave;
  v_idx := coalesce(array_position(v_ids, v_ultimo), 0);     -- 0 = não está na lista → começa do primeiro
  v_prox := v_ids[(v_idx % cardinality(v_ids)) + 1];
  insert into public.configuracoes_sistema (empresa_id, chave, valor)
  values (p_empresa, v_chave, jsonb_build_object('ultimo_usuario_id', v_prox))
  on conflict (empresa_id, chave) do update set valor = excluded.valor;
  return v_prox;
end $$;

-- ── 3. A regra: negócio aberto e ativo sem responsável → no modo roleta, o próximo da roleta da loja ───────
create or replace function public.core_sem_dono_aplicar(p_negocio bigint, p_excluir uuid[] default '{}')
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n record; v uuid;
begin
  select id, empresa_id, filial_id, responsavel_id, status, ativo into n from public.negocios where id = p_negocio;
  if n.id is null or n.status <> 'aberto' or not n.ativo or n.responsavel_id is not null then return null; end if;
  if public.core_sem_dono_modo(n.empresa_id, n.filial_id) <> 'roleta' then return null; end if;
  v := public.core_roleta_leads_proximo(n.empresa_id, n.filial_id, p_excluir);
  if v is not null then
    perform public.negocio_atribuir(n.id, v, 'distribuir', null);
  end if;
  return v;
end $$;

-- ── 4. Saída da equipe: os negócios abertos saem de quem saiu (esteira ou roleta, pelo modo da loja) ─────
create or replace function public.core_saida_da_equipe()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if old.usuario_id is null then return null; end if;
  if not (tg_op = 'DELETE' or (old.ativo and not new.ativo)) then return null; end if;
  for r in select id from public.negocios
            where empresa_id = old.empresa_id and responsavel_id = old.usuario_id and status = 'aberto' and ativo
            order by id loop
    perform set_config('nexus.acao_atribuicao', 'saida_da_equipe', true);
    update public.negocios set responsavel_id = null where id = r.id and responsavel_id = old.usuario_id;
    perform set_config('nexus.acao_atribuicao', '', true);
    perform public.core_sem_dono_aplicar(r.id, array[old.usuario_id]);
  end loop;
  return null;
end $$;

drop trigger if exists empresa_usuarios_saida_da_equipe on public.empresa_usuarios;
create trigger empresa_usuarios_saida_da_equipe
  after update of ativo or delete on public.empresa_usuarios
  for each row execute function public.core_saida_da_equipe();

-- ── 5. Entrada pelo canal: lead novo ou reaberto passa pela regra ──────────────────────────────────
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
  v_janela int; v_hoje date; v_pv record;  -- pós-venda (C5)
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
  if v_negocio is not null then
    -- 1a. (24/11/2026) a mensagem fica no negócio aberto, mas o chamado aberto do contato também registra
    --     que o cliente respondeu, para o responsável do chamado ver. Módulo ligado e mensagem do cliente.
    if not coalesce(p_so_existente, false) and public.core_modulo_ligado(p_empresa, 'posvenda') then
      select c.id into v_pv from public.posvenda_chamados c
        join public.posvenda_chamado_status s on s.id = c.status_id
       where c.empresa_id = p_empresa and c.contato_id = p_contato
         and (p_filial is null or c.filial_id is not distinct from p_filial)
         and c.resolvido_em is null and s.tipo <> 'resolvido'
       order by c.aberto_em desc, c.id desc limit 1;
      if v_pv.id is not null
         and (select e.tipo from public.posvenda_chamado_eventos e where e.chamado_id = v_pv.id order by e.em desc, e.id desc limit 1)
             is distinct from 'cliente_respondeu' then
        insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, texto)
        values (p_empresa, v_pv.id, 'cliente_respondeu', left(p_primeira_msg, 500));
      end if;
    end if;
    return v_negocio;
  end if;

  -- 1b. PÓS-VENDA (C5, 24/11/2026): só com o módulo ligado e só mensagem DO CLIENTE (a da loja não muda nada).
  --     Fica no pós-venda, sem abrir negócio, quando o contato (nesta loja) tem um CHAMADO ABERTO ou um
  --     ACOMPANHAMENTO PENDENTE vencido ou de hoje dentro de `posvenda.janela_acompanhamento_dias` (padrão 3).
  --     Passo FUTURO não segura: o cliente que escreve querendo comprar segue as regras abaixo e ganha negócio novo.
  if not coalesce(p_so_existente, false) and public.core_modulo_ligado(p_empresa, 'posvenda') then
    v_janela := greatest(coalesce(nullif(public.config_valor_emp(p_empresa, 'posvenda', 'janela_acompanhamento_dias', p_filial) #>> '{}', '')::int, 3), 0);
    v_hoje := public.posvenda_dia_local(p_empresa, now());

    select c.id, c.negocio_id into v_pv from public.posvenda_chamados c
      join public.posvenda_chamado_status s on s.id = c.status_id
     where c.empresa_id = p_empresa and c.contato_id = p_contato
       and (p_filial is null or c.filial_id is not distinct from p_filial)
       and c.resolvido_em is null and s.tipo <> 'resolvido'
     order by c.aberto_em desc, c.id desc limit 1;
    if v_pv.id is not null then
      v_negocio := coalesce(v_pv.negocio_id, (select n2.id from negocios n2 where n2.empresa_id = p_empresa and n2.contato_id = p_contato
                                               and (p_filial is null or n2.filial_id is not distinct from p_filial)
                                             order by n2.created_at desc, n2.id desc limit 1));
      if v_negocio is not null then
        -- mensagens seguidas viram um evento só
        if (select e.tipo from public.posvenda_chamado_eventos e where e.chamado_id = v_pv.id order by e.em desc, e.id desc limit 1)
           is distinct from 'cliente_respondeu' then
          insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, texto)
          values (p_empresa, v_pv.id, 'cliente_respondeu', left(p_primeira_msg, 500));
        end if;
        return v_negocio;
      end if;
    end if;

    select a.id, a.negocio_id into v_pv from public.posvenda_acompanhamentos a
     where a.empresa_id = p_empresa and a.contato_id = p_contato
       and (p_filial is null or a.filial_id is not distinct from p_filial)
       and a.status = 'pendente'
       and public.posvenda_dia_local(p_empresa, a.previsto_para) between v_hoje - v_janela and v_hoje
     order by a.previsto_para desc, a.id desc limit 1;
    if v_pv.id is not null and v_pv.negocio_id is not null then
      update public.posvenda_acompanhamentos set cliente_respondeu_em = coalesce(cliente_respondeu_em, now()) where id = v_pv.id;
      return v_pv.negocio_id;
    end if;
  end if;

  -- 2. ganho recente (pós-venda) — arquivado ou não (23/11/2026, M1b)
  select coalesce((select (c.valor ->> 'pos_venda_dias')::int from configuracoes_sistema c
                    where c.empresa_id = p_empresa and c.chave = 'retorno_cliente'
                      and (c.valor ->> 'pos_venda_dias') ~ '^\d{1,3}$'), 30) into v_dias;
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'ganho' and n2.ganho_em >= now() - make_interval(days => v_dias)
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
    -- sem dono (24/11/2026): com `distribuicao.sem_dono = roleta` na loja, o lead novo já nasce com o próximo da roleta
    perform public.core_sem_dono_aplicar(v_negocio, '{}');
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
  -- sem dono (24/11/2026): reaberto sem responsável → no modo roleta, o próximo da roleta da loja
  perform public.core_sem_dono_aplicar(n.id, '{}');
  return n.id;
end $function$;


do $$
declare f text;
begin
  foreach f in array array['core_sem_dono_modo(bigint,bigint)', 'core_roleta_leads_proximo(bigint,bigint,uuid[])',
                           'core_sem_dono_aplicar(bigint,uuid[])', 'core_saida_da_equipe()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

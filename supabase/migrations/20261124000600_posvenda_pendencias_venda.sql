-- ENTREGA C, ETAPA C4 — PENDÊNCIAS DA VENDA (§8.7 itens 1 e 3b; Lucas, 24/11/2026).
--
-- 1. corrigir_data_venda grava a nova data também em `dados.venda.data` (no mesmo UPDATE do ganho_em), para as
--    duas nunca divergirem. Venda sem `dados.venda` (ganho antigo) não ganha a chave.
-- 2. reabrir_negocio leva `dados.venda` para o histórico da reabertura (`negocio_historico.detalhe.venda`) e tira a
--    chave do negócio: o negócio aberto não carrega mais uma venda. Na próxima entrada no ganho, a rota grava a nova.
-- O resto das duas RPCs é idêntico ao da produção (guarda pelo md5 sem \r).
--
-- Volta: supabase/scripts/volta/volta-posvenda-pendencias-venda.sql
-- Teste: supabase/scripts/testes/teste-posvenda-pendencias-venda.sql (+ esperado)

do $$
begin
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.corrigir_data_venda(bigint,date,text)'::regprocedure)
     is distinct from '6c7612ffc05aee28afcb59ab18881dd2' then
    raise exception 'corrigir_data_venda mudou desde a conferência de 24/11/2026; revise antes de aplicar';
  end if;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.reabrir_negocio(bigint,text)'::regprocedure)
     is distinct from '49ec0ccb4459a546ff4ca0b1ce4c54d1' then
    raise exception 'reabrir_negocio mudou desde a conferência de 24/11/2026; revise antes de aplicar';
  end if;
end $$;

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
  -- C4 (24/11): a data em dados.venda acompanha o ganho_em, para as duas nunca divergirem
  update negocios set ganho_em = v_novo,
         dados = case when dados ? 'venda' and jsonb_typeof(dados -> 'venda') = 'object'
                      then jsonb_set(dados, '{venda,data}', to_jsonb(p_nova_data::text)) else dados end
   where id = n.id and status = 'ganho';
  perform set_config('nexus.corrigir_data_venda', '', true);

  -- Pós-venda (M6): reposiciona os passos pendentes da jornada, quando a função existir.
  if to_regprocedure('public.posvenda_reancorar_jornada(bigint)') is not null then
    execute 'select public.posvenda_reancorar_jornada($1)' using n.id;
  end if;

  return jsonb_build_object('ok', true, 'negocio_id', n.id, 'ganho_em_anterior', n.ganho_em, 'ganho_em_novo', v_novo,
                            'avisos', v_avisos);
end $function$;

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
                                               'valor_estimado', n.valor_estimado, 'etapa_id', n.etapa_id,
                                               -- C4 (24/11): a venda reaberta vai para o histórico e sai do negócio
                                               'venda', n.dados -> 'venda')));

  perform set_config('nexus.reabrir_negocio', n.id::text, true);
  update negocios set status = 'aberto', ganho_em = null, etapa_id = coalesce(v_etapa, etapa_id), dados = dados - 'venda'
   where id = n.id;
  perform set_config('nexus.reabrir_negocio', '', true);

  return jsonb_build_object('ok', true, 'negocio_id', n.id, 'etapa_id', coalesce(v_etapa, n.etapa_id));
end $function$;

-- Teste da 20261124000700_posvenda_roteamento (C5 / antiga M7). Banco local descartável, JM de teste (empresa 1).
-- Parte A: módulo DESLIGADO → a função nova faz EXATAMENTE o que a de produção faz (cópia abaixo, pg_temp.canal_antigo),
--          cenário por cenário, cada um numa transação desfeita.
-- Parte B: módulo LIGADO → os 13 cenários do §2.6 e os pedidos pelo Lucas em 24/11. Termina com RAISE.

-- Cópia FIEL da core_negocio_do_canal de produção antes da C5 (M1b, 23/11/2026; md5 sem \r 001edf0e…).
create or replace function pg_temp.canal_antigo(
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

create function pg_temp.contato(p_nome text) returns bigint language sql as $f$
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, p_nome) returning id $f$;

-- negócio de teste: status, loja, há quantos dias foi ganho (ganho) e se está ativo (arquivado = false)
create function pg_temp.neg(p_ct bigint, p_loja bigint, p_status text, p_dias int, p_ativo boolean) returns bigint language plpgsql as $f$
declare v bigint;
begin
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, perdido_em, motivo_perda_id, dados, created_at)
  values (1, p_loja, p_ct, 1, case p_status when 'ganho' then 15 when 'perdido' then 14 else 18 end, p_status,
          case when p_status = 'ganho' then now() - make_interval(days => p_dias) end,
          case when p_status = 'perdido' then now() - interval '20 days' end,
          case when p_status = 'perdido' then 1 end,
          jsonb_build_object('_lead', jsonb_build_object('ativo', p_ativo)),
          now() - make_interval(days => coalesce(p_dias, 0) + 1))
  returning id into v;
  return v;
end $f$;

-- acompanhamento pendente do negócio, para (hoje + p_dia) às 10h
create function pg_temp.acomp(p_neg bigint, p_dia int) returns bigint language plpgsql as $f$
declare v_cad bigint; v_passo bigint; v_jor bigint; n negocios; v bigint;
begin
  select * into n from negocios where id = p_neg;
  select id into v_cad from posvenda_cadencias where empresa_id = 1 and nome = 'C5 teste';
  if v_cad is null then
    insert into posvenda_cadencias (empresa_id, nome, ativo) values (1, 'C5 teste', false) returning id into v_cad;
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, v_cad, 1, 1, 'whatsapp', 'C5');
  end if;
  select id into v_passo from posvenda_cadencia_passos where cadencia_id = v_cad;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em)
  values (1, n.filial_id, n.contato_id, n.id, v_cad, coalesce(n.ganho_em, now())) returning id into v_jor;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
  values (1, n.filial_id, v_jor, v_passo, n.contato_id, n.id, '0e5e0000-0000-4000-8000-000000000101', 'vendedor',
          ((posvenda_dia_local(1, now()) + p_dia) + time '10:00') at time zone 'America/Sao_Paulo')
  returning id into v;
  return v;
end $f$;

-- chamado do contato, num status do tipo pedido
create function pg_temp.chamado(p_neg bigint, p_tipo text) returns bigint language plpgsql as $f$
declare n negocios; v_st bigint; v bigint;
begin
  select * into n from negocios where id = p_neg;
  select id into v_st from posvenda_chamado_status where empresa_id = 1 and tipo = p_tipo;
  if v_st is null then insert into posvenda_chamado_status (empresa_id, nome, tipo) values (1, p_tipo, p_tipo) returning id into v_st; end if;
  insert into posvenda_chamados (empresa_id, filial_id, numero, contato_id, negocio_id, status_id, titulo, responsavel_id, origem_responsavel, resolvido_em)
  values (1, n.filial_id, (select coalesce(max(numero), 0) + 1 from posvenda_chamados where empresa_id = 1), n.contato_id, n.id, v_st,
          'Chamado C5', '0e5e0000-0000-4000-8000-000000000201', 'administradores', case when p_tipo = 'resolvido' then now() end)
  returning id into v;
  return v;
end $f$;

-- Monta o cenário, chama a função (nova ou antiga) e devolve o "retrato": quem voltou, quantos negócios novos,
-- o histórico do contato, o acompanhamento e os eventos do chamado. Rótulos no lugar dos ids.
create function pg_temp.rodar(p_cen text, p_nova boolean) returns jsonb language plpgsql as $f$
declare
  ct bigint; rot jsonb := '{}'; v_loja bigint := 3; v_so boolean := false; v_ac bigint; v_ch bigint;
  g bigint; ret bigint; antes int; r jsonb;
begin
  ct := pg_temp.contato('C5 ' || p_cen);
  if p_cen like 'janela0%' then
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.janela_acompanhamento_dias', '{"empresa": 0, "lojas": {}}');
  end if;
  case p_cen
    when 'aberto'            then rot := jsonb_build_object('A', pg_temp.neg(ct, 3, 'aberto', null, true));
    when 'ganho_recente'     then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 10, true));
    when 'ganho_antigo'      then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 100, true));
    when 'ganho_arquivado'   then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 10, false));
    when 'perdido'           then rot := jsonb_build_object('P', pg_temp.neg(ct, 3, 'perdido', null, true));
    when 'arquivado'         then rot := jsonb_build_object('X', pg_temp.neg(ct, 3, 'aberto', null, false));
    when 'sem_negocio'       then null;
    when 'loja_errada'       then rot := jsonb_build_object('G6', pg_temp.neg(ct, 6, 'ganho', 100, true));
    when 'so_existente'      then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 100, true)); v_so := true;
    when 'filial_nula'       then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 100, true)); v_loja := null;
    when 'off_acomp_hoje'    then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 0);
    when 'off_chamado'       then g := pg_temp.neg(ct, 3, 'ganho', 200, true); rot := jsonb_build_object('G', g); v_ch := pg_temp.chamado(g, 'aguardando_cliente');
    when 'd330_futuro'       then g := pg_temp.neg(ct, 3, 'ganho', 300, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 30);
    when 'd7_amanha'         then g := pg_temp.neg(ct, 3, 'ganho', 6, true);   rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 1);
    when 'd330_amanha'       then g := pg_temp.neg(ct, 3, 'ganho', 329, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 1);
    when 'acomp_hoje'        then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 0);
    when 'vencido_2'         then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, -2);
    when 'vencido_5'         then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, -5);
    when 'janela0_hoje'      then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 0);
    when 'janela0_ontem'     then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, -1);
    when 'chamado_aberto'    then g := pg_temp.neg(ct, 3, 'ganho', 200, true); rot := jsonb_build_object('G', g); v_ch := pg_temp.chamado(g, 'aguardando_cliente');
    when 'chamado_resolvido' then g := pg_temp.neg(ct, 3, 'ganho', 200, true); rot := jsonb_build_object('G', g); v_ch := pg_temp.chamado(g, 'resolvido');
    when 'aberto_e_chamado'  then g := pg_temp.neg(ct, 3, 'ganho', 200, true); rot := jsonb_build_object('G', g, 'A', pg_temp.neg(ct, 3, 'aberto', null, true)); v_ch := pg_temp.chamado(g, 'andamento');
    when 'acomp_outra_loja'  then rot := jsonb_build_object('G', pg_temp.neg(ct, 3, 'ganho', 100, true)); g := pg_temp.neg(ct, 6, 'ganho', 100, true); rot := rot || jsonb_build_object('G6', g); v_ac := pg_temp.acomp(g, 0);
    when 'loja_envia'        then g := pg_temp.neg(ct, 3, 'ganho', 100, true); rot := jsonb_build_object('G', g); v_ac := pg_temp.acomp(g, 0); v_so := true;
    when 'chamado_duas_msgs' then g := pg_temp.neg(ct, 3, 'ganho', 200, true); rot := jsonb_build_object('G', g); v_ch := pg_temp.chamado(g, 'aberto');
  end case;

  select count(*) into antes from negocios where contato_id = ct;
  if p_nova then ret := core_negocio_do_canal(1, ct, v_loja, 'quero comprar o 18', v_so, 'whatsapp', null);
            else ret := pg_temp.canal_antigo(1, ct, v_loja, 'quero comprar o 18', v_so, 'whatsapp', null); end if;
  if p_cen = 'chamado_duas_msgs' then ret := core_negocio_do_canal(1, ct, v_loja, 'alô?', v_so, 'whatsapp', null); end if;

  r := jsonb_build_object(
    'ret', coalesce((select k from jsonb_each_text(rot) e(k, v) where v::bigint = ret limit 1), case when ret is null then 'nulo' else 'novo' end),
    'novos', (select count(*) from negocios where contato_id = ct) - antes,
    'historico', coalesce((select jsonb_agg(h.acao order by h.acao) from negocio_historico h join negocios x on x.id = h.negocio_id
                            where x.contato_id = ct and h.acao in ('novo_apos_ganho', 'reaberto_por_mensagem')), '[]'),
    'status', (select jsonb_agg(x.status order by x.status) from negocios x where x.contato_id = ct));
  if v_ac is not null then
    r := r || jsonb_build_object('acomp', (select jsonb_build_object('status', status, 'respondeu', cliente_respondeu_em is not null) from posvenda_acompanhamentos where id = v_ac));
  end if;
  if v_ch is not null then
    r := r || jsonb_build_object('eventos', (select count(*) from posvenda_chamado_eventos where chamado_id = v_ch and tipo = 'cliente_respondeu'));
  end if;
  return r;
end $f$;

do $t$
declare
  res jsonb := '{}'; nova jsonb; antiga jsonb; difs jsonb := '[]'; iguais int := 0; cen text;
begin
  -- ── Parte A: módulo desligado = idêntico à produção ──
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  foreach cen in array array['aberto', 'ganho_recente', 'ganho_antigo', 'ganho_arquivado', 'perdido', 'arquivado', 'sem_negocio',
                             'loja_errada', 'so_existente', 'filial_nula', 'off_acomp_hoje', 'off_chamado'] loop
    begin nova := pg_temp.rodar(cen, true); raise exception 'desfaz'; exception when others then if sqlerrm <> 'desfaz' then nova := to_jsonb('ERRO: ' || sqlerrm); end if; end;
    begin antiga := pg_temp.rodar(cen, false); raise exception 'desfaz'; exception when others then if sqlerrm <> 'desfaz' then antiga := to_jsonb('ERRO: ' || sqlerrm); end if; end;
    if nova = antiga then iguais := iguais + 1; else difs := difs || jsonb_build_object(cen, jsonb_build_object('nova', nova, 'antiga', antiga)); end if;
  end loop;
  res := res || jsonb_build_object('A_modulo_desligado', jsonb_build_object('cenarios_iguais', iguais, 'diferentes', difs));

  -- ── Parte B: módulo ligado ──
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  foreach cen in array array['d330_futuro', 'd7_amanha', 'd330_amanha', 'acomp_hoje', 'vencido_2', 'vencido_5', 'janela0_hoje', 'janela0_ontem',
                             'chamado_aberto', 'chamado_resolvido', 'aberto_e_chamado', 'acomp_outra_loja', 'loja_envia', 'chamado_duas_msgs',
                             'perdido', 'arquivado', 'sem_negocio', 'ganho_recente'] loop
    begin nova := pg_temp.rodar(cen, true); raise exception 'desfaz'; exception when others then if sqlerrm <> 'desfaz' then nova := to_jsonb('ERRO: ' || sqlerrm); end if; end;
    res := res || jsonb_build_object('B_' || cen, nova);
  end loop;

  raise exception 'RESULTADO_TESTE_C5 %', res::text;
end $t$;

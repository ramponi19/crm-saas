-- LIBERAÇÃO DIÁRIA DA ESTEIRA (Lucas, 24/11/2026). Universal, por empresa e loja.
--
-- Chave `distribuicao.liberacao_diaria` (config da M2/D6), valor da empresa e opcional por loja:
--   { "ativo": bool, "por_vendedor": int (padrão 10), "pular_primeiro_dia": bool (padrão false), "dias_cliente": int (padrão 14) }
-- Por loja, uma vez por dia em que a loja abre e só depois da abertura: os leads da ESTEIRA (abertos, ativos, sem
-- responsável, fora de funil interno) cujo cliente escreveu nos últimos `dias_cliente` dias, do mais recente para o mais
-- antigo, `por_vendedor` para cada pessoa da roleta de vendas da loja (ativa, presente, pessoa, participante — a mesma
-- regra de lib/roleta.ts). Cada um vai por negocio_atribuir('atribuir') com o motivo "liberação diária da esteira":
-- atribuição manual, fora da devolução automática (1500). Lead que já tem responsável ou foi arquivado não entra.
-- `pular_primeiro_dia`: não libera no primeiro dia de abertura da semana (que recebe o acúmulo do fim de semana).
-- Quem roda: o agendamento do banco (de hora em hora, aos 5 minutos) e o botão "Liberar lote do dia" (dono/admin).
--
-- Volta: supabase/scripts/volta/volta-liberacao-diaria.sql
-- Teste: supabase/scripts/testes/teste-liberacao-diaria.sql

-- Quem está na roleta de vendas da loja (espelha lib/roleta.ts e core_roleta_leads_proximo).
create or replace function public.core_roleta_elegiveis(p_empresa bigint, p_filial bigint)
returns uuid[] language sql stable set search_path = public, pg_temp as $$
  with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo),
       alvo as (select coalesce(p_filial, (select id from lojas where matriz order by id limit 1)) id)
  select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
     and not eu.conta_servico and eu.participa_roleta and eu.usuario_id is not null
     and ((select count(*) from lojas) < 2
          or eu.filial_id = (select id from alvo)
          or (eu.filial_id is null and (select id from alvo) = (select id from lojas where matriz order by id limit 1)))
$$;

-- É o primeiro dia de abertura da semana (segunda a domingo) para a loja?
create or replace function public.core_primeiro_dia_aberto_da_semana(p_empresa bigint, p_filial bigint, p_dia date)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare d date := p_dia - (extract(isodow from p_dia)::int - 1);  -- a segunda-feira da semana (p_dia já é o dia local)
begin
  if not public.core_abre_no_dia(p_empresa, p_filial, p_dia) then return false; end if;
  while d < p_dia loop
    if public.core_abre_no_dia(p_empresa, p_filial, d) then return false; end if;
    d := d + 1;
  end loop;
  return true;
end $$;

-- Libera o lote do dia (uma loja ou todas as da empresa). Devolve o que fez em cada loja.
create or replace function public.core_liberar_lote_esteira(p_empresa bigint, p_filial bigint default null, p_por uuid default null,
                                                            p_agora timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  MOTIVO constant text := 'liberação diária da esteira';
  v_fuso text := coalesce(public.empresa_fuso(p_empresa), 'America/Sao_Paulo');
  v_hoje date := (p_agora at time zone v_fuso)::date;
  v_hora time := (p_agora at time zone v_fuso)::time;
  l record; cfg jsonb; v_por int; v_dias int; v_vend uuid[]; v_cota int[]; v_res jsonb := '{}'; r record;
  i int; v_h bigint; v_feitos int; v_abre time;
begin
  for l in select id from public.filiais where empresa_id = p_empresa and ativo and (p_filial is null or id = p_filial) order by id loop
    cfg := public.config_valor_emp(p_empresa, 'distribuicao', 'liberacao_diaria', l.id);
    if cfg is null or coalesce((cfg ->> 'ativo')::boolean, false) is not true then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'desligado')); continue;
    end if;
    if not public.core_abre_no_dia(p_empresa, l.id, v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'loja fechada hoje')); continue;
    end if;
    select min((i2 ->> 'abre')::time) into v_abre from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, l.id, v_hoje)) i2;
    if v_hora < v_abre then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'antes da abertura')); continue;
    end if;
    if coalesce((cfg ->> 'pular_primeiro_dia')::boolean, false) and public.core_primeiro_dia_aberto_da_semana(p_empresa, l.id, v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'primeiro dia de abertura da semana')); continue;
    end if;
    perform pg_advisory_xact_lock(hashtext('liberacao:' || p_empresa || ':' || l.id));
    if exists (select 1 from public.negocio_historico h join public.negocios n on n.id = h.negocio_id
                where h.empresa_id = p_empresa and n.filial_id = l.id and h.acao = 'atribuir' and h.detalhe ->> 'motivo' = MOTIVO
                  and (h.em at time zone v_fuso)::date = v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'já liberado hoje')); continue;
    end if;
    v_por := greatest(coalesce(nullif(cfg ->> 'por_vendedor', '')::int, 10), 0);
    v_dias := greatest(coalesce(nullif(cfg ->> 'dias_cliente', '')::int, 14), 1);
    v_vend := public.core_roleta_elegiveis(p_empresa, l.id);
    if cardinality(v_vend) = 0 or v_por = 0 then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'ninguém na roleta')); continue;
    end if;
    v_cota := array_fill(0, array[cardinality(v_vend)]);
    i := 0; v_feitos := 0;
    for r in
      select n.id, max(c.ultima_recebida_at) ur
        from public.negocios n
        join public.conversas c on c.empresa_id = n.empresa_id and c.contato_id = n.contato_id
        left join public.funis f on f.id = n.funil_id
       where n.empresa_id = p_empresa and n.filial_id = l.id and n.status = 'aberto' and n.ativo and n.responsavel_id is null
         and not coalesce(f.interno, false)
       group by n.id
      having max(c.ultima_recebida_at) >= p_agora - make_interval(days => v_dias)
       order by max(c.ultima_recebida_at) desc, n.id
       limit v_por * cardinality(v_vend)
    loop
      i := (v_feitos % cardinality(v_vend)) + 1;
      perform public.negocio_atribuir(r.id, v_vend[i], 'atribuir', p_por);
      select max(id) into v_h from public.negocio_historico where negocio_id = r.id and acao = 'atribuir' and para_responsavel = v_vend[i];
      update public.negocio_historico set detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object('motivo', MOTIVO) where id = v_h;
      v_cota[i] := v_cota[i] + 1; v_feitos := v_feitos + 1;
    end loop;
    v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('liberados', v_feitos,
               'por_pessoa', (select jsonb_object_agg(v_vend[k]::text, v_cota[k]) from generate_subscripts(v_vend, 1) k)));
  end loop;
  return v_res;
end $$;

-- O agendamento: todas as empresas com a chave; cada loja decide (ligada, aberta, depois da abertura, uma vez por dia).
create or replace function public.core_liberar_lotes_do_dia()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e bigint; v jsonb := '{}';
begin
  for e in select empresa_id from public.configuracoes_sistema where chave = 'distribuicao.liberacao_diaria' order by empresa_id loop
    begin
      v := v || jsonb_build_object(e::text, public.core_liberar_lote_esteira(e));
    exception when others then
      v := v || jsonb_build_object(e::text, jsonb_build_object('erro', sqlerrm));  -- uma empresa não derruba as outras
    end;
  end loop;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['core_roleta_elegiveis(bigint,bigint)', 'core_primeiro_dia_aberto_da_semana(bigint,bigint,date)',
                           'core_liberar_lote_esteira(bigint,bigint,uuid,timestamptz)', 'core_liberar_lotes_do_dia()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- De hora em hora, aos 5 minutos (na JM, que abre às 9h, o lote sai às 9h05).
select cron.schedule('liberacao-diaria-esteira', '5 * * * *', $cron$ select public.core_liberar_lotes_do_dia() $cron$);

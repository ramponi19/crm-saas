-- PÓS-VENDA: O QUE RODA NO TEMPO + CHAMADOS EM LEITURA + "SEM OFERTAS" (Lucas, 24/11/2026). Só vale com o módulo ligado.
-- 1. Rotina diária por loja (posvenda_rotina_diaria), pelo mesmo agendamento da liberação diária da esteira (pg_cron,
--    de hora em hora): em cada loja, uma vez por dia em que ela abre e só depois da abertura:
--      a) tolerância: passo pendente atrasado além de `tolerancia_dias` do passo vira "perdido" (não fica para sempre
--         na fila; se o passo repete, nasce a próxima ocorrência; o juntado volta à fila);
--      b) ausência: passo que vence hoje (ou atrasado) com o responsável ausente, inativo ou fora da empresa vai para
--         a roleta da loja (posvenda_reatribuir_acompanhamento, o mesmo da 0300).
--    posvenda_rotina_execucoes guarda o que rodou (uma linha por loja e dia; rodar de novo no mesmo dia não faz nada).
-- 2. Pausa do prazo do chamado: entrar num status "aguardando cliente" (e "aguardando terceiro", se a empresa ligar
--    `posvenda.sla_pausa_terceiro`) para o relógio; ao sair, os vencimentos andam o tempo que restava (em horas de loja
--    aberta ou corridas, como a empresa escolheu) a partir de agora. sla_pausado_seg soma o tempo parado.
-- 3. O vendedor responsável por um negócio do cliente vê, em leitura, os chamados desse cliente (e o histórico).
--    Mover, anotar e repassar continuam com o responsável do chamado e os administradores (posvenda_chamado_mover).
-- 4. Confirmação do "sem ofertas": {{nome}} com ou sem espaços, como nos roteiros.
-- Volta: supabase/scripts/volta/volta-posvenda-rotina-diaria.sql   Teste: supabase/scripts/testes/teste-posvenda-rotina-diaria.sql

do $$
declare r record;
begin
  for r in select * from (values
      ('public.posvenda_chamado_mover(bigint,bigint,text,uuid)', '7daff919436196dae95baa98e9d81855'),
      ('public.core_sem_ofertas_pelo_botao(bigint)', '811106c9dfcce521ba19c975e91d7a5c')) v(f, h) loop
    if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = r.f::regprocedure), '-') <> r.h then
      raise exception '% mudou desde a conferência de 24/11/2026; revise antes de aplicar', r.f;
    end if;
  end loop;
end $$;

-- ── 1. Rotina diária ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.posvenda_rotina_execucoes (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint not null references public.filiais(id) on delete cascade,
  dia date not null,
  feito_em timestamptz not null default now(),
  resultado jsonb not null default '{}'::jsonb,
  unique (empresa_id, filial_id, dia)
);
alter table public.posvenda_rotina_execucoes enable row level security;
revoke all on public.posvenda_rotina_execucoes from anon, authenticated;
grant all on public.posvenda_rotina_execucoes to service_role;

-- A rotina de UMA loja (sem conferir horário: quem chama decide). Devolve o que fez.
create or replace function public.posvenda_rotina_loja(p_empresa bigint, p_filial bigint, p_agora timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hoje date := public.posvenda_dia_local(p_empresa, p_agora);
  v_matriz bigint := (select id from public.filiais where empresa_id = p_empresa and matriz order by id limit 1);
  a record; v_perdidos int := 0; v_reatrib int := 0;
begin
  for a in
    select x.id from public.posvenda_acompanhamentos x
      join public.posvenda_cadencia_passos p on p.id = x.passo_id
     where x.empresa_id = p_empresa and x.status = 'pendente' and coalesce(x.filial_id, v_matriz) = p_filial
       and public.posvenda_dia_local(p_empresa, x.previsto_para) + p.tolerancia_dias < v_hoje
     order by x.previsto_para, x.id
  loop
    update public.posvenda_acompanhamentos set status = 'perdido', motivo = 'atraso acima da tolerância' where id = a.id and status = 'pendente';
    v_perdidos := v_perdidos + 1;
  end loop;
  for a in
    select x.id, x.responsavel_id from public.posvenda_acompanhamentos x
      left join public.empresa_usuarios eu on eu.empresa_id = x.empresa_id and eu.usuario_id = x.responsavel_id
     where x.empresa_id = p_empresa and x.status = 'pendente' and coalesce(x.filial_id, v_matriz) = p_filial
       and public.posvenda_dia_local(p_empresa, x.previsto_para) <= v_hoje
       and (eu.usuario_id is null or not eu.ativo or coalesce(eu.ausente, false))
     order by x.previsto_para, x.id
  loop
    perform public.posvenda_reatribuir_acompanhamento(a.id, array[a.responsavel_id], 'responsável ausente no vencimento');
    v_reatrib := v_reatrib + 1;
  end loop;
  return jsonb_build_object('perdidos_por_tolerancia', v_perdidos, 'reatribuidos_por_ausencia', v_reatrib);
end $$;

-- O agendamento: empresas com o módulo ligado; cada loja roda uma vez por dia em que abre, depois da abertura.
create or replace function public.posvenda_rotina_diaria(p_agora timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e bigint; l record; v jsonb := '{}'; v_emp jsonb; v_fuso text; v_hoje date; v_hora time; v_abre time; v_id bigint; v_res jsonb;
begin
  for e in select empresa_id from public.empresa_modulos where modulo = 'posvenda' and ativo order by empresa_id loop
    v_emp := '{}';
    begin
      v_fuso := coalesce(public.empresa_fuso(e), 'America/Sao_Paulo');
      v_hoje := (p_agora at time zone v_fuso)::date;
      v_hora := (p_agora at time zone v_fuso)::time;
      for l in select id from public.filiais where empresa_id = e and ativo order by id loop
        if not public.core_abre_no_dia(e, l.id, v_hoje) then
          v_emp := v_emp || jsonb_build_object(l.id::text, 'loja fechada hoje'); continue;
        end if;
        select min((i ->> 'abre')::time) into v_abre from jsonb_array_elements(public.core_intervalos_do_dia(e, l.id, v_hoje)) i;
        if v_hora < v_abre then
          v_emp := v_emp || jsonb_build_object(l.id::text, 'antes da abertura'); continue;
        end if;
        v_id := null;
        insert into public.posvenda_rotina_execucoes (empresa_id, filial_id, dia) values (e, l.id, v_hoje)
          on conflict (empresa_id, filial_id, dia) do nothing returning id into v_id;
        if v_id is null then
          v_emp := v_emp || jsonb_build_object(l.id::text, 'já rodou hoje'); continue;
        end if;
        v_res := public.posvenda_rotina_loja(e, l.id, p_agora);
        update public.posvenda_rotina_execucoes set resultado = v_res where id = v_id;
        v_emp := v_emp || jsonb_build_object(l.id::text, v_res);
      end loop;
    exception when others then
      v_emp := jsonb_build_object('erro', sqlerrm);  -- uma empresa não derruba as outras
    end;
    v := v || jsonb_build_object(e::text, v_emp);
  end loop;
  return v;
end $$;

-- ── 2. Pausa do prazo do chamado ─────────────────────────────────────────────────────────────────
alter table public.posvenda_chamados add column if not exists sla_pausado_desde timestamptz;

-- Horas que contam para o prazo entre dois instantes (loja aberta ou corridas, como a empresa/loja escolheu).
create or replace function public.posvenda_horas_entre(p_empresa bigint, p_filial bigint, p_de timestamptz, p_ate timestamptz)
returns numeric language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_fuso text := coalesce(public.empresa_fuso(p_empresa), 'America/Sao_Paulo');
  v_dia date; v_fim_dia date; i jsonb; v_ini timestamptz; v_fim timestamptz; v_seg numeric := 0;
begin
  if p_de is null or p_ate is null or p_ate <= p_de then return 0; end if;
  if coalesce(public.config_valor_emp(p_empresa, 'posvenda', 'sla_horas', p_filial) #>> '{}', 'loja_aberta') = 'corridas' then
    return extract(epoch from p_ate - p_de) / 3600;
  end if;
  v_dia := (p_de at time zone v_fuso)::date;
  v_fim_dia := (p_ate at time zone v_fuso)::date;
  while v_dia <= v_fim_dia and v_dia - (p_de at time zone v_fuso)::date < 800 loop
    for i in select x from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, p_filial, v_dia)) x loop
      v_ini := greatest((v_dia + (i ->> 'abre')::time) at time zone v_fuso, p_de);
      v_fim := least((v_dia + (i ->> 'fecha')::time) at time zone v_fuso, p_ate);
      if v_fim > v_ini then v_seg := v_seg + extract(epoch from v_fim - v_ini); end if;
    end loop;
    v_dia := v_dia + 1;
  end loop;
  return v_seg / 3600;
end $$;

-- O status pausa o prazo? aguardando_cliente sempre; aguardando_terceiro se a empresa ligar posvenda.sla_pausa_terceiro.
create or replace function public.posvenda_status_pausa(p_empresa bigint, p_filial bigint, p_tipo text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_tipo = 'aguardando_cliente'
      or (p_tipo = 'aguardando_terceiro'
          and coalesce((public.config_valor_emp(p_empresa, 'posvenda', 'sla_pausa_terceiro', p_filial) #>> '{}')::boolean, false))
$$;

create or replace function public.posvenda_chamado_mover(p_chamado bigint, p_status bigint default null, p_texto text default null,
                                                         p_responsavel uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.posvenda_chamados; v_user uuid := auth.uid(); v_admin boolean; s_de record; s_para record;
  v_txt text := nullif(btrim(coalesce(p_texto, '')), '');
  v_agora timestamptz := now(); v_pausa_de boolean; v_pausa_para boolean;
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
    v_pausa_de := c.sla_pausado_desde is not null;
    v_pausa_para := s_para.tipo <> 'resolvido' and public.posvenda_status_pausa(c.empresa_id, c.filial_id, s_para.tipo);
    update public.posvenda_chamados
       set status_id = s_para.id,
           primeira_resposta_em = coalesce(primeira_resposta_em, case when s_para.tipo <> 'aberto' then v_agora end),
           resolvido_em = case when s_para.tipo = 'resolvido' then v_agora else null end
     where id = c.id;
    if v_pausa_de and not v_pausa_para then
      -- saiu da pausa: os prazos ainda abertos andam o tempo que restava, contado a partir de agora
      update public.posvenda_chamados
         set sla_pausado_seg = sla_pausado_seg + greatest(extract(epoch from v_agora - c.sla_pausado_desde)::int, 0),
             sla_resposta_vence = case when c.primeira_resposta_em is null and c.sla_resposta_vence is not null and c.sla_resposta_vence > c.sla_pausado_desde
                                       then public.posvenda_sla_vence(c.empresa_id, c.filial_id, v_agora,
                                              public.posvenda_horas_entre(c.empresa_id, c.filial_id, c.sla_pausado_desde, c.sla_resposta_vence))
                                       else sla_resposta_vence end,
             sla_resolucao_vence = case when c.sla_resolucao_vence is not null and c.sla_resolucao_vence > c.sla_pausado_desde
                                        then public.posvenda_sla_vence(c.empresa_id, c.filial_id, v_agora,
                                               public.posvenda_horas_entre(c.empresa_id, c.filial_id, c.sla_pausado_desde, c.sla_resolucao_vence))
                                        else sla_resolucao_vence end,
             sla_pausado_desde = null
       where id = c.id;
    elsif v_pausa_para and not v_pausa_de then
      update public.posvenda_chamados set sla_pausado_desde = v_agora where id = c.id;
    end if;
    insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, de, para, texto, por)
    values (c.empresa_id, c.id, 'status', s_de.nome, s_para.nome, v_txt, v_user);
  elsif v_txt is not null then
    update public.posvenda_chamados set primeira_resposta_em = coalesce(primeira_resposta_em, v_agora) where id = c.id;
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
                                    'primeira_resposta_em', primeira_resposta_em, 'resolvido_em', resolvido_em,
                                    'sla_pausado_desde', sla_pausado_desde, 'sla_resolucao_vence', sla_resolucao_vence)
            from public.posvenda_chamados where id = c.id);
end $$;

-- ── 3. Chamados: o vendedor do cliente lê ───────────────────────────────────────────────────────
create or replace function public.posvenda_chamado_visivel(p_empresa bigint, p_contato bigint, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_responsavel = auth.uid()
      or public.is_empresa_admin(p_empresa)
      or exists (select 1 from public.negocios n
                  where n.empresa_id = p_empresa and n.contato_id = p_contato and n.responsavel_id = auth.uid())
$$;
drop policy if exists posvenda_chamados_leitura on public.posvenda_chamados;
create policy posvenda_chamados_leitura on public.posvenda_chamados for select to authenticated
  using (empresa_id = (select get_empresa_id()) and public.posvenda_chamado_visivel(empresa_id, contato_id, responsavel_id));
drop policy if exists posvenda_chamado_eventos_leitura on public.posvenda_chamado_eventos;
create policy posvenda_chamado_eventos_leitura on public.posvenda_chamado_eventos for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and exists (select 1 from public.posvenda_chamados c where c.id = chamado_id
                      and public.posvenda_chamado_visivel(c.empresa_id, c.contato_id, c.responsavel_id)));

-- ── 4. "Sem ofertas": {{nome}} com ou sem espaços ─────────────────────────────────────────────────
do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.core_sem_ofertas_pelo_botao(bigint)'::regprocedure);
  v_novo := replace(v_def, $q$replace(v_texto, '{{nome}}', coalesce(split_part(btrim(coalesce(v_nome, '')), ' ', 1), ''))$q$,
                           $q$regexp_replace(v_texto, '\{\{\s*nome\s*\}\}', coalesce(split_part(btrim(coalesce(v_nome, '')), ' ', 1), ''), 'gi')$q$);
  if v_novo = v_def then raise exception 'core_sem_ofertas_pelo_botao: trecho do {{nome}} não encontrado'; end if;
  execute v_novo;
end $$;

do $$
declare f text;
begin
  foreach f in array array['posvenda_rotina_loja(bigint,bigint,timestamptz)', 'posvenda_rotina_diaria(timestamptz)',
                           'posvenda_horas_entre(bigint,bigint,timestamptz,timestamptz)', 'posvenda_status_pausa(bigint,bigint,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- usada pela RLS: a sessão precisa executar
  execute 'revoke all on function public.posvenda_chamado_visivel(bigint,bigint,uuid) from public, anon';
  execute 'grant execute on function public.posvenda_chamado_visivel(bigint,bigint,uuid) to authenticated, service_role';
end $$;

-- De hora em hora, aos 10 minutos (cada loja roda uma vez por dia, depois da abertura).
select cron.schedule('posvenda-rotina-diaria', '10 * * * *', $cron$ select public.posvenda_rotina_diaria() $cron$);

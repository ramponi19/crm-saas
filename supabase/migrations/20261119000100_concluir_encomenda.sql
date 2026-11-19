-- CONCLUIR VENDA SÓ COM O DINHEIRO FECHADO (hotfix 19/11/2026, branch fix/entregar-sem-pagamento).
--
-- O BURACO: o "Entregar" do Histórico concluía a encomenda pelo navegador SEM gravar o saldo
-- (historico-view.tsx chamava finalizarEncomenda sem pagamento). Em 19/11, 93 encomendas
-- concluídas valiam R$ 651.827 e só R$ 156.947 estavam em vendas_pagamentos; 52 sem pagamento
-- nenhum. O PDV, por sua vez, deixava finalizar com "Falta R$ X".
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   1. vendas_vendas ganha concluida_em / concluida_por / concluida_via: quem concluiu, quando e
--      por qual tela. Até hoje não havia registro nenhum.
--   2. concluir_encomenda(venda, pagamentos, acessorios, origem): o ÚNICO caminho que conclui uma
--      venda pendente (encomenda ou "pendente de entrega"). Uma transação: grava os acessórios e os
--      pagamentos recebidos, soma TODOS os pagamentos do fechamento (sinal + agora) e compara com o
--      total; se faltar, aborta com "Saldo em aberto: R$ X" e nada fica gravado.
--   3. encomenda_saldo(venda): total, já pago e saldo do fechamento, calculados no banco, para a
--      tela mostrar o mesmo número que a conclusão vai conferir.
--   4. concluir_venda_pdv(grupo, entrega_pendente): a venda de balcão nasce 'em_fechamento' e só
--      vira 'concluida' (ou 'pendente_entrega') aqui, com a mesma conferência de saldo.
--   5. Gatilho vendas_conclusao_guarda: o navegador (papéis authenticated/anon) não consegue mais
--      gravar 'concluida' nem 'pendente_entrega' direto — nem por INSERT nem por UPDATE. Só as
--      funções acima (que rodam como o dono) passam. O service_role (rotas do servidor) não é
--      barrado: é código nosso, revisado.
--
-- A venda é bigint (vendas_vendas.id), não uuid. O "fechamento" é o grupo_pdv: uma venda por item,
-- os pagamentos na primeira linha do grupo (convenção do PDV e da encomenda desde 09/2026).
--
-- Volta: supabase/scripts/volta/volta-concluir-encomenda.sql (voltar o APP antes).

-- ── 1. Quem concluiu, quando, por onde ──────────────────────────────────────────────────────
alter table public.vendas_vendas
  add column if not exists concluida_em  timestamptz,
  add column if not exists concluida_por uuid references public.usuarios(id) on delete set null,
  add column if not exists concluida_via text;

alter table public.vendas_vendas drop constraint if exists vendas_concluida_via_check;
alter table public.vendas_vendas add constraint vendas_concluida_via_check
  check (concluida_via is null or concluida_via in ('pdv', 'encomenda', 'historico'));

comment on column public.vendas_vendas.concluida_em  is 'Quando a venda virou concluida (concluir_encomenda / concluir_venda_pdv). Nulo nas anteriores a 19/11/2026.';
comment on column public.vendas_vendas.concluida_por is 'Quem concluiu. Nulo nas anteriores a 19/11/2026: não havia registro.';
comment on column public.vendas_vendas.concluida_via is 'Tela da conclusão: pdv (balcão), encomenda (aba Encomenda do PDV) ou historico.';

-- ── Moeda em pt-BR para as mensagens de erro ────────────────────────────────────────────────
create or replace function public.vendas_moeda(p numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'R$ ' || translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,999,990.00'), ',.', '.,')
$$;
revoke all on function public.vendas_moeda(numeric) from public, anon;
grant execute on function public.vendas_moeda(numeric) to authenticated, service_role;

-- ── 2. Gatilho: concluir só pelas funções ───────────────────────────────────────────────────
create or replace function public.vendas_conclusao_guarda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Dentro de concluir_encomenda/concluir_venda_pdv (SECURITY DEFINER) o current_user é o dono
  -- das funções; o navegador chega como authenticated (ou anon). Só esse é barrado.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status in ('concluida', 'pendente_entrega')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'Venda só é concluída pelo fechamento, com o pagamento conferido'
      using errcode = '42501',
            hint = 'Use concluir_venda_pdv (balcão) ou concluir_encomenda (entrega).';
  end if;
  return new;
end $$;
revoke all on function public.vendas_conclusao_guarda() from public, anon, authenticated;

drop trigger if exists vendas_conclusao_guarda on public.vendas_vendas;
create trigger vendas_conclusao_guarda
  before insert or update of status on public.vendas_vendas
  for each row execute function public.vendas_conclusao_guarda();

-- ── 3. Saldo do fechamento (leitura, com a RLS de quem chama) ──────────────────────────────
create or replace function public.encomenda_saldo(p_venda_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_grupo text;
  v_ids   bigint[];
  v_total numeric;
  v_pago  numeric;
begin
  select coalesce(v.grupo_pdv::text, 'v:' || v.id) into v_grupo
    from vendas_vendas v where v.id = p_venda_id;
  if v_grupo is null then raise exception 'Venda não encontrada' using errcode = 'P0002'; end if;

  select array_agg(v.id), sum(v.valor_venda) filter (where v.status not in ('cancelada', 'devolvido'))
    into v_ids, v_total
    from vendas_vendas v
   where coalesce(v.grupo_pdv::text, 'v:' || v.id) = v_grupo
     and v.empresa_id = (select get_empresa_id());

  select coalesce(sum(p.valor_pago), 0) into v_pago
    from vendas_pagamentos p where p.venda_id = any (v_ids);

  return jsonb_build_object(
    'total', round(coalesce(v_total, 0), 2),
    'pago',  round(v_pago, 2),
    'saldo', round(greatest(coalesce(v_total, 0) - v_pago, 0), 2)
  );
end $$;
revoke all on function public.encomenda_saldo(bigint) from public, anon;
grant execute on function public.encomenda_saldo(bigint) to authenticated, service_role;

-- ── 4. Concluir a encomenda / entrega pendente ─────────────────────────────────────────────
-- p_pagamentos: [{ "forma": "pix", "valor": 1500, "parcelas": 3, "bandeira": "visa_master",
--                  "valor_com_juros": 1580.40 }]   (o que o cliente paga AGORA)
-- p_acessorios: [{ "descricao": "Capinha", "valor": 80 }]   (vendidos junto na entrega)
-- p_origem:     'encomenda' (aba Encomenda do PDV) | 'historico'
create or replace function public.concluir_encomenda(
  p_venda_id   bigint,
  p_pagamentos jsonb default '[]'::jsonb,
  p_acessorios jsonb default '[]'::jsonb,
  p_origem     text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_emp      bigint := get_empresa_id();
  v          vendas_vendas%rowtype;
  v_grupo    uuid;
  v_ids      bigint[];
  v_pend     bigint[];
  v_primeira bigint;
  v_total    numeric;
  v_pago     numeric;
  v_forma    text;
  v_formas   int;
  v_baixou   int := 0;
  p          jsonb;
  a          jsonb;
  v_valor    numeric;
  v_parc     int;
  v_novos    bigint[] := '{}';
  v_id_novo  bigint;
begin
  if v_uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  if v_emp is null then raise exception 'Sem empresa na sessão' using errcode = '42501'; end if;
  if not sessao_pode_escrever() then
    raise exception 'A empresa está em modo somente leitura' using errcode = '42501';
  end if;
  if p_origem is not null and p_origem not in ('encomenda', 'historico') then
    raise exception 'Origem inválida: %', p_origem using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_pagamentos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_acessorios, '[]'::jsonb)) <> 'array' then
    raise exception 'Pagamentos e acessórios precisam ser listas' using errcode = '22023';
  end if;

  -- A venda: da empresa de quem chama E de uma loja que essa pessoa enxerga. Mesma mensagem
  -- para "não existe" e "é de outro": não confirmar a existência de venda alheia.
  select * into v from vendas_vendas where id = p_venda_id for update;
  if not found or v.empresa_id <> v_emp
     or not (coalesce(v.filial_id, 0) = any (filiais_visiveis())) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if v.status not in ('encomenda', 'pendente_entrega') then
    raise exception 'Esta venda não está pendente de entrega (situação: %)', coalesce(v.status, 'sem situação')
      using errcode = '22023';
  end if;

  -- Encomenda antiga (antes de 16/09/2026) não tem grupo: ganha um agora, para o acessório e o
  -- pagamento da entrega ficarem amarrados a ela.
  v_grupo := v.grupo_pdv;
  if v_grupo is null then
    v_grupo := gen_random_uuid();
    update vendas_vendas set grupo_pdv = v_grupo where id = v.id;
  end if;

  -- Trava o fechamento inteiro (todas as linhas do grupo) antes de somar.
  perform 1 from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo for update;
  select array_agg(id order by id),
         array_agg(id order by id) filter (where status in ('encomenda', 'pendente_entrega')),
         min(id)
    into v_ids, v_pend, v_primeira
    from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo;

  -- Acessórios levados na entrega: uma venda própria no mesmo grupo (é o que mantém o relatório
  -- por produto certo — a capinha não vira "parte do iPhone").
  for a in select * from jsonb_array_elements(coalesce(p_acessorios, '[]'::jsonb)) loop
    v_valor := round(coalesce((a->>'valor')::numeric, 0), 2);
    if v_valor <= 0 or coalesce(btrim(a->>'descricao'), '') = '' then
      raise exception 'Acessório sem descrição ou sem valor' using errcode = '22023';
    end if;
    insert into vendas_vendas (empresa_id, filial_id, grupo_pdv, cliente_id, vendedor_id, usuario_id,
                               valor_venda, valor_custo, canal_venda, status, data_venda, observacoes,
                               concluida_em, concluida_por, concluida_via)
    values (v_emp, v.filial_id, v_grupo, v.cliente_id, v_uid, v_uid,
            v_valor, 0, coalesce(v.canal_venda, 'encomenda'), 'concluida', now(),
            'Acessório: ' || left(btrim(a->>'descricao'), 200),
            now(), v_uid, p_origem)
    returning id into v_id_novo;
    v_novos := v_novos || v_id_novo;
  end loop;

  -- O dinheiro recebido agora, na primeira venda do fechamento (onde o sinal também está).
  for p in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    v_valor := round(coalesce((p->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;
    if coalesce(p->>'forma', '') not in ('dinheiro', 'pix', 'debito', 'credito', 'link') then
      raise exception 'Forma de pagamento inválida: %', coalesce(p->>'forma', '(vazia)') using errcode = '22023';
    end if;
    v_parc := case when p->>'forma' in ('credito', 'link') then greatest(1, coalesce((p->>'parcelas')::int, 1)) end;
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago,
                                   parcelas, bandeira_cartao, valor_com_juros)
    values (v_emp, v.filial_id, v_primeira, p->>'forma', v_valor,
            v_parc,
            case when p->>'forma' = 'credito' then coalesce(nullif(p->>'bandeira', ''), 'visa_master') end,
            case when (p->>'valor_com_juros')::numeric > v_valor then round((p->>'valor_com_juros')::numeric, 2) end);
  end loop;

  -- A conta: tudo o que o fechamento vale x tudo o que foi pago nele (sinal + agora).
  select coalesce(sum(valor_venda) filter (where status not in ('cancelada', 'devolvido')), 0)
    into v_total
    from vendas_vendas where empresa_id = v_emp and grupo_pdv = v_grupo;
  select coalesce(sum(valor_pago), 0) into v_pago
    from vendas_pagamentos where venda_id = any (v_ids || v_novos);

  if v_pago + 0.009 < v_total then
    raise exception 'Saldo em aberto: %', vendas_moeda(v_total - v_pago)
      using errcode = 'P0001',
            detail = format('Total %s, pago %s.', vendas_moeda(v_total), vendas_moeda(v_pago));
  end if;

  -- Forma resumida na venda (o detalhe fica em vendas_pagamentos): só quando entrou dinheiro agora.
  select count(distinct e->>'forma'), min(e->>'forma'),
         max(case when e->>'forma' in ('credito', 'link') then coalesce((e->>'parcelas')::int, 1) end)
    into v_formas, v_forma, v_parc
    from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e
   where coalesce((e->>'valor')::numeric, 0) > 0;

  -- Conclui. A data da venda passa a ser a da ENTREGA (é por ela que o faturamento do mês conta).
  -- A série do aparelho só existe na unidade: copiada para a venda se ela não tiver.
  update vendas_vendas vv
     set status          = 'concluida',
         data_venda      = now(),
         concluida_em    = now(),
         concluida_por   = v_uid,
         concluida_via   = p_origem,
         numero_serie    = coalesce(nullif(vv.numero_serie, ''),
                             (select coalesce(nullif(u.imei, ''), nullif(u.numero_serie, ''))
                                from estoque_unidades u
                               where u.id = vv.unidade_id and u.empresa_id = v_emp)),
         forma_pagamento = case when v_formas = 1 then v_forma
                                when v_formas > 1 then 'multiplo'
                                else vv.forma_pagamento end,
         parcelas        = case when v_formas = 1 and v_parc > 1 then v_parc
                                when v_formas >= 1 then null
                                else vv.parcelas end
   where vv.id = any (v_pend);

  -- A peça sai do estoque.
  with b as (
    update estoque_unidades u set status = 'vendido'
     where u.empresa_id = v_emp
       and u.id in (select unidade_id from vendas_vendas where id = any (v_pend) and unidade_id is not null)
       and u.status is distinct from 'vendido'
    returning u.id
  ) select count(*) into v_baixou from b;

  return jsonb_build_object(
    'venda_ids', to_jsonb(v_ids || v_novos),
    'concluidas', to_jsonb(v_pend),
    'total', round(v_total, 2),
    'pago', round(v_pago, 2),
    'baixou', v_baixou
  );
end $$;
revoke all on function public.concluir_encomenda(bigint, jsonb, jsonb, text) from public, anon;
grant execute on function public.concluir_encomenda(bigint, jsonb, jsonb, text) to authenticated;

-- ── 5. Fechar a venda de balcão ─────────────────────────────────────────────────────────────
-- O PDV grava as linhas como 'em_fechamento' e os pagamentos; esta função confere a soma e só
-- então muda a situação. Com entrega pendente, o item com peça fica 'pendente_entrega' (baixa no
-- Entregar) e o acessório conclui na hora, como sempre foi.
create or replace function public.concluir_venda_pdv(p_grupo uuid, p_entrega_pendente boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_emp    bigint := get_empresa_id();
  v_ids    bigint[];
  v_total  numeric;
  v_pago   numeric;
  v_outras int;
  v_alheia int;
begin
  if v_uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  if v_emp is null then raise exception 'Sem empresa na sessão' using errcode = '42501'; end if;
  if not sessao_pode_escrever() then
    raise exception 'A empresa está em modo somente leitura' using errcode = '42501';
  end if;

  perform 1 from vendas_vendas where empresa_id = v_emp and grupo_pdv = p_grupo for update;
  select array_agg(id order by id),
         count(*) filter (where status is distinct from 'em_fechamento'),
         count(*) filter (where usuario_id is distinct from v_uid
                            or not (coalesce(filial_id, 0) = any (filiais_visiveis()))),
         coalesce(sum(valor_venda), 0)
    into v_ids, v_outras, v_alheia, v_total
    from vendas_vendas where empresa_id = v_emp and grupo_pdv = p_grupo;

  if v_ids is null or v_alheia > 0 then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if v_outras > 0 then
    raise exception 'Esta venda já foi fechada' using errcode = '22023';
  end if;

  select coalesce(sum(valor_pago), 0) into v_pago
    from vendas_pagamentos where venda_id = any (v_ids);

  if v_pago + 0.009 < v_total then
    raise exception 'Saldo em aberto: %', vendas_moeda(v_total - v_pago)
      using errcode = 'P0001',
            detail = format('Total %s, pago %s.', vendas_moeda(v_total), vendas_moeda(v_pago));
  end if;

  update vendas_vendas
     set status        = case when p_entrega_pendente and unidade_id is not null then 'pendente_entrega' else 'concluida' end,
         concluida_em  = case when p_entrega_pendente and unidade_id is not null then null else now() end,
         concluida_por = case when p_entrega_pendente and unidade_id is not null then null else v_uid end,
         concluida_via = case when p_entrega_pendente and unidade_id is not null then null else 'pdv' end
   where id = any (v_ids);

  return jsonb_build_object('venda_ids', to_jsonb(v_ids), 'total', round(v_total, 2), 'pago', round(v_pago, 2));
end $$;
revoke all on function public.concluir_venda_pdv(uuid, boolean) from public, anon;
grant execute on function public.concluir_venda_pdv(uuid, boolean) to authenticated;

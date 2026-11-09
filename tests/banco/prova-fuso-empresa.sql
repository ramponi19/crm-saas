-- PROVA no banco LOCAL da migração 20261110000100_fuso_empresa (10/11/2026). Só no banco local.
--
--   psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres" -X -A -t -q \
--        -v arquivo=supabase/migrations/20261110000100_fuso_empresa.sql -f tests/banco/prova-fuso-empresa.sql
--   (para a volta: -v arquivo=supabase/scripts/volta/volta-fuso-empresa.sql)
--
-- Tudo numa transação desfeita no fim: o `now()` é o mesmo do começo ao fim, então as funções do
-- ZapIntel rodam ANTES e DEPOIS de aplicar o arquivo com o mesmo relógio, e o JSON inteiro tem de
-- sair IGUAL para a empresa 1 (Brasília). Depois, os cortes de dia e de mês nos horários de virada
-- (20h59, 21h01, 23h59 e 00h01 de Brasília, e 30/11→01/12), o fuso de outra empresa (Manaus) e o
-- "atrasado" do financeiro.
begin;
set local client_min_messages = warning;
-- o superadmin local, como o PostgREST faria (auth.uid())
select set_config('request.jwt.claims', '{"sub":"3c7b4bba-9b95-4126-84b1-5b91b385ea6e","role":"authenticated"}', true);

create temp table res(n serial, linha text) on commit drop;
create temp table saidas(fase text, funcao text, saida text) on commit drop;

insert into saidas
select 'antes', f, s from (values
  ('dashboard',         (select public.zapintel_dashboard(null, 1)::text)),
  ('lista_esperando',   (select public.zapintel_dashboard_lista('esperando', null, null, 1)::text)),
  ('lista_inatividade', (select public.zapintel_dashboard_lista('inatividade', null, null, 1)::text)),
  ('leads_lista',       (select public.zapintel_leads_lista('{}'::jsonb, 'prioridade', 1, 50, null, 1)::text)),
  ('atendimento',       (select public.zapintel_atendimento(30, null, 1)::text))
) v(f, s);

\i :arquivo

insert into saidas
select 'depois', f, s from (values
  ('dashboard',         (select public.zapintel_dashboard(null, 1)::text)),
  ('lista_esperando',   (select public.zapintel_dashboard_lista('esperando', null, null, 1)::text)),
  ('lista_inatividade', (select public.zapintel_dashboard_lista('inatividade', null, null, 1)::text)),
  ('leads_lista',       (select public.zapintel_leads_lista('{}'::jsonb, 'prioridade', 1, 50, null, 1)::text)),
  ('atendimento',       (select public.zapintel_atendimento(30, null, 1)::text))
) v(f, s);

insert into res(linha)
select case when a.saida = d.saida then 'OK   ' else 'FALHOU ' end || a.funcao || ': saída igual antes e depois (' || length(a.saida) || ' caracteres)'
from saidas a join saidas d on d.funcao = a.funcao and d.fase = 'depois' where a.fase = 'antes' order by a.funcao;

-- Daqui para baixo só vale com a migração aplicada (ida).
do $$
declare
  ida boolean := to_regprocedure('public.empresa_fuso(bigint)') is not null;
  fz text; t timestamptz; dia date; mes timestamptz; ok boolean;
begin
  if not ida then
    insert into res(linha) values ('OK   (volta) empresa_fuso não existe mais');
    return;
  end if;

  fz := public.empresa_fuso(1);
  insert into res(linha) values (case when fz = 'America/Sao_Paulo' then 'OK   ' else 'FALHOU ' end || 'empresa 1 sem configuração = ' || fz);

  -- Viradas de dia em Brasília: o dia da loja e o início do dia
  for t in select unnest(array['2026-11-10 20:59-03', '2026-11-10 21:01-03', '2026-11-10 23:59-03']::timestamptz[]) loop
    dia := (t at time zone fz)::date;
    ok := dia = date '2026-11-10'
      and (date_trunc('day', t at time zone fz) at time zone fz) = timestamptz '2026-11-10 00:00-03';
    insert into res(linha) values (case when ok then 'OK   ' else 'FALHOU ' end || to_char(t at time zone fz, 'HH24:MI') || ' de 10/11 cai no dia 10/11 (UTC já seria ' || (t at time zone 'UTC')::date || ')');
  end loop;
  t := timestamptz '2026-11-11 00:01-03';
  insert into res(linha) values (case when (t at time zone fz)::date = date '2026-11-11' then 'OK   ' else 'FALHOU ' end || '00:01 de 11/11 cai no dia 11/11');

  -- Virada de mês: 30/11 21h01 ainda é novembro; 01/12 00h01 já é dezembro
  t := timestamptz '2026-11-30 21:01-03';
  mes := date_trunc('month', t at time zone fz) at time zone fz;
  insert into res(linha) values (case when mes = timestamptz '2026-11-01 00:00-03' then 'OK   ' else 'FALHOU ' end || '30/11 às 21h01: mês começa em 01/11 00:00 de Brasília (UTC diria dezembro)');
  t := timestamptz '2026-12-01 00:01-03';
  mes := date_trunc('month', t at time zone fz) at time zone fz;
  insert into res(linha) values (case when mes = timestamptz '2026-12-01 00:00-03' then 'OK   ' else 'FALHOU ' end || '01/12 às 00h01: mês começa em 01/12 00:00');

  -- Outra empresa em Manaus (UTC−4): 23h30 de Manaus = 00h30 de Brasília do dia seguinte
  insert into public.configuracoes_sistema (empresa_id, chave, valor) values (5, 'fuso', '{"fuso": "America/Manaus"}')
    on conflict (empresa_id, chave) do update set valor = excluded.valor;
  fz := public.empresa_fuso(5);
  t := timestamptz '2026-11-10 23:30-04';
  insert into res(linha) values (case when fz = 'America/Manaus' and (t at time zone fz)::date = date '2026-11-10' and (t at time zone 'America/Sao_Paulo')::date = date '2026-11-11'
    then 'OK   ' else 'FALHOU ' end || 'empresa 5 em Manaus: 23h30 local é 10/11 nela e 11/11 em Brasília');

  -- Fuso inválido e texto puro caem/valem como esperado
  update public.configuracoes_sistema set valor = '{"fuso": "Marte/Base"}' where empresa_id = 5 and chave = 'fuso';
  insert into res(linha) values (case when public.empresa_fuso(5) = 'America/Sao_Paulo' then 'OK   ' else 'FALHOU ' end || 'fuso inválido cai no padrão');
  update public.configuracoes_sistema set valor = '"America/Rio_Branco"' where empresa_id = 5 and chave = 'fuso';
  insert into res(linha) values (case when public.empresa_fuso(5) = 'America/Rio_Branco' then 'OK   ' else 'FALHOU ' end || 'valor em texto puro também vale');

  -- "Atrasado" do financeiro: vencimento de HOJE (dia da loja) não vira atrasado; o de ontem vira
  insert into public.financeiro_lancamentos (empresa_id, tipo, valor, descricao, data_venc, status)
  values (1, 'despesa', 1, 'PROVA FUSO hoje', (now() at time zone 'America/Sao_Paulo')::date, 'pendente'),
         (1, 'despesa', 1, 'PROVA FUSO ontem', (now() at time zone 'America/Sao_Paulo')::date - 1, 'pendente');
  perform public.refresh_status_atrasados();
  insert into res(linha) select case when (select status from public.financeiro_lancamentos where descricao = 'PROVA FUSO hoje') = 'pendente'
     and (select status from public.financeiro_lancamentos where descricao = 'PROVA FUSO ontem') = 'atrasado' then 'OK   ' else 'FALHOU ' end
     || 'refresh_status_atrasados: vence hoje = pendente, venceu ontem = atrasado';
end $$;

select linha from res order by n;
rollback;

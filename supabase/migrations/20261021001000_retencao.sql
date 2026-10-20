-- Retenção diária (limpeza de 20/10): o que é log ou cofre temporário sai sozinho.
--
--   integracao_eventos ..... > 90 dias (log das integrações: C2S, portais)
--   historico_bruto ........ > 7 dias  (cofre do payload cru do histórico da Meta;
--                                       nada lê a tabela: só a Edge grava e
--                                       hard_delete_empresa apaga — conferido em 20/10)
--   ops.webhook_recebidos .. > 24 h    (hashes de reenvio da Meta; a tabela nasce
--                                       com a 20261021000200 — até lá é pulada)
--   zapintel_midia_retida .. fica: já guarda só a referência; o arquivo sai do
--                            Storage pela retenção de mídia (lib/storage/retencao.ts).
--
-- Regra de loja aberta: nunca um DELETE único. A procedure apaga em lotes (padrão
-- 5.000 linhas), dá COMMIT a cada lote e pausa entre eles. Por isso é PROCEDURE sem
-- SET search_path (procedure com SET não pode dar COMMIT): os nomes vão qualificados.
-- Cada execução deixa uma linha por tabela em ops.retencao_execucoes.
--
-- Agenda: pg_cron 'retencao-diaria' às 07:00 UTC = 04:00 em São Paulo
-- (cron.timezone do projeto é GMT).

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.retencao_execucoes (
  id           bigint generated always as identity primary key,
  executado_em timestamptz not null default now(),
  tabela       text not null,
  apagadas     bigint not null,
  lotes        integer not null
);
alter table ops.retencao_execucoes enable row level security;

create or replace procedure ops.purgar_retencao(p_lote integer default 5000, p_pausa double precision default 1)
language plpgsql as $$
declare
  r record; n bigint; total bigint; lotes integer;
begin
  for r in
    select * from (values
      ('public.integracao_eventos',  'created_at < now() - interval ''90 days'''),
      ('public.historico_bruto',     'created_at < now() - interval ''7 days'''),
      ('ops.webhook_recebidos',      'recebido_em < now() - interval ''24 hours''')
    ) v(tabela, condicao)
  loop
    if to_regclass(r.tabela) is null then continue; end if;
    total := 0; lotes := 0;
    loop
      execute format('delete from %s where ctid = any (array(select ctid from %s where %s limit %s))',
                     r.tabela, r.tabela, r.condicao, p_lote);
      get diagnostics n = row_count;
      exit when n = 0;
      total := total + n; lotes := lotes + 1;
      commit;
      exit when n < p_lote;
      perform pg_sleep(p_pausa);
    end loop;
    insert into ops.retencao_execucoes (tabela, apagadas, lotes) values (r.tabela, total, lotes);
    commit;
  end loop;
end $$;

revoke all on procedure ops.purgar_retencao(integer, double precision) from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'retencao-diaria') then
      perform cron.unschedule('retencao-diaria');
    end if;
    perform cron.schedule('retencao-diaria', '0 7 * * *', 'call ops.purgar_retencao()');
  end if;
end $$;

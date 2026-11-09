# Fotos de saúde — SÓ Postgres (desde 20/10 13:45; nada de query_logs nem Log Explorer)

## Regra (20/10 16:07): consultas ao pg_stat_statements sempre com a MESMA forma

Cada texto de consulta diferente vira uma entrada nova no pg_stat_statements. Em 20/10 havia 4.926 entradas
(2.598 avulsas do papel postgres), e qualquer leitura do pgss passou a gerar ~5 MB de arquivo temporário. O
coletor de métricas do Supabase lê o pgss ~2×/min: 913 GB de temporário desde maio. O pgss foi zerado em
20/10 às 16:07:17 (foto final em pgss-20261020-final-1607.json).

- **Copiar e colar exatamente os textos abaixo**, sem mudar espaço, alias nem coluna. Quem precisar de outro
  recorte faz o recorte LOCALMENTE (node, sobre o JSON salvo), não com uma consulta nova ao pgss.
- Nada de consulta avulsa ao pgss para "dar uma olhada". Se faltar campo, muda-se o texto canônico uma vez, aqui,
  e ele passa a ser o novo canônico.
- Função no banco (`ops.foto_pgss()`) só fora do expediente: criar função é DDL e faz o PostgREST recarregar o
  schema (ver o incidente de 20/10 no 06).

### Q1 — pg_stat_database + mensagens da última hora (texto canônico)
select json_build_object('em', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'), 'db', (select json_build_object('xact_commit', xact_commit, 'xact_rollback', xact_rollback, 'blks_read', blks_read, 'blks_hit', blks_hit, 'temp_bytes', temp_bytes, 'temp_files', temp_files, 'deadlocks', deadlocks) from pg_stat_database where datname = current_database()), 'msgs_1h', (select json_agg(json_build_object('canal', canal_id, 'rec', rec, 'env', env)) from (select canal_id, count(*) filter (where direcao = 'recebida') rec, count(*) filter (where direcao = 'enviada') env from public.mensagens where created_at >= now() - interval '1 hour' group by 1 order by 1) x), 'banco', pg_size_pretty(pg_database_size(current_database()))) foto;

Salvar em tools/saude/fotos/pgdb-AAAAMMDD-HHMM.json (pasta fora do git).

### Q2 — pg_stat_statements (texto canônico, a ÚNICA consulta ao pgss)
**Desde 21/10 ~16h50 (diagnóstico do ZapIntel):** ganhou `max` (max_exec_time, ms). É o novo canônico; o de antes
(sem `max`) não se usa mais. Lembrete: consulta cancelada por statement_timeout NÃO entra no pgss (só as que
terminam) — `max` fica abaixo do teto e as canceladas só aparecem como ausência.

**Desde 22/10 06:00:** ganhou `fn` (a primeira função `"public"."x"(` da consulta INTEIRA). Motivo: o `q` corta em
300 caracteres e, nas RPCs com 3+ parâmetros, o nome da função fica depois do corte — insights e atendimento têm os
mesmos parâmetros e eram indistinguíveis. É o novo canônico; o de antes não se usa mais. Os `id` continuam os mesmos,
então o delta contra foto antiga funciona (o `fn` sai da foto nova, pelo `id`). Base do dia: pgss-20261022-0600.json.

select json_agg(json_build_object('id', s.queryid::text, 'papel', r.rolname, 'calls', s.calls, 'ms', round(s.total_exec_time::numeric), 'max', round(s.max_exec_time::numeric), 'lidos', s.shared_blks_read, 'temp', s.temp_blks_read + s.temp_blks_written, 'wal', s.wal_bytes, 'fn', substring(s.query from '"public"\."([a-z_0-9]+)"\('), 'q', left(s.query, 300))) from extensions.pg_stat_statements s left join pg_roles r on r.oid = s.userid;

Salvar em tools/saude/fotos/pgss-AAAAMMDD-HHMM.json (fora do git) e rodar: node tools/saude/diff-pgss.mjs <anterior> <nova> 5
(Recortes por papel, por tabela, por função: em node sobre os JSON, nunca com SQL novo.)

### 3. IOwait
Painel Supabase no chrome-devtools (Observability → Database → CPU usage, tooltip), última hora.
Script de extração: scratchpad iowait-dia.js (média, mediana, > 20%, > 30%, máximo).

> Base depois do zeramento: pgss-20261020-1607-reset.json (lista vazia = pgss zerado às 16:07:17). A primeira foto
> depois disso compara contra ela; as fotos de antes do zeramento (pgss-20261020-1315/1520/1541) não servem para delta.

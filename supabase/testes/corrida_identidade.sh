#!/usr/bin/env bash
# CORRIDA DE IDENTIDADE (22/10/2026) — duas entregas simultâneas do mesmo Direct.
#
# Reproduz o que criou os pares 6509/6510, 6528/6529 e 6555/6556 em produção: o mesmo
# Direct do Instagram chega duas vezes no mesmo instante (os dois conectores da Meta), e
# as duas requisições procuram o contato, não acham e criam cada uma o seu.
#
# Duas conexões, sincronizadas por pg_sleep_until, N rodadas por caminho:
#   edge       INSERT na view leads (o que a webhook-leads faz) + mensagem_registrar com lead_id
#   registrar  mensagem_registrar pela identidade (sem lead_id)
# Cada rodada usa um origem_id novo, sem identidade prévia. Esperado, por rodada:
# 1 contato, 1 identidade, 1 negócio aberto, 1 mensagem. Tudo é apagado no fim.
#
#   bash supabase/testes/corrida_identidade.sh [rodadas=50]   (Supabase local, 127.0.0.1:54322)
#
# Só para banco LOCAL: grava e apaga dados de verdade.
set -u
N=${1:-50}
PSQL=${PSQL:-/c/Ferramentas/pgsql-18.4/bin/psql.exe}
export PGPASSWORD=${PGPASSWORD:-postgres} PGCLIENTENCODING=UTF8
CONN="host=127.0.0.1 port=54322 dbname=postgres user=postgres"
EMP=1; LOJA=3; CANAL=26
RUN=$(date +%s)
DIR=$(mktemp -d)

gerar() { # $1 = caminho, $2 = conexão (a|b); o instante de cada rodada sai de :'base', passado no disparo
  local caminho=$1 lado=$2 i
  for i in $(seq 1 "$N"); do
    echo "select pg_sleep_until(:'base'::timestamptz + interval '400 milliseconds' * $i) as _x \\gset"
    if [ "$caminho" = edge ]; then
      echo "insert into public.leads (empresa_id, filial_id, nome, origem, origem_id, primeira_msg, kanban_status, ativo)
            values ($EMP, $LOJA, 'corrida $i', 'instagram', 'corrida-$RUN-edge-$i', 'oi', 'novo', true) returning id as lead \\gset"
      echo "select public.mensagem_registrar($EMP, $CANAL, 'corrida-$RUN-edge-mid-$i',
            jsonb_build_object('lead_id', :lead, 'direcao', 'recebida', 'conteudo', 'oi', 'origem', 'instagram')) as _x \\gset"
    else
      echo "select public.mensagem_registrar($EMP, $CANAL, 'corrida-$RUN-reg-mid-$i',
            jsonb_build_object('identidade', 'corrida-$RUN-reg-$i', 'nome', 'corrida $i', 'direcao', 'recebida',
                               'conteudo', 'oi', 'origem', 'instagram')) as _x \\gset"
    fi
  done > "$DIR/$caminho-$lado.sql"
}

for c in edge registrar; do
  gerar "$c" a; gerar "$c" b
  base=$("$PSQL" "$CONN" -X -A -t -c "select now() + interval '3 seconds'" | tr -d '\r')
  for l in a b; do
    ( "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=0 -v base="$base" -c "set role service_role" -f "$DIR/$c-$l.sql" > "$DIR/$c-$l.out" 2>&1 ) &
  done
  wait
done

"$PSQL" "$CONN" -X -A -F ' | ' <<SQL
with r as (
  select c as caminho, i, case c when 'edge' then 'corrida-$RUN-edge-' || i else 'corrida-$RUN-reg-' || i end as ident,
         case c when 'edge' then 'corrida-$RUN-edge-mid-' || i else 'corrida-$RUN-reg-mid-' || i end as mid
    from unnest(array['edge', 'registrar']) c, generate_series(1, $N) i
), x as (
  select r.caminho, r.i,
    (select count(*) from contatos where empresa_id = $EMP and origem_id = r.ident) as contatos,
    (select count(*) from contato_identidades where empresa_id = $EMP and external_id = r.ident) as identidades,
    (select count(*) from negocios n join contatos k on k.id = n.contato_id
      where k.empresa_id = $EMP and k.origem_id = r.ident and n.status = 'aberto') as negocios,
    (select count(*) from mensagens where external_id = r.mid) as mensagens,
    (select count(*) from negocios n join contatos k on k.id = n.contato_id
      where k.origem_id = r.ident and n.dados -> '_lead' ->> 'origem' = 'instagram') as neg_com_origem
  from r
)
select caminho, count(*) as rodadas,
       count(*) filter (where contatos = 1 and identidades = 1 and negocios = 1 and mensagens = 1) as certas,
       count(*) filter (where contatos > 1) as contato_duplicado,
       count(*) filter (where negocios > 1) as negocio_duplicado,
       count(*) filter (where mensagens <> 1) as mensagem_errada,
       count(*) filter (where neg_com_origem = negocios and negocios > 0) as negocio_com_origem
  from x group by caminho order by caminho;
SQL

echo "erros nas conexões:"; grep -h -i "error\|erro" "$DIR"/*.out | sort | uniq -c | head -5

# O DESCARTE DA EDGE: webhook_mid_novo chamado pelas duas conexões no mesmo instante, com o
# mesmo mid — exatamente uma das duas tem de receber TRUE (processar) em cada rodada.
for l in a b; do
  for i in $(seq 1 "$N"); do
    echo "select pg_sleep_until(:'base'::timestamptz + interval '200 milliseconds' * $i) as _x \\gset"
    echo "select '$i:' || public.webhook_mid_novo('corrida-$RUN-mid-$i', null) as r \\gset"
    echo "\\echo :r"
  done > "$DIR/mid-$l.sql"
done
base=$("$PSQL" "$CONN" -X -A -t -c "select now() + interval '3 seconds'" | tr -d '\r')
for l in a b; do
  ( "$PSQL" "$CONN" -X -q -v base="$base" -c "set role service_role" -f "$DIR/mid-$l.sql" > "$DIR/mid-$l.res" 2>&1 ) &
done
wait
cat "$DIR"/mid-a.res "$DIR"/mid-b.res | tr -d '\r' | grep -E '^[0-9]+:(true|false)$' | sort -t: -k1,1n | \
  awk -F: '{t[$1]+=($2=="true"); n[$1]++} END {ok=0; for (k in n) if (n[k]==2 && t[k]==1) ok++; printf "mid        | rodadas %d | exatamente uma entrega processada: %d\n", length(n), ok}'
"$PSQL" "$CONN" -X -q -c "delete from ops.webhook_recebidos where hash like 'mid:corrida-$RUN-%'"

# MANTER=1 deixa os dados (para montar pares gêmeos e testar a fusão); o prefixo sai no fim.
if [ "${MANTER:-0}" = 1 ]; then echo "dados mantidos: origem_id like 'corrida-$RUN-%'"; rm -rf "$DIR"; exit 0; fi

# limpeza: mensagens, conversas, negócios, identidades e contatos de teste
"$PSQL" "$CONN" -X -q <<SQL
begin;
delete from mensagens where external_id like 'corrida-$RUN-%';
delete from conversas where contato_id in (select id from contatos where origem_id like 'corrida-$RUN-%');
delete from negocios where contato_id in (select id from contatos where origem_id like 'corrida-$RUN-%');
delete from contato_identidades where external_id like 'corrida-$RUN-%';
delete from contatos where origem_id like 'corrida-$RUN-%';
commit;
SQL
rm -rf "$DIR"

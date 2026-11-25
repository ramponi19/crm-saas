#!/usr/bin/env bash
# BANCO LOCAL DESCARTÁVEL — o passo 1 e 2 do ritual de deploy (docs/design-pos-venda.md §8.6.1).
#
#   bash scripts/teste-local.sh            # sobe, semeia, testa e desmonta
#   MANTER=1 bash scripts/teste-local.sh   # não desmonta no fim (para npm run dev contra ele)
#
# 1. Sobe um Supabase local NOVO (projeto "teste-local", portas 561xx), aplicando as migrações DESTA
#    branch do zero. Não toca no banco local do Lucas (projeto guiuzbcqkvelqcuogxtd, portas 543xx),
#    que fica parado como está.
# 2. Semente SÓ fictícia: supabase/scripts/teste-local/semente.sql + a demonstração
#    (supabase/scripts/demo/preview-demonstracao.sql).
# 3. Roda cada supabase/scripts/testes/teste-*.sql e compara com o esperado
#    (supabase/scripts/teste-local/esperado/<nome>.json: cada chave do esperado tem de aparecer igual).
# 4. Roda npm run test:local (tests/integracao: rotas e RPCs gravando de verdade no banco local).
# 5. Desmonta (stop --no-backup: o volume some) e apaga a pasta temporária, dê certo ou não.
#
# Docker no ar e IDE fechado (memória "máquina: memória e Docker"). Só fala com 127.0.0.1.
set -uo pipefail
cd "$(dirname "$0")/.."
RAIZ=$(pwd)
B=${PG_BIN:-/c/Ferramentas/pgsql-18.4/bin}
# Projeto e portas: o padrão é o de sempre (teste-local, 561xx/5632x). Sessões paralelas usam os seus
# (regra de isolamento, .claude/sessoes-locais.json): TESTE_LOCAL_PROJETO=etapa-1-1 TESTE_LOCAL_PREFIXO=573
PROJETO=${TESTE_LOCAL_PROJETO:-teste-local}
PREFIXO=${TESTE_LOCAL_PREFIXO:-563}
PORTA_DB=${PREFIXO}22; PORTA_API=${PREFIXO}21; PORTA_SHADOW=${PREFIXO}20
L="host=127.0.0.1 port=$PORTA_DB dbname=postgres user=postgres password=postgres"
case "$L" in *127.0.0.1*) ;; *) echo "RECUSADO: não é o banco local"; exit 1;; esac
export PGCLIENTENCODING=UTF8
# Marca explícita de exceção do gatilho negocios_venda_exigida (20261124000900): a semente, a demonstração e
# os testes gravam ganho direto, como script. O teste-venda-exigida.sql a desliga para provar a recusa.
export PGOPTIONS="-c nexus.venda_excecao=teste-local"

docker info >/dev/null 2>&1 || { echo "Docker parado: abra o Docker Desktop (com o IDE fechado) e rode de novo."; exit 1; }

TMP=$(mktemp -d)
desmontar() {
  if [ "${MANTER:-0}" = "1" ]; then echo ">>> MANTER=1: banco local em http://127.0.0.1:$PORTA_API (pasta $TMP). Para desmontar: npx supabase stop --no-backup --workdir \"$TMP\""; return; fi
  echo ">>> Desmontando o banco local descartável"
  npx supabase stop --no-backup --workdir "$TMP" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap desmontar EXIT

mkdir -p "$TMP/supabase"
cp -r supabase/migrations "$TMP/supabase/"
cat > "$TMP/supabase/config.toml" <<EOF
project_id = "$PROJETO"
[api]
port = $PORTA_API
[db]
port = $PORTA_DB
shadow_port = $PORTA_SHADOW
major_version = 17
[studio]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
EOF

echo ">>> 1. Subindo o Supabase local descartável com as migrações da branch ($(ls supabase/migrations | wc -l) arquivos)"
if ! npx supabase start --workdir "$TMP" -x studio,imgproxy,logflare,vector,edge-runtime,mailpit,realtime,storage-api,postgres-meta,supavisor > "$TMP/start.log" 2>&1; then
  grep -E "ERROR|Error|rror" "$TMP/start.log" | head -5; echo "FALHOU ao aplicar as migrações"; exit 1
fi
SERVICE=$(grep -oE '"SERVICE_ROLE_KEY":"[^"]+"' "$TMP/start.log" | cut -d'"' -f4)
ANON=$(grep -oE '"ANON_KEY":"[^"]+"' "$TMP/start.log" | cut -d'"' -f4)

echo ">>> 2. Semente fictícia"
"$B/psql" "$L" -q -v ON_ERROR_STOP=1 -f supabase/scripts/teste-local/semente.sql >/dev/null || { echo "FALHOU a semente"; exit 1; }
"$B/psql" "$L" -q -v ON_ERROR_STOP=1 -f supabase/scripts/demo/preview-demonstracao.sql >/dev/null || { echo "FALHOU a demonstração"; exit 1; }

FALHAS=0
echo ">>> 3. Testes das migrações (supabase/scripts/testes)"
for t in supabase/scripts/testes/teste-*.sql; do
  nome=$(basename "$t" .sql)
  saida=$("$B/psql" "$L" -q -1 -f "$t" 2>&1 | tr -d '\r')
  json=$(printf '%s' "$saida" | grep -oE 'RESULTADO[A-Z0-9_]* .*' | head -1 | sed -E 's/^RESULTADO[A-Z0-9_]* //')
  if [ -z "$json" ]; then echo "  FALHOU $nome (sem RESULTADO): $(printf '%s' "$saida" | grep -E 'ERROR' | head -1)"; FALHAS=$((FALHAS+1)); continue; fi
  esperado="supabase/scripts/teste-local/esperado/$nome.json"
  if [ ! -f "$esperado" ]; then echo "  SEM ESPERADO $nome — resultado: $json"; FALHAS=$((FALHAS+1)); continue; fi
  if node scripts/teste-local-comparar.mjs "$esperado" "$json"; then echo "  ok $nome"; else FALHAS=$((FALHAS+1)); fi
done

echo ">>> 4. npm run test:local"
TESTE_LOCAL_URL="http://127.0.0.1:$PORTA_API" TESTE_LOCAL_ANON="$ANON" TESTE_LOCAL_SERVICE="$SERVICE" TESTE_LOCAL_DB="$L" \
  npm run -s test:local || FALHAS=$((FALHAS+1))

if [ "$FALHAS" -gt 0 ]; then echo ">>> RESULTADO: $FALHAS etapa(s) com falha — NÃO seguir para a produção"; exit 1; fi
echo ">>> RESULTADO: tudo verde — pode seguir para a produção (passo 3 do ritual)"

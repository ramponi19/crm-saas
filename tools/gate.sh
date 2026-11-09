#!/usr/bin/env bash
# Gate antes de todo commit/deploy: check (tipos, travas, Edge), testes, verificador de auditoria e build.
#   bash tools/gate.sh
# Saídas completas em .gate/ (fora do git). O build usa o Supabase LOCAL como URL pública, para nunca
# embutir a produção num build de teste.
set -u -o pipefail
cd "$(dirname "$0")/.." || exit 1
L=.gate; mkdir -p "$L"
falha=0; t0=$(date +%s)
rm -rf .next/types
npm run check > "$L/check.txt" 2>&1 && echo "check ok" || { echo "CHECK FALHOU"; tail -6 "$L/check.txt"; falha=1; }
npm test > "$L/test.txt" 2>&1 && echo "testes $(grep -E '^ℹ pass' "$L/test.txt")" || { echo "TESTES FALHARAM"; grep -E "not ok|✖" "$L/test.txt" | head; falha=1; }
echo "verificador: $(bash scripts/verificar-auditoria.sh 2>&1 | tail -1)"
git checkout -q -- scripts/segmento-excecoes.json 2>/dev/null
if [ "$falha" = 0 ]; then
  rm -rf .next
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npm run build > "$L/build.txt" 2>&1 && echo "build ok" || { echo "BUILD FALHOU"; grep -E -i "error|failed" "$L/build.txt" | head -8; falha=1; }
fi
echo "gate: $(( $(date +%s) - t0 ))s"
exit $falha

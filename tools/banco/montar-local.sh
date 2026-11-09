#!/usr/bin/env bash
# Supabase LOCAL do zero, igual à produção, a partir do DUMP ÚNICO (tools/banco/dump-unico.ps1).
#
#   bash tools/banco/montar-local.sh                         # usa o .7z mais novo em dumps/*-unico/
#   bash tools/banco/montar-local.sh dumps/2026-11-09-unico  # idem, numa pasta escolhida
#
# 1. estrutura: `supabase db reset` com TODAS as migrações do repositório;
# 2. dados: public (projeto.dump), auth.users/identities e storage (auth-storage-dados.dump),
#    restaurados só como dados, com os gatilhos desligados;
# 3. senha SÓ LOCAL nos usuários de teste (os e-mails de tests/e2e/usuarios.local.json, fora do git);
# 4. contagens das tabelas principais, para comparar com a produção.
#
# O .7z é aberto numa pasta temporária (o 7-Zip pede a senha do arquivo, que só o Lucas sabe) e a
# pasta é apagada no fim, dê certo ou não. Se a pasta do dump tiver _claro/ (logo depois do dump),
# usa ela direto. Só fala com 127.0.0.1; o linked-project.json (que aponta para a PRODUÇÃO) sai do
# lugar durante o reset e volta no fim.
#
# Docker precisa estar no ar e o Supabase local de pé (npx supabase start). Pouca memória: rodar
# com o IDE fechado (memória "máquina: memória e Docker").
set -euo pipefail
cd "$(dirname "$0")/../.."
B=/c/Ferramentas/pgsql-18.4/bin; export PGCLIENTENCODING=UTF8
L="host=127.0.0.1 port=54322 dbname=postgres user=supabase_admin password=postgres"
case "$L" in *127.0.0.1*) ;; *) echo "RECUSADO: não é o banco local"; exit 1;; esac

PASTA="${1:-$(ls -d dumps/*-unico 2>/dev/null | sort | tail -1)}"
[ -n "$PASTA" ] && [ -d "$PASTA" ] || { echo "Nenhuma pasta dumps/*-unico encontrada."; exit 1; }
TMP=""
limpar() {
  [ -n "$TMP" ] && rm -rf "$TMP"
  [ -f supabase/.temp/linked-project.json.montar ] && mv supabase/.temp/linked-project.json.montar supabase/.temp/linked-project.json
  return 0
}
trap limpar EXIT
if [ -d "$PASTA/_claro" ]; then
  D="$PASTA/_claro"
else
  A=$(ls "$PASTA"/*.7z | tail -1)
  TMP=$(mktemp -d); D="$TMP"
  echo ">>> Abrindo $A (digite a senha do arquivo)"
  7z x -o"$(cygpath -w "$TMP")" "$(cygpath -w "$A")" > /dev/null
fi
for f in projeto.dump auth-storage-dados.dump; do [ -f "$D/$f" ] || { echo "Falta $f em $PASTA"; exit 1; }; done

[ -f supabase/.temp/linked-project.json ] && mv supabase/.temp/linked-project.json supabase/.temp/linked-project.json.montar
npx supabase db reset 2>&1 | grep -v -i -E "key|secret|jwt|token" | tail -2

# As migrações semeiam algumas tabelas (presets, módulos): os dados da produção substituem tudo.
$B/psql.exe "$L" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ declare t text; begin select string_agg(format('%I.%I', schemaname, tablename), ', ') into t from pg_tables where schemaname = 'public'; execute 'truncate ' || t || ' restart identity cascade'; end \$\$" && echo "public zerado"
$B/pg_restore.exe -d "$L" --data-only --disable-triggers --no-owner --exit-on-error -n public "$D/projeto.dump" && echo "public restaurado"
$B/pg_restore.exe -d "$L" --data-only --disable-triggers --no-owner --exit-on-error -t users -t identities -n auth "$D/auth-storage-dados.dump" && echo "auth restaurado"
$B/pg_restore.exe -d "$L" --data-only --disable-triggers --no-owner --exit-on-error -t buckets -t objects -n storage "$D/auth-storage-dados.dump" 2>/dev/null \
  || { $B/psql.exe "$L" -X -q -c "truncate storage.objects, storage.buckets cascade"; \
       $B/pg_restore.exe -d "$L" --data-only --disable-triggers --no-owner --exit-on-error -t buckets -t objects -n storage "$D/auth-storage-dados.dump"; }
echo "storage restaurado (só metadados; os arquivos não vêm no dump)"

# Sequências: o restore de dados traz os SEQUENCE SET do public; confere por segurança.
$B/psql.exe "$L" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ declare r record; m bigint; begin
  for r in select s.relname seq, t.relname tab, a.attname col from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a','i')
           join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
           join pg_namespace n on n.oid = s.relnamespace where s.relkind = 'S' and n.nspname = 'public' loop
    execute format('select max(%I) from public.%I', r.col, r.tab) into m;
    if m is not null then perform setval(format('public.%I', r.seq), greatest(m, (select last_value from pg_sequences where schemaname='public' and sequencename=r.seq))); end if;
  end loop; end \$\$"

U=tests/e2e/usuarios.local.json
if [ -f "$U" ]; then
  LISTA=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).map(u=>`'"'"'${u.email.replace(/'"'"'/g,"")}'"'"'`).join(","))' "$U")
  [ -n "$LISTA" ] && $B/psql.exe "$L" -X -q -v ON_ERROR_STOP=1 -c "update auth.users set encrypted_password = extensions.crypt('teste-local-22', extensions.gen_salt('bf')) where email in ($LISTA)" && echo "senha local nos usuários de teste"
else
  echo "sem $U: senha local não gravada (ver tests/e2e/LEIA-ME.md)"
fi

$B/psql.exe "$L" -X -A -t -c "select 'empresas=' || (select count(*) from public.empresas) || ' contatos=' || (select count(*) from public.contatos) || ' negocios=' || (select count(*) from public.negocios) || ' conversas=' || (select count(*) from public.conversas) || ' mensagens=' || (select count(*) from public.mensagens) || ' eventos=' || (select count(*) from public.eventos) || ' auth.users=' || (select count(*) from auth.users) || ' storage.objects=' || (select count(*) from storage.objects)"

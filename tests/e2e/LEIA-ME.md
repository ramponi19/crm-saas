# Testes ponta a ponta (locais)

Rodam contra o app LOCAL (`http://localhost:3010`) e o Supabase LOCAL (Postgres em 127.0.0.1:54322). Nunca contra a produção. Cada script cria o próprio cenário no banco local, confere e desfaz o que criou. A saída é `ok`/`FALHA` linha a linha, com o resumo no fim.

## Preparar (uma vez)

1. `npm install` dentro de `tests/e2e/` (só o `playwright-core`; usa o Microsoft Edge da máquina).
2. `usuarios.local.json`: copie `usuarios.example.json` e troque os e-mails pelos dos usuários de teste (dono, vendedor de Mogi, vendedor de Jaguariúna e superadmin). Fica fora do git porque são pessoas reais.
3. Banco local com os dados da produção: `bash tools/banco/montar-local.sh` (grava a senha só local `teste-local-22` nesses usuários).
4. `npx supabase status -o env > tests/e2e/status.local.env` (chaves do Supabase LOCAL, fora do git).
5. App local: `bash tools/rebuild-local.sh`.

## Rodar

```bash
node tests/e2e/quadro-cliente-e2e.mjs
```

Os que recebem arquivos de entrada dizem o uso na primeira linha (`inbox-e2e`, `card-e2e`, `quadro-e2e`, `perda-e2e` leem o `usuarios.local.json` passado como argumento). Variável `DB_PORT` troca a porta do Postgres local quando a 54322 está presa.

## O que cada um cobre

- **Quadro e card:** `quadro-cliente-e2e` (ordem pela última mensagem do cliente, "cliente há X · você respondeu há Y", carregar mais sem repetir), `quadro-e2e`, `card-e2e`, `perda-e2e`, `ganho-em-e2e`.
- **Contatos:** `busca-contato-e2e`, `fusao-juncao-e2e`, `fusao-fechado-e2e`, `cpf-e2e`.
- **Inbox e notas:** `inbox-e2e`, `notas-e2e`, `aguardando-mede.mjs` (mede o tempo de "aguardando resposta").
- **Gravação conferida:** `gravacao-a-e2e`, `gravacao-bcd-e2e`.
- **Módulos e automações:** `dependencias-e2e`, `automatize-e2e`, `automatize-slug-e2e`, `pdv-e2e`.
- **Telas que liam as views antigas:** `views-lote1` a `views-lote8`, `views-lote8-imob`, `views-ultimo-lote`, `lote1` a `lote3`.

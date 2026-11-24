# Deploy do hotfix "entregar sem pagamento" (com H1, H2 e H3)

Branch `fix/entregar-sem-pagamento`, preparada em 24/11/2026. **Executar com a loja fechada.** Nada daqui foi feito na produção. Quem executa cada passo na produção é o Lucas, ou o Claude com o ok dele, passo a passo.

## O que sobe

**Migração `20261125000100_concluir_encomenda.sql`** (antes `20261119000100`; renumerada para depois da última aplicada):
- colunas `vendas_vendas.concluida_em / concluida_por / concluida_via`;
- funções `concluir_encomenda`, `concluir_venda_pdv`, `encomenda_saldo` e `vendas_moeda`;
- gatilho `vendas_conclusao_guarda`: o navegador não grava `concluida`/`pendente_entrega` direto;
- **H1:** a conclusão não sobrescreve mais `data_venda`; a data da conclusão fica em `concluida_em`;
- **H2:** gatilho `vendas_valor_guarda`. Venda concluída não muda `valor_venda`/`valor_custo`/`desconto_valor`, nem pelo navegador nem por rota do servidor. Script de operação passa só com `set_config('nexus.venda_valor_ajuste', '<motivo>', true)`;
- **H3:** no mesmo gatilho, pelo navegador, preço e custo só se ajustam em venda com status `encomenda`.

**App:**
- Histórico → "Finalizar" abre o recebimento e conclui pela função;
- o PDV trava com "Falta R$ X" e conclui pela função;
- na lista de encomendas, o lápis de ajuste só aparece em encomenda (H3);
- a comissão de hoje (Equipe e Configurações → Usuários) conta no mês da **conclusão**, `coalesce(concluida_em, data_venda)` (H1).

**Ordem obrigatória: migração primeiro, app logo em seguida.**
- Com o app antigo e a migração nova, o PDV antigo grava a venda direto como `concluida` e é barrado. Por isso a loja tem de estar fechada no intervalo.
- Com o app novo e sem a migração, o PDV chama funções que não existem.

## Testes feitos em 24/11 (local, pilha isolada `hotfix-entregar`, portas 573xx)

**Banco:**
- 114 migrações aplicadas do zero, iguais às da produção até a `2200`: a branch + as `posvenda` 0200–2100 da `feat/pos-venda`, que já estão na produção. A `2300 posvenda_revisao`, aplicada depois, não toca em vendas.
- Semente fictícia.

| Teste | Resultado |
|---|---|
| `tests/banco/prova-concluir-encomenda.sql` | **28/28 OK** (18 antigos + 10 novos de H1/H2/H3) |
| `npm test` (unitários) | **581/581**, com 7 novos de H1 e H3 |
| `npm run check` (núcleo, avisos, views, segmento, módulos, gravação, datas, edge) | verde |
| `npm run type-check` | verde (depois do build, que regenera o `.next/types` antigo da spike da Niimbot) |
| `npm run build` | verde (217 páginas) |
| e2e `tests/e2e/entregar-pagamento-e2e.mjs` (Histórico → Finalizar; PDV com falta; H1; H3), app local na 3010 contra a pilha isolada | **16/16 ok**, limpeza conferida |

A prova do banco foi repetida (28/28) depois de outra sessão ter reiniciado o Docker no meio do trabalho. A pilha voltou com os volumes intactos.

**Não rodados (não são regressão deste hotfix):**
- As outras quatro `tests/banco/prova-*.sql` são provas de ida e volta de migrações antigas e exigem o banco com os dados da JM. O dump disponível (09/11) é anterior à renomeação de tabelas de 17/11 e não restaura no esquema atual.
- Os `supabase/scripts/testes/teste-*.sql` do pós-venda: a `main` só traz o resultado esperado do `teste-posvenda-universal`, que passou.

## Pré-checagens feitas em 24/11 (produção, só leitura)

- **Migrações aplicadas:** até `20261124205812 posvenda_rotina_diaria`. Nada do hotfix (colunas, funções e gatilhos ausentes). Gatilhos atuais em `vendas_vendas`: `vendas_preencher_filial`, `zapintel_vendas_ao_vivo`.
- **Mudanças desde a última verificação**, todas da sessão do pós-venda (encerradas às ~21h25 UTC; janela entregue a esta operação):
  - `main` foi a `da8c9108` (pós-venda universal, revisão e rotina diária; deploy `dpl_Fr5imQFnqBJj1PvtB84HUCuqMAJr` READY);
  - banco ganhou `posvenda_universal` (19:33 UTC), `posvenda_revisao` (20:10 UTC) e `posvenda_rotina_diaria` (20:58 UTC, com o job pg_cron `posvenda-rotina-diaria`);
  - dados da JM: triagem dos 42 negócios da etapa Pós Venda, responsáveis de 141 ganhos, módulo Pós-venda instalado e 3 réguas desativadas, com backups `_backup_triagem_posvenda_20261124` e `_backup_responsaveis_posvenda_20261124`.

  Nenhuma toca em `vendas_*` ou `estoque_*`.
- **Vendas da JM:** 122 concluídas e **8 encomendas pendentes**, nenhuma `pendente_entrega` ou `em_fechamento`. Das 8:
  - 7 foram lançadas antes de novembro (14/08 a 20/10);
  - 4 estão sem nenhum pagamento (vendas 31, 43, 54 e 92), e a 37 vale R$ 7,60.

  Depois do hotfix, só se entregam com o saldo pago.
- **Última venda gravada:** 24/11 17:45 UTC.

## Passo a passo (loja fechada)

### 0. Antes de começar

1. **Ninguém mexendo:**
   - `git fetch` e confirmar que `origin/main` é `da8c9108`. Se mudou, voltar ao Claude para remesclar antes de seguir.
   - Repetir `list_migrations`: a última tem de ser `posvenda_rotina_diaria`.
   - No `.claude/sessoes-locais.json`, nenhuma outra sessão com deploy marcado.
2. **IOwait** (regra do projeto), numa chamada separada, no repositório principal: `SEG=65 node .gate/iowait-metricas.mjs`. Seguir só com o número abaixo de **10%**.
3. Anotar o deploy atual de produção (**ponto de volta do app**): `dpl_Fr5imQFnqBJj1PvtB84HUCuqMAJr` (`da8c9108`).

### 1. Backup

1. **Supabase → Database → Backups:** confirmar que existe o backup diário de hoje, ou o PITR ligado. Anotar o horário.
2. **Cópia das tabelas no próprio banco** (SQL Editor, ou o Claude pela MCP com o ok):

```sql
create table public._backup_hotfix_vendas_20261125     as select * from public.vendas_vendas;
create table public._backup_hotfix_pagamentos_20261125 as select * from public.vendas_pagamentos;
create table public._backup_hotfix_unidades_20261125   as select id, empresa_id, status, preco_venda, preco_custo from public.estoque_unidades;
alter table public._backup_hotfix_vendas_20261125     enable row level security;
alter table public._backup_hotfix_pagamentos_20261125 enable row level security;
alter table public._backup_hotfix_unidades_20261125   enable row level security;
revoke all on public._backup_hotfix_vendas_20261125, public._backup_hotfix_pagamentos_20261125, public._backup_hotfix_unidades_20261125 from anon, authenticated;
```

3. **Impressão digital "antes"** (guardar o resultado):

```sql
select (select count(*) from vendas_vendas) vendas,
       (select sum(valor_venda) from vendas_vendas) soma_venda,
       (select sum(coalesce(valor_custo,0)) from vendas_vendas) soma_custo,
       (select md5(string_agg(id||'|'||coalesce(status,'')||'|'||valor_venda||'|'||coalesce(valor_custo,0)||'|'||coalesce(data_venda::text,''), ',' order by id)) from vendas_vendas) digital,
       (select count(*)||'|'||sum(valor_pago) from vendas_pagamentos) pagamentos;
```

### 2. Migração

1. Aplicar `supabase/migrations/20261125000100_concluir_encomenda.sql` pela MCP `apply_migration` (nome `concluir_encomenda`), **nunca** `db push`.
2. **Conferir:**
   - as funções `concluir_encomenda`, `concluir_venda_pdv`, `encomenda_saldo`, `vendas_moeda`, `vendas_conclusao_guarda`, `vendas_valor_guarda` existem;
   - os gatilhos `vendas_conclusao_guarda` e `vendas_valor_guarda` estão em `vendas_vendas`;
   - as colunas `concluida_*` existem;
   - a **impressão digital é igual à de "antes"** (a migração não altera nenhuma venda).

### 3. App

1. IOwait abaixo de **20%** (chamada separada).
2. Publicar: `git fetch`; se `origin/main` ainda é `da8c9108`, enviar `fix/entregar-sem-pagamento` para `main` (avanço direto: a branch já contém a `main`). Autor dos commits: Lucas.
3. Esperar o deploy novo ficar **READY** na Vercel. Não confiar no alias logo depois do push: ele serve o build anterior até o novo terminar.

### 4. Conferências depois do deploy

1. Impressão digital igual à de "antes", mais as colunas novas, nulas em todas as vendas antigas: `select count(*) from vendas_vendas where concluida_em is not null` → **0**.
2. **Smoke** com a conta do Lucas, em aba isolada, na **Nexus Demonstração** (empresa 5), nunca na JM:
   - PDV: uma peça de teste com pagamento menor que o total mostra "Falta R$ X" e trava; com o total, conclui;
   - Histórico: "Finalizar" de uma encomenda de teste abre o recebimento com total, já pago e saldo;
   - lista de encomendas: o lápis aparece só na encomenda.

   Ao fim, apagar os dados de teste (o Claude prepara o SQL de limpeza com os ids) e sair da empresa.
3. Na JM, só leitura: abrir PDV, Histórico e Equipe e conferir que carregam sem erro.
4. Logs da Vercel (erros de execução) e do banco nos primeiros 15 minutos.

### 5. Se algo der errado (volta)

1. **App primeiro:** na Vercel, promover de volta o `dpl_Fr5imQFnqBJj1PvtB84HUCuqMAJr` (Instant Rollback).
2. **Depois o banco:** rodar `supabase/scripts/volta/volta-concluir-encomenda.sql`. Ele remove os dois gatilhos e as quatro funções e **mantém** as colunas `concluida_*`, que são registro de quem concluiu.
3. Conferir se ficou venda em `em_fechamento` (aba fechada no meio de um fechamento):
   `select id, grupo_pdv, valor_venda, created_at from vendas_vendas where status = 'em_fechamento';`
   Ela aparece no Histórico e precisa de decisão manual.
4. **Último recurso:** as tabelas `_backup_hotfix_*_20261125` e o backup diário da Supabase.

### 6. Aviso à equipe (para mandar à noite, valendo na manhã seguinte)

> Bom dia, pessoal! Atualizamos o sistema de vendas à noite. **Antes da primeira venda, fechem e abram de novo todas as abas do Nexus** (ou Ctrl+F5 em cada uma), no computador e no celular. O que mudou:
> - a encomenda só é entregue com o saldo pago: o "Finalizar" do Histórico agora abre o recebimento;
> - **encomenda sem pagamento registrado só pode ser entregue depois de registrar o pagamento no sistema.** Se o cliente já pagou por fora (Pix, cartão, dinheiro), registrem esse pagamento no recebimento **antes** de entregar;
> - a venda de balcão só fecha com o pagamento completo (aparece "Falta R$ X" até fechar);
> - o ajuste de valor e custo na lista de encomendas só aparece em encomenda; venda já fechada não muda de valor.
>
> Qualquer erro, me mandem um print na hora.

## Depois do hotfix

- Anotar o deploy novo e o de volta no `estado-atual`.
- Tirar a reserva do número `20261125000100` do `.claude/sessoes-locais.json`.
- **Mudança pequena logo depois do deploy** (decidida em 24/11; branch nova a partir da `main`, com testes): o **painel e os relatórios** passam a contar a venda pelo mês da **conclusão**, `coalesce(concluida_em, data_venda)`, igual à comissão, com as encomendas em aberto mostradas à parte. Leitores conhecidos que filtram por `data_venda`:
  - `lib/painel/metricas.ts`;
  - `app/(dashboard)/financeiro/page.tsx`;
  - `app/(dashboard)/(gestao)/visao-geral/page.tsx`;
  - `app/(dashboard)/metas/page.tsx`;
  - `lib/ranking.ts`;
  - `lib/assistente/ferramentas.ts`;
  - relatórios.

  Usar `lib/vendas-mes.ts`. Fica de fora a mediana de preço do PDV, que é referência de preço, não período.
- **Pendência:** `tools/rebuild-local.sh` fecha o Docker Desktop e roda `wsl --shutdown`, o que derruba a pilha de outra sessão. Corrigir depois do deploy: desligar só a própria pilha e não fechar Docker/WSL com outra pilha de pé (regra `isolamento-sessoes-locais`).
- A branch `docs/roteiro-reconstrucao` precisa de rebase sobre a `main` nova. Os documentos do PDV existem nas duas: ao rebasear, os commits copiados da branch do hotfix somem, e o da revisão 3 se aplica por cima.

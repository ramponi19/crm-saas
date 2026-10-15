# Publicação — ZapIntel e segurança do CRM (15/10/2026)

Nada abaixo foi executado. Cada passo espera autorização explícita do Lucas.
Ensaio completo (00 → 02 → 01 → 03 → 04, os arquivos exatos) rodado em 15/10
numa transação aberta com `begin;` e abortada no fim — **conferido depois que
nada ficou gravado**.

## Já em produção

| O quê | Estado |
|---|---|
| Código `74139b3` (auditoria + fechamento) | Vercel READY, sem erro de runtime |
| `supabase/funcoes/seguranca_20261015.sql` (backups fora da API, FK, índice, turnos, canal ao vivo, RLS de leads/lead_mensagens, view de órfãos sem anônimo) | aplicado |
| **00 instantâneo** (autorizado 15/10) | aplicado — `backup.politicas_pre_20261015` 136 regras, `backup.permissoes_funcoes_pre_20261015` 53 funções, `backup.funcoes_zapintel_pre_20261015` 3 definições; não exposto na API |
| **02 contratos** (autorizado 15/10) | aplicado — listagem: dono/admin/vendedores JM 61, Imobiliária 0, Preview · Loja 0 (antes 61, conferido pela API real com a sessão dela); exclusão de fundo da JM pela Preview: nada apagado; URL pública 200. Assinaturas das demais regras, permissões e funções idênticas às de antes |

## Backup e recuperação

- **Backup do Supabase:** não verificável daqui (painel → Database → Backups). Tratar como inexistente até conferir.
- **Passo 00** guarda, no schema `backup` (fora da API), todas as políticas de `public` e `storage`, as permissões de EXECUTE de todas as funções e o código das 3 funções que a 01 altera. Só cria tabelas.
- **Cada migração tem `.volta.sql`**, provado em transação desfeita. A 03 guarda as próprias 96 definições em `backup.rls_politicas_20261015`.
- **Código:** Vercel → Deployments → "Promote" no deploy anterior (`74139b3`).

## Ordem e checklist

| # | Operação (exata) | O que altera | Resultado esperado | Se falhar / reverter |
|---|---|---|---|---|
| ~~00~~ ✔ | `supabase/pendentes/00_instantaneo.sql` | cria 3 tabelas em `backup` | 136 políticas, 53 funções, 3 definições guardadas | nada a reverter; não muda o que está em uso |
| ~~02~~ ✔ | `supabase/pendentes/02_contratos_bucket.sql` | 3 políticas de `storage.objects` (bucket contratos) | conta da Preview · Loja: listar `contratos/1` = **0** (hoje 61); dono JM = 61; URL pública do fundo = 200 | `02_contratos_bucket.volta.sql` |
| 01 | `supabase/pendentes/01_sem_resposta_do_cliente.sql` | 3 funções do ZapIntel | rodapé do dashboard: "N sem análise · 55 sem resposta do cliente"; funil com a fatia nova; lista filtrada mostra os 55 | `01_sem_resposta_do_cliente.volta.sql` |
| P | `git -C ".../scratchpad/wt-perfil" push origin entrega-perfil-ia:main` | `components/layout/topbar.tsx` (sino) + docs/SQL/testes | Vercel READY; sino com o total certo (admin JM: 1.109 leads) | Vercel → Promote `74139b3` |
| 03 | `supabase/pendentes/03_rls_uma_vez_por_consulta.sql` | 96 políticas de RLS do CRM | `supabase/testes/zapintel_acesso.sql` "0 falhas"; telas do CRM abrindo normalmente | `03_rls_uma_vez_por_consulta.volta.sql` |
| 04 | `supabase/pendentes/04_funcoes_fora_da_api.sql` | EXECUTE de 10 funções | tarefas, vendas, leads continuam recebendo a loja ao gravar; avisos do linter somem | `04_funcoes_fora_da_api.volta.sql` |

Aplicação: um arquivo por vez (pelo Claude com `apply_migration`, que é
transacional, ou no SQL Editor do Supabase). Conferir o resultado esperado antes
do próximo.

## 03 — riscos, pré-checagens e critério de parada

- **Risco:** maior alcance (CRM inteiro). A semântica é idêntica — as funções são
  `STABLE` e o teste de 15/10 comparou o conteúdo visível de 70 tabelas para 7
  perfis (525 comparações, 0 diferenças) e a gravação entre empresas.
- **Risco operacional:** `ALTER POLICY` trava cada tabela por instantes. O arquivo
  usa `lock_timeout = 5s`: se alguma estiver ocupada, falha **inteira** e nada muda.
- **Pré-checagens embutidas:** para sem mudar nada se não houver exatamente 96
  políticas no padrão antigo ou se o backup já existir.
- **Antes de rodar:** nenhuma consulta longa (`select count(*) from pg_stat_activity
  where state='active' and now()-query_start > interval '5 seconds'` = 0) e horário calmo.
- **Parar e rodar a volta se:** `zapintel_acesso.sql` acusar falha, qualquer tela do
  CRM mostrar erro de permissão ou vazio inesperado, ou erro novo no Sentry/Vercel.

## 04 — riscos, pré-checagens e critério de parada

- **Gatilhos:** sem EXECUTE, o gatilho continua disparando (provado: `tarefas`
  gravada por logado recebeu a loja 3).
- **Funções de loja ao anônimo:** todos os usos no código são com sessão; as 3
  políticas abertas ao anônimo que citam `filiais_visiveis` (`canais_conectados`,
  `cobrancas`) já recusam o anônimo antes (erro em `get_empresa_id`) — testado
  antes/depois: mesmo resultado.
- **Parar e rodar a volta se:** alguma gravação perder a loja, agendamento/cardápio
  público der erro novo, ou o Sentry mostrar "permission denied for function".

## Testes pós-deploy

Automáticos (depois de cada passo): `npm test` (48), `BANCO=1 npm test` (53),
`supabase/testes/zapintel_acesso.sql` (19 ok), `supabase/testes/contratos_e_sino.sql`
(12/12 depois da 02), `bash scripts/verificar-auditoria.sh`.

Com login — `tests/producao/conferir.js`, rodado na janela logada (só lê):

| Conta | Papel do script | Esperado |
|---|---|---|
| Lucas (dono JM) | `dono` | 615 e 1706 = 200, 1204 = 404; funil interno = 422; corpo nulo = 400; contratos/1 = 61 |
| `reviewer.meta@jmstore.app` | `vendedor` | 615 = 200, **1706 = 404**, 1204 = 404 |
| superadmin | `superadmin` | 615/1706 = 200; e na tela /superadmin: "Prever" abre o ZapIntel da empresa, "Sair do preview" volta |
| "Meta" (Preview · Loja) | `sem-zapintel` | 403 nas rotas; contratos/1 = **0** depois da 02 (61 em 15/10, antes) |

Na tela: sino do /dashboard com o total certo; editor de modelo de contrato
sobe imagem; contrato emitido mostra os fundos; excluir um modelo de teste apaga
os fundos dele. IA (análise, sugestão, robô, "Parar") só com a ANTHROPIC_API_KEY.

**Produção só é "validada" depois desses testes com as contas reais.**

## Fora desta publicação

As 75 tabelas do schema `backup` e a view `v_orfaos_chat_midia` ficam intactas
até decisão separada (`docs/BACKUP-INVENTARIO-20261015.md`).

## Observação sobre o bucket de contratos (15/10, depois da 02)

O bucket continua PÚBLICO de propósito (o contrato emitido usa os fundos por URL).
Num bucket público, o Storage entrega o arquivo a quem souber o caminho — tanto em
`/object/public/` quanto em `/object/contratos/` (conferido: 200 para a conta da
Preview · Loja). Isso não é exposição nova: o caminho é um UUID aleatório e, depois
da 02, ninguém de fora consegue mais LISTAR os nomes. Para fechar até a leitura por
caminho, o bucket teria de virar privado e a emissão do contrato passaria a usar
URL assinada (mudança de código em lib/contrato-modelo.ts) — fica como opção.
Exclusão dentro da própria empresa (liberada pela 02) não foi testada com arquivo
real, para não apagar fundo em uso; conferir excluindo um modelo de teste.

# Inventário do schema `backup` — 15/10/2026

75 tabelas, ~5 MB no total. **Nada foi apagado.** O schema não é exposto na API
(anônimo e logado sem `USAGE`), nenhuma view ou chave estrangeira depende delas e
nenhum código da aplicação as lê — só scripts e documentos de limpezas antigas as
citam como "a cópia de segurança do que foi apagado".

Não verifiquei daqui se o projeto tem backup diário do próprio Supabase (painel
→ Database → Backups, exige login). **Até isso ser conferido, estas tabelas são a
única cópia** do que foi apagado nas limpezas.

## Grupo A — dado REAL de cliente apagado em limpezas (preservar com prazo)

| Tabela | Linhas | O que é |
|---|---:|---|
| leads_limpeza_20261009 / msgs_limpeza_20261009 | 275 / 2.648 | leads arquivados de jun–jul apagados de vez (scripts/limpar-leads-arquivados.mjs) |
| leads_casca_20261013 / leads_casca_apagar_20261013 | 521 / 517 | leads "casca" do sync de histórico |
| direcao_invertida_20261013 | 1.073 | mensagens antes da correção da direção (sync) |
| _backup_leads_dup_20261010 / _backup_tarefas_dup_20261010 | 154 / 151 | leads duplicados por filial e suas tarefas (estavam expostos na API até 15/10) |
| leads_sem_msg_20261015 / tarefas_sem_msg_20261015 | 12 / 10 | os 12 leads sem mensagem apagados a pedido em 15/10 |
| eco_midia_20260914 / eco_midia_msgs_20260914 | 819 / 819 | mídia em eco duplicada (storage) |
| story_* (4) / reels_msgs_20260911 | 79+79+44+44+6 / 44 | respostas de story e reels reclassificadas |

**Recomendação: preservar por 30 dias depois de cada limpeza e então apagar**
(até 08/11 as de 09–10/10; até 12/11 as de 13/10; até 14/11 as de 15/10; as de
setembro já passaram do prazo). São dados pessoais de quem deixou de ser lead —
guardar sem prazo é o oposto do que a LGPD pede, e nenhum uso conhecido precisa
deles depois que a limpeza se provou correta.

## Grupo B — instantâneos de configuração antes de mudanças (remover)

| Tabela | Linhas | O que é |
|---|---:|---|
| politicas_20260827 / _20260828 / _20260903 | 112 / 112 / 115 | RLS antes das correções de isolamento — substituídas por migrações versionadas |
| funcoes_impersonacao_20260903 | 4 | funções antes do conserto da impersonação |
| segmentos_config_20260819 / b / _20260821 | 7 / 7 / 7 | configuração de segmentos antes de ajustes |
| funil_imob_20260819 / b, funil_etapas_orfas_20260814 | 8 / 11 / 13 | funis da Imobiliária e etapas órfãs |
| acessos_backup_20260812 / edits_backup_20260812 | 363 / 6 | acessos e edições antes de ajuste de agosto |
| orcamentos_fantasma_20260818 | 31 | orçamentos fantasmas apagados na auditoria de agosto |
| contrato_modelos_20260818 | 1 | modelo de contrato da JM antes dos marcadores `{{loja.*}}` |
| proprietarios_20260821 / tarefas_imovel_id_20260818 | 0 / 0 | **vazias** |

**Recomendação: remover.** As mudanças estão em produção há 1–2 meses e o estado
atual está versionado em `supabase/`. Exceção opcional: `contrato_modelos_20260818`
(1 linha) se você quiser poder voltar ao texto antigo do contrato.

## Grupo C — dado de TESTE de QA (remover)

37 tabelas `teste_*` (18–21/08), de 1 a 35 linhas cada: o que foi criado nas
auditorias com "TESTE AUDITORIA"/"QA TESTE" e apagado dos tenants. Não há dado de
cliente. A memória do projeto descreve como semear de novo **criando** dado de
teste — não restaurando estas tabelas. **Recomendação: remover.**

## Grupo D — retratos de auditoria do storage (remover)

`storage_orfaos_20260911` (1.413) e `storage_orfaos_20261013` (903): listas dos
arquivos órfãos apagados do bucket. Os arquivos já não existem; a lista serve só
como registro. **Recomendação: remover** (ou manter um dos dois como registro).

## A view `public.v_orfaos_chat_midia`

Sem uso no código (a retenção lê `public.storage_orfaos`). Era legível pela chave
anônima até 15/10 — acesso já retirado. **Recomendação: remover a view.**

## Se você autorizar

Apagar é um `drop table backup.<nome>` por tabela — irreversível, então fazer só
com a lista aprovada por grupo e, para o grupo A, só depois do prazo.

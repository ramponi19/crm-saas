# Publicação — ZapIntel e segurança do CRM (15/10/2026)

## O que já está em produção

| O quê | Onde | Estado |
|---|---|---|
| Código até `74139b3` (auditoria + fechamento) | Vercel | **READY** em 15/10, sem erro de runtime |
| Backups `_backup_*_dup_20261010` fora da API, FK da ficha, índice, turnos 5× mais rápido, canal ao vivo | banco | aplicado (supabase/funcoes/seguranca_20261015.sql) |
| RLS de `leads` e `lead_mensagens` com `get_empresa_id()` uma vez por consulta | banco | aplicado |
| `v_orfaos_chat_midia` sem acesso de anônimo | banco | aplicado |

## O que falta — código (próximo push, depois da sua autorização)

- Sino do CRM (`components/layout/topbar.tsx`): lê o contador do lead, escuta só
  mensagens recebidas, recarrega ao reconectar, sem o corte de 1.000 linhas.

## O que falta — banco (só com autorização, NESTA ordem)

Cada arquivo em `supabase/pendentes/` tem o seu `.volta.sql` (volta atrás exato,
provado em transação desfeita em 15/10).

1. `01_sem_resposta_do_cliente.sql` — exige o código `74139b3` no ar (já está).
   Confere o estado das funções antes e para sem mudar nada se não bater.
2. `02_contratos_bucket.sql` — leitura/listagem dos fundos de contrato só para a
   própria empresa; exclusão na própria pasta. A URL pública continua servindo.
3. `03_rls_uma_vez_por_consulta.sql` — 96 políticas; guarda as definições em
   `backup.rls_politicas_20261015` antes de mudar. Maior alcance — aplicar num
   horário calmo e conferir as telas logo depois.
4. `04_funcoes_fora_da_api.sql` — higiene: gatilhos sem EXECUTE e 4 funções de
   loja fechadas ao anônimo.

Como aplicar: SQL Editor do Supabase (ou `apply_migration` pelo Claude), um
arquivo por vez, conferindo o item correspondente da lista abaixo antes do próximo.

## Volta atrás

| Situação | Ação |
|---|---|
| Tela quebrada depois de um SQL pendente | rodar o `.volta.sql` do arquivo |
| Código novo com defeito | Vercel → Deployments → "Promote" no anterior (`56621b8` ou `74139b3`) |
| RLS de leads/mensagens (já aplicada) | `alter policy tenant_isolamento ...` com `get_empresa_id()` sem `select` — texto em supabase/funcoes/seguranca_20261015.sql, item 7 |

## Validação pós-deploy

Automático (rodar depois de cada passo):
- `npm test` — 48 testes (rotas, retenção, teto, prévia)
- `BANCO=1 npm test` — +4 com o banco (contador concorrente, nada exposto)
- `supabase/testes/zapintel_acesso.sql` no SQL Editor — tem de terminar em "0 falhas"
- `bash scripts/verificar-auditoria.sh`

Com login (não dá para automatizar sem a senha):
| Quem | Conferir |
|---|---|
| Dono da JM | dashboard, lista, ficha, Atendimento, Pós-venda; rodapé "N sem análise · N sem resposta do cliente" bate com o robô; sino do topo com o total certo |
| Vendedor (`reviewer.meta@jmstore.app`, só Mogi) | lista só de Mogi; abrir `/zapintel/leads/lead-1706` (Jaguariúna) dá "não encontrado" |
| Conta sem ZapIntel ("Preview · Loja") | tela "não habilitado" e 403 nas rotas — **conferido em produção em 15/10** |
| Superadmin | "Prever" e "Sair do preview" no /superadmin (agora por formulário) |
| Contratos | editor de modelo sobe imagem; contrato emitido mostra os fundos; excluir modelo apaga os fundos |
| IA | só com a ANTHROPIC_API_KEY: "Gerar análise" num lead, "Sugerir mensagem", robô em lote e o "Parar" |

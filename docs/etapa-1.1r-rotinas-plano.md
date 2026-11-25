# Entrega 1.1r: falha de rotina não pode ser silenciosa

25/11/2026. Pedido do Lucas depois do deploy da 1.1a. Entra **antes da 1.1b**. Só acrescenta: nenhuma rotina muda o que faz.

## O problema (medido na produção em 25/11)

| Rotina (pg_cron) | Agenda | Como roda | O que acontece quando falha hoje |
|---|---|---|---|
| `posvenda-rotina-diaria` | `10 * * * *` | função do banco | erro de uma empresa vira `{"erro": ...}` **dentro do resultado**; o job fica `succeeded`; ninguém lê o resultado |
| `liberacao-diaria-esteira` | `5 * * * *` | função do banco (`core_liberar_lotes_do_dia`) | idem |
| `zapintel-conversa-aquecer` | `0 5 * * *` | função por empresa | a primeira empresa que falha derruba todas; o job fica `failed` em `cron.job_run_details`, que ninguém olha |
| `retencao-diaria` | `0 7 * * *` | procedimento `ops.purgar_retencao` | idem (`failed`, ninguém olha) |
| `automacoes-hora` | `17 * * * *` | chama `/api/cron/automacoes` | o pg_cron só registra que **enviou** a chamada; a resposta do app fica em `net._http_response` (apagada em ~6 h) |
| `lgpd-exportacoes-limpar` | `43 * * * *` | `/api/cron/lgpd-limpar` | idem |
| `entrada-parada` | `*/5`, só quando há o que fazer | `/api/cron/entrada-parada` | idem |
| `resgatar-midias` | `*/15`, só com mídia pendente | `/api/cron/resgatar-midias` | idem |
| 6 crons da Vercel (`vercel.json`) | 1x por dia | `/api/cron/<job>` | a Vercel registra o disparo como sucesso mesmo com 401/500 (memória "os crons nunca rodaram") |

E nada avisa quando uma rotina **não roda** (job desligado, pg_cron parado, Vercel sem disparar).

## O que entra

**Banco (migração `<n>_rotinas_execucoes`, só acrescenta):**

| Objeto | Detalhe |
|---|---|
| `rotinas` | catálogo: `nome` (= nome do job), `origem` (`pg_cron`/`vercel`), `agenda` (texto), `intervalo_esperado`, `folga`, `condicional` (só roda quando há o que fazer: não gera atraso por falta de execução), `ativo` |
| `rotinas_execucoes` | `rotina`, `origem` (`sql`, `http`, `cron`), `inicio`, `fim`, `status` (`ok`, `com_erro`, `falhou`), `empresas_total`, `empresas_erro`, `resumo jsonb`, `erro`, `cron_runid` (único), `reconhecida_em/por` |
| `rotinas_execucoes_empresas` | `execucao_id`, `empresa_id`, `status` (`ok`/`erro`), `contagens jsonb`, `erro` |
| `rotina_registrar(rotina, inicio, resultado)` | lê o resultado `{empresa_id: ...}` das rotinas do banco, grava a execução e uma linha por empresa; **qualquer empresa com `erro` marca a execução `com_erro`**. Nunca levanta erro (se o registro falhar, a rotina segue igual) e devolve o resultado sem mudar |
| `rotina_execucao_abrir` / `rotina_execucao_fechar` | para as rotas do app (`/api/cron/[job]`), só service_role |
| `rotinas_conferir()` + job `rotinas-conferir` (`*/5`) | registra o que não consegue se registrar sozinho: rodada `failed` do pg_cron (rotina que caiu inteira) e as rodadas das rotinas sem envelope (aquecimento, retenção) |
| `rotinas_situacao()` | para o superadmin: por rotina, a última execução, a última rodada do agendador, **atrasada** (sem rodar além de `intervalo_esperado + folga`) e os erros não reconhecidos dos últimos 7 dias. Calculada na hora: o atraso aparece mesmo se o próprio conferidor parar |
| Comando dos jobs `liberacao-diaria-esteira`, `posvenda-rotina-diaria` e `zapintel-conversa-aquecer` | passam a envolver a chamada: `select public.rotina_registrar('<job>', now(), <a mesma chamada de hoje>)`. A função chamada é a mesma, com os mesmos argumentos |

RLS: as três tabelas só são lidas pelo superadmin (`is_super_admin()`); ninguém da API grava. A coluna `empresa_id` por empresa deixa pronto o aviso ao dono (futuro).

**App:**
- `/api/cron/[job]`: abre a execução no começo e fecha no fim, com o status (`ok` = resposta com `ok !== false`; `com_erro` = `ok: false` ou `falhas`/`erros` por empresa; `falhou` = exceção/500). Falha do registro não muda a resposta da rota.
- `/superadmin/rotinas`: tabela das rotinas (última execução, situação, atraso) e das execuções com erro, com "Marcar como visto".
- **Aviso:** faixa no topo do painel do superadmin e no app (só para quem é superadmin) quando houver execução com erro não vista ou rotina atrasada, com link para a página.

## Testes
- `teste-rotinas-execucoes.sql`: resultado com uma empresa em erro → `com_erro` com a empresa marcada; resultado sem erro → `ok`; resultado malformado não levanta erro e devolve o mesmo valor; `rotinas_conferir` registra uma rodada `failed` uma vez só; atraso calculado; RLS (vendedor e dono de empresa não leem; superadmin lê); nenhuma escrita pela API.
- Unitário do envelope da rota (status a partir da resposta) e do resumo da página.
- Ritual inteiro verde; e2e atuais intocados.

## Deploy (portões de sempre)
Migração (backup do comando atual dos jobs no arquivo de volta) → conferir que os jobs envolvidos continuam rodando e gravando execução → app → smoke: ver a página do superadmin com as execuções reais; forçar uma execução com erro só na Demonstração não é possível sem mexer em rotina, então a prova de erro fica no teste local e numa execução falsa marcada `teste` apagada depois.

**Volta:** devolver o comando original dos 3 jobs (no arquivo de volta) e desagendar `rotinas-conferir`; as tabelas ficam.

# Backup lógico de 16/10/2026 — teste de restauração (APROVADO)

O backup lógico de **16/10/2026, 06:17** foi restaurado do zero num PostgreSQL
local isolado e produziu um banco íntegro: zero erros e zero avisos no
`pg_restore`; estrutura idêntica à produção (contagens **e** impressão digital
das definições); contagens de linhas iguais ou com diferença explicada por
gravações posteriores ao backup; os testes SQL de acesso do projeto passam no
banco restaurado.

Nada tocou o banco de produção além de consultas de leitura para comparar.

## O backup

Pasta `D:\Backups-Supabase\crm-saas\2026-10-16\execucao-2026-10-16_061706\`
(gerada pelo script `backup-crm-saas.ps1`; servidor de produção **PostgreSQL
17.6**, `pg_dump` **18.4**). SHA256 dos 10 arquivos conferido antes do teste.

| Arquivo | Formato | Tamanho | Comando | Conteúdo |
|---|---|---|---|---|
| `projeto.dump` | custom, gzip | 42,2 MB | `pg_dump -Fc -Z 6 -n public -n backup -n evolution -n supabase_migrations` | estrutura e dados dos 4 schemas |
| `gerenciados-estrutura.dump` | custom, gzip | 225 kB | `pg_dump -Fc -Z 6 --schema-only -n auth -n storage` | só estrutura de `auth` e `storage` |
| `gerenciados-dados.dump` | custom, gzip | 329 kB | `pg_dump -Fc -Z 6 --data-only -t auth.users -t auth.identities -t 'storage.*'` | `auth.users` 14, `auth.identities` 14, `storage.objects` 2.785, `storage.buckets` 5, `storage.migrations` 74 |
| `cron-jobs.dump` | custom | 1,5 kB | `pg_dump -Fc --data-only -t cron.job` | 1 tarefa agendada |
| `papeis.sql` | SQL | 5,4 kB | `pg_dumpall --roles-only --no-role-passwords` | 15 papéis, sem senha |

Os comandos usam `--lock-wait-timeout=60000` e conexão `sslmode=verify-full`.
Cada arquivo é consistente sozinho; juntos cobrem 06:17:06–06:18:11 (não são
uma única fotografia transacional).

## O que o backup cobre e o que NÃO cobre

**Cobre:** todas as tabelas, funções, políticas, gatilhos, índices e restrições
de `public`, `backup`, `evolution` e `supabase_migrations`, com os dados; a
estrutura completa de `auth` e `storage`; **os logins** (`auth.users` com o hash
da senha, e `auth.identities`) — uma restauração recupera quem pode entrar; os
**registros** do Storage (`storage.objects`, inclusive os 61 do bucket
`contratos`); a tarefa do `pg_cron`; os papéis.

**NÃO cobre:**

- **Os arquivos do Storage.** `storage.objects` é só o registro; os bytes
  (~0,8 GB: mídia do chat, os 61 fundos de contrato, o resto) não estão aqui.
  Restaurar o banco devolve registros apontando para arquivos que não existem.
- **Sessões, tokens, MFA e auditoria de login** (`auth.sessions`,
  `refresh_tokens`, `mfa_*`, `audit_log_entries`, `flow_state`,
  `one_time_tokens`, `auth.schema_migrations`: só estrutura). Todo mundo entra
  de novo; quem usasse MFA recadastraria (hoje ninguém usa: 0 fatores).
- **Senhas dos papéis** do banco (`--no-role-passwords`): redefinir numa
  restauração real.
- **Extensões:** o `pg_dump -n` não grava `CREATE EXTENSION`. A produção usa
  `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (schema `extensions`),
  `pg_cron` e `supabase_vault`.
- **Realtime:** as publicações `supabase_realtime` e
  `supabase_realtime_messages_publication` não estão no backup — o "ao vivo"
  das telas precisaria ser refeito.
- **Vault, segredos, Edge Functions, configuração do projeto Supabase e as
  chaves do app** (`CHANNEL_ENCRYPTION_KEY`, `PAYMENT_ENCRYPTION_KEY`). Pelo
  nome, são elas que abrem o que o app guarda cifrado no banco (tokens de canal,
  configuração de pagamento): sem elas, esses dados restaurados não servem.

## O procedimento que funcionou

Tempo total, do download ao banco verificado: **~10 min** (11:36–11:46). A
restauração em si: **21,5 s**.

### 1. Ambiente (PostgreSQL 17.6 portátil, descartável)

A máquina não tinha Docker, WSL nem servidor PostgreSQL. Usado o zip oficial de
binários da EDB, **sem instalar e sem serviço do Windows**:

```
https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip
329.891.687 bytes  SHA256 d378882abd001a186735acd6f6ba716bca6ccd192e800412d4fd15ed25376b3e
```

Os binários em zip da EDB não são assinados (o zip 18.4 que gera o backup
também não); a garantia é a origem HTTPS oficial e o tamanho batendo.

```powershell
tar -xf <zip> -C D:\Restauracao-Teste\pg17 pgsql/bin pgsql/lib pgsql/share
initdb -D D:\Restauracao-Teste\dados -U restaurador -E UTF8 --locale-provider=builtin --builtin-locale=C.UTF-8 -A reject
```

- Superusuário de bootstrap **`restaurador`**, não `postgres`: o `papeis.sql`
  rebaixa o `postgres` a NOSUPERUSER BYPASSRLS, como em produção — e as funções
  SECURITY DEFINER dependem disso.
- Acesso só desta máquina: `listen_addresses = 'localhost'`, `port = 54317`,
  `pg_hba` com uma linha `sspi map=local` para 127.0.0.1 e ::1, `pg_ident`
  `local lucas restaurador` (entra pela conta do Windows, sem senha).
- `pg_ctl -D dados -l logs\servidor.log -w start`.

### 2. Papéis (2 ajustes no `papeis.sql`)

1. Tirar `ALTER ROLE authenticator SET session_preload_libraries TO 'supautils', 'safeupdate'`
   (bibliotecas que só existem no Supabase).
2. As 18 linhas `GRANT ... GRANTED BY supabase_admin` falham no PostgreSQL 16+
   (o concedente precisa de ADMIN no papel). Reaplicadas iguais, **sem** o
   `GRANTED BY` — membro, `ADMIN OPTION` e `INHERIT` preservados.

### 3. Banco e extensões

```sql
create database crm_restaurado owner postgres;
\c crm_restaurado
create schema extensions authorization postgres;
grant usage on schema extensions to anon, authenticated, service_role;
create extension pgcrypto schema extensions;
create extension "uuid-ossp" schema extensions;
create extension pg_stat_statements schema extensions;
```

`pg_cron` e `supabase_vault` não existem para Windows: a tarefa agendada foi
conferida pelo arquivo (abaixo).

### 4. Restauração — `pg_restore` 18.4 no servidor 17.6, em 6 etapas

A ordem resolve as dependências entre os arquivos: views de `public` usam
`storage.objects`; políticas de `storage.objects` usam `public.get_empresa_id`;
5 chaves estrangeiras de `public` apontam para `auth.users`; um `DEFAULT` usa
`extensions.gen_random_bytes`. Do índice do `projeto.dump` sai só a entrada
`40; 2615 2200 SCHEMA - public` (o banco novo já tem o schema).

```bash
pg_restore -l projeto.dump > projeto.lst      # e comentar a linha "SCHEMA - public"
C="-h localhost -p 54317 -U restaurador -d crm_restaurado"
pg_restore $C --section=pre-data  gerenciados-estrutura.dump              # 0,3 s
pg_restore $C --section=pre-data  -L projeto.lst projeto.dump             # 1,4 s
pg_restore $C --data-only         gerenciados-dados.dump                  # 0,2 s
pg_restore $C --section=data      -L projeto.lst projeto.dump             # 13,9 s
pg_restore $C --section=post-data gerenciados-estrutura.dump              # 1,0 s
pg_restore $C --section=post-data -L projeto.lst projeto.dump             # 4,7 s
```

Sem `--exit-on-error`, para nada ser escondido. **Saída de erro das 6 etapas:
vazia (0 bytes cada), código 0 em todas.**

## A verificação (local × produção, produção só leitura)

### Linhas por tabela (245 tabelas em `public`, `backup`, `evolution`, `supabase_migrations`, `auth`, `storage`)

Mesmas 245 tabelas nos dois lados. **227 com contagem idêntica.** As 18 que
divergem, todas com a produção MAIOR que o backup:

| Tabela | Backup | Produção | Explicação |
|---|---|---|---|
| `public.lead_mensagens` | 62.286 | 63.042 | 756 com id acima do maior do backup (1 com data antiga: histórico sincronizado depois); com id até o do backup a produção tem exatamente **62.286** |
| `public.integracao_eventos` | 10.746 | 10.830 | 84 criadas depois de 06:17 |
| `public.historico_bruto` | 4.925 | 4.952 | 27 criadas depois |
| `public.leads` | 3.294 | 3.311 | 17 criadas depois |
| `public.acessos` | 854 | 861 | 7 criadas depois |
| `public.lead_perfil_busca` | 873 | 877 | 4 criadas depois |
| `public.tarefas` | 1.052 | 1.054 | 2 criadas depois |
| `public.lead_atribuicoes` | 187 | 188 | 1 criada depois |
| `public.zapintel_lead_perfil` | 1.854 | 1.904 | 102 fichas geradas depois (as regeradas substituem a anterior) |
| `public.rate_limit` | 448 | 451 | 8 janelas novas; as antigas são descartadas |
| `public.chat_leituras` | 6 | 7 | 1 leitura depois |
| `storage.objects` | 2.785 | 2.841 | 56 criados depois |
| `auth.refresh_tokens`, `sessions`, `mfa_amr_claims`, `flow_state`, `one_time_tokens`, `schema_migrations` | 0 | 689 / 20 / 20 / 3 / 1 / 82 | fora do backup **de propósito** (só estrutura) |

Nenhuma tabela tem no backup mais linhas que a produção. Conferido por chave
só em `lead_mensagens` (a maior): nenhuma mensagem do backup falta.

### Estrutura — contagem e impressão digital (md5 das definições), idênticas

| Schema | Funções | Políticas | Gatilhos | Índices | Restrições | Tabelas com RLS | Views |
|---|---|---|---|---|---|---|---|
| `public` | 53 | 124 | 49 | 347 | 385 | 95 | 5 |
| `auth` | 4 | 0 | 1 | 111 | 110 | 16 | 0 |
| `storage` | 19 | 13 | 7 | 20 | 20 | 8 | 0 |

Os 7 md5 (funções, políticas, gatilhos, índices, restrições, lista de tabelas
com RLS) batem nos 3 schemas: não só a quantidade, o **texto** de cada
definição é igual ao de produção.

### Testes SQL do projeto no banco restaurado

- `supabase/testes/zapintel_acesso.sql`: **18 ok, 0 falhas**.
- `supabase/testes/contratos_e_sino.sql`: **13 ok, 0 falhas**.

A simulação de perfil (`request.jwt.claims` + `auth.uid()`) funciona porque o
backup traz `auth.users` e as funções de `auth`.

### Consulta funcional (dono da JM, seletor na loja 3, sob RLS)

| | Restaurado (06:17) | Produção (~11:45) |
|---|---|---|
| Sino: leads com não lidas / mensagens | 875 / 10.143 | 855 / 9.994 (lidas desde cedo) |
| Lista do ZapIntel (`zapintel_leads_lista`) | 1.898 (página de 50) | 1.908 |
| Dashboard (`zapintel_dashboard`) | 19 blocos | 19 blocos |

### Tarefa agendada (sem `pg_cron` no Windows: conferida pelo arquivo)

`cron-jobs.dump` × `cron.job` de produção: idênticos — `0 5 * * *`,
`zapintel-conversa-aquecer`, mesmo comando, ativo. A função que ele chama foi
restaurada.

## O que este teste NÃO prova

- Restaurar **num projeto Supabase novo** (GoTrue, API do Storage, Realtime
  sobre o banco restaurado). Este teste foi num PostgreSQL puro.
- Os **arquivos** do Storage (não estão no backup).
- `pg_cron` rodando de verdade e `supabase_vault` (não existem no Windows).

## Recomendação

**Periodicidade:**

- **Semanal**, e **sempre antes** de qualquer migração ou limpeza de dados
  (as pendentes 01, 03, 04 e 06 incluídas). Diário não cabe no plano free hoje:
  cada execução lê o banco inteiro pela rede e conta no egress (5 GB/mês; em
  16/10 já eram 2,4 GB no ciclo até 03/11). Semanal: estimado em até ~1 GB/mês
  (não medido — o painel ainda não refletia o backup de 16/10).
- Guardar 4 semanais + 3 mensais.
- **Testar a restauração** a cada mudança de estrutura grande ou, no mínimo, a
  cada 3 meses — este procedimento leva ~10 minutos.
- **Os arquivos do Storage precisam de backup próprio** (~0,8 GB, crescendo
  ~0,6 GB/mês). Fazer depois de 03/11, quando o egress zera, e com cuidado: uma
  cópia inteira consome ~0,8 GB de egress.

**Onde guardar:** hoje o backup existe **só** no disco D: desta máquina — uma
cópia, no mesmo lugar do computador de trabalho. Um disco que falhe leva o
backup junto. Precisa de uma **segunda cópia fora da máquina** (disco externo
ou nuvem), **cifrada**: o arquivo tem dado pessoal de cliente e o hash das
senhas de login. Onde e com que ferramenta é decisão do dono.

## Ambiente do teste

`D:\Restauracao-Teste\` (fora do repositório). Ao fim do teste o servidor foi
parado e a pasta `dados` (a cópia restaurada, com dado pessoal) apagada. Ficam
os binários (`pg17`), o zip (`download`), os scripts e logs (`trabalho`,
`logs`) e um `LEIA-ME-DESCARTAVEL.txt` — o suficiente para repetir o teste, sem
nenhum dado de produção.

# 05 — Runbook do corte para o core v1

**O que é:** a troca, em produção, de `leads` / `clientes` / `lead_mensagens` / `canais_conectados` pelo core v1. Ela roda numa janela de 15 minutos e tem volta.

**Branch:** `db/core-v1`, sobre a main `62cc938`. Commits:
- `c0827af`: ordem das migrações;
- `08efce3`: `mensagem_registrar`;
- `8af5962`: realtime;
- `904775f`: ZapIntel ao vivo;
- `5893dcd`: `hard_delete_empresa`;
- `789db40`: scripts do corte.

**Tempos:** medidos em 19/10/2026 no ensaio completo (`D:\Nexus-Copia\trabalho\ensaio-corte.sh`). O ensaio roda sobre uma cópia dos dados de 19/10 com o passo A aplicado, num Postgres 17.6 local. A produção roda no plano free do Supabase, acessada pela rede: conte de 2 a 3 vezes mais nos passos de banco. Quando o tempo não é medível na cópia, o passo diz isso.

**Conexão:** `$con` é a string do passo A: pooler `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.guiuzbcqkvelqcuogxtd`, `sslmode=verify-full` com a CA em `Downloads\prod-ca-2021.crt`.
- A senha é digitada pelo Lucas na hora e só existe naquela janela do terminal.
- Ferramentas: `C:\Ferramentas\pgsql-18.4\bin` (`psql`, `pg_dump`, `pg_restore`).
- Todos os comandos rodam a partir da raiz do repositório, com a branch `db/core-v1` em uso.

**⚠ Regra de I/O no plano free (desde 20/10/2026, vale para qualquer operação em produção):**
1. **Gate de IOwait, em toda operação e em todo bloco.** Olhar o IOwait no painel do Supabase: Observability → Database → gráfico *CPU usage*, passando o mouse; os pontos são de 2 min.
   - **Acima de 20%: não começar.**
   - **Acima de 30% durante a operação: parar** e esperar voltar.
   - **Referência de normal:** IOwait de 4–9% (manhã de 20/10). No incidente chegou a 58–64%.
   - Este gate substitui o *Disk IO budget*: o painel do plano free não mostra o budget em porcentagem.
2. **I/O só fora do expediente** (com a loja aberta, nunca). I/O aqui é:
   - dump (`pg_dump`, inclusive parcial);
   - purga ou `DELETE` em massa;
   - `VACUUM`;
   - `CREATE` ou `DROP INDEX`;
   - restore;
   - qualquer migração (DDL).
3. **Toda migração (DDL) faz o PostgREST recarregar o cache de schema.** Com o banco lento, essa recarga falha, e **a API inteira responde 503 até ela passar**. Por isso DDL também é I/O.

4. **Logs não são monitoramento.**
   - **Como monitorar:** pelo próprio Postgres:
     - `pg_stat_database` (transações, `blks_read`, `temp_bytes`), comparando uma foto com a anterior;
     - `pg_stat_statements`, também por diferença entre fotos;
     - contagem de mensagens por canal na última hora;
     - gráfico de IOwait no painel.
   - **Consulta de log (`query_logs`, Log Explorer, API) só para investigar um ponto específico,** sempre com:
     - **janela de no máximo 15 minutos;**
     - **filtro por função ou rota.**
   - **Nunca:**
     - "desde 00h" ou "desde 13/10";
     - a janela padrão de 24 h;
     - fotos programadas que leiam logs.
   - **Por quê:** cada consulta lê todo o volume da janela. Em 20/10 foram consultados **92,5 GB** de log num dia, e o ciclo chegou a 137,9 GB consultados contra 2 GB ingeridos.

Por que a regra existe: em 20/10, com a loja aberta, houve dois episódios (ver o incidente no `06-OBSERVACAO-POS-CORTE.md`):
- **10:42:** o dump do `public` levou 230 s, contra 26 s antes do expediente, e travou o app por 4 min.
- **11:04:** a primeira purga do `historico_bruto`, junto com a recarga do schema causada por uma migração, deixou a API fora por ~7 min. 97 eventos da Meta foram perdidos.

---

## Antes da janela (pode ser dias antes)

### (c) `mensagem_registrar` versão A + Edge sem upsert direto

Funciona igual antes e depois do corte, então vai para o ar antes. Isso tira do caminho crítico o bloqueio nº 1 (`ON CONFLICT` em view).

| # | Passo | Comando | Cópia |
|---|---|---|---|
| c1 | Aplicar a migração | `psql "$con" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261021000000_mensagem_registrar.sql` | 0,1–0,2 s |
| c2 | Conferir grant | `select has_function_privilege('anon','public.mensagem_registrar(bigint,bigint,text,jsonb)','execute'), has_function_privilege('authenticated', …)` → as duas `false` | — |
| c3 | Publicar a Edge **a partir da branch** | `npx supabase functions deploy webhook-leads --project-ref guiuzbcqkvelqcuogxtd --use-api --no-verify-jwt` | não medível na cópia. Só depois do c1: a Edge nova chama a função. |
| c4 | Confirmar que as mensagens continuam entrando | anotar `select max(id) from lead_mensagens` antes do c3. Depois: (1) receber uma mensagem de WhatsApp e uma de Instagram; (2) responder pelo CRM; (3) `select id, direcao, canal_id, external_id is not null from lead_mensagens where id > <anotado> order by id` → as três aparecem; (4) os logs da Edge não mostram `gravar mensagem` nem `histórico lote` | — |

**Se o c4 falhar:** publicar de novo a Edge da main (`git stash` ou checkout de `62cc938`, e o mesmo comando do c3). A função A pode ficar no banco, porque ninguém mais a chama.

### Decisões antes de marcar a janela
1. **Badge de não lidas nos contatos fundidos.** No core v1, cada negócio de um contato fundido mostra as não lidas do **contato**. Na cópia, 32 cards de negócio não principal ganham badge (920 mensagens contadas duas vezes); leads com badge passam de 1.194 para 1.218. Ao abrir o card, a conversa não aparece, porque a view `lead_mensagens` põe a mensagem só no negócio principal. **Proposta:** a view `leads` passa a mostrar não lidas e última mensagem só no negócio principal, pela mesma regra da view de mensagens. São cerca de 5 linhas no passo 8.4. **Não aplicada; é sua decisão.**
2. **`hard_delete_empresa` está quebrada em produção hoje.** Ela cita `public.proprietarios`, que não existe, e falha para qualquer empresa (conferido só lendo a produção). O core v1 corrige; até o corte, excluir empresa pelo superadmin dá erro.

---

## A janela (T0 = início)

| Passo | O quê | Comando | Cópia | Corta se… |
|---|---|---|---|---|
| **a** | Aviso de manutenção | `/superadmin/avisos`. Título "Manutenção programada", corpo "Entre HH:MM e HH:MM o CRM pode ficar instável. Mensagens do WhatsApp continuam chegando.", tom **Alerta**, alvo **Todos os tenants**, expira em T0 + 30 min. Grava em `avisos_plataforma`, que a migração não toca. | ~1 min (manual) | — |
| **b1** | Dump completo do `public` | `pg_dump -d "$con" -Fc -Z 6 --strict-names -n public -f dumps\AAAA-MM-DD-corte\public.dump` e em seguida `pg_restore -f NUL dumps\AAAA-MM-DD-corte\public.dump` (leitura completa) | 10–15 s + 0,7–1,5 s (49 MB). Produção pela rede: medir. | o dump ou a leitura falhar |
| **b2** | Capturar o que fica fora do `public` | `psql "$con" -X -q -A -t -v ON_ERROR_STOP=1 -f supabase/scripts/corte/capturar-externos.sql -o dumps\AAAA-MM-DD-corte\externos.sql` | 0,1 s | o arquivo tiver menos de **15** objetos (produção: 8 policies de storage + 1 de realtime + o gatilho de auth + 5 tabelas na publicação) |
| **b3** | Marco das mensagens | `psql "$con" -X -A -t -c "select max(id) from lead_mensagens"` → anotar o **marco** | — | — |
| **b4** | Fotografia do funil | `psql "$con" -X -q -A -t -f supabase/scripts/corte/foto-funil.sql -o dumps\AAAA-MM-DD-corte\funil-antes.txt` | < 1 s | — |
| **d1** | Core v1 | `psql "$con" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261020000200_core_v1.sql` | 0,3–8,5 s | erro: nada foi aplicado (transação única); o app segue no legado. Tirar o aviso ou tentar de novo. |
| **d2** | Script do JM | `psql "$con" -X -v ON_ERROR_STOP=1 -f supabase/scripts/migrar_jm_para_core.sql` | 20–33 s | qualquer checagem falsa: a transação inteira volta. O core v1 (d1) fica, vazio e inofensivo. Decidir entre corrigir ou desistir; não precisa de volta. |
| **d3** | Reconciliar a janela | `psql "$con" -X -v ON_ERROR_STOP=1 -f supabase/scripts/corte/reconciliar-janela.sql`. Traz para o core o que o webhook gravou nas tabelas antigas enquanto o d2 rodava. | 0,1–0,2 s | — |
| **d4** | Conferir | `select count(*) filter (where not ok), count(*) from migracao.checagens` → **0 e 29** | — | ≠ 0 / 29 → **g** |
| **e1** | Variável na Vercel | Settings → Environment Variables → **Production**: `NEXT_PUBLIC_DB_CORE = v1` | ~1 min (manual) | — |
| **e2** | Deploy | merge da `db/core-v1` na `main` + push (Lucas). A Vercel builda a partir de `origin/main`. Pronto quando o cabeçalho `Age` de `/login` volta a 0. | build local: 180 s. Vercel: não medível na cópia. | build falhar → corrigir ou **g** |
| **f** | Smoke | ver abaixo | ~5 min (manual) | qualquer item falhar sem conserto em 5 min → **g** |
| — | Tirar o aviso | `/superadmin/avisos` → excluir | — | — |

Enquanto o build do e2 não fica pronto, o código antigo roda sobre o banco novo. Leitura e gravação passam pelas views (checagem do passo 8 "código antigo lê e grava pelas views"). Só o tempo real fica mudo, porque o app antigo assina `leads`/`lead_mensagens`, que agora são views. O aviso cobre esse intervalo.

**Total esperado:** a + b ≈ 3 min; d ≈ 1–2 min em produção; e ≈ 4–5 min de build; f ≈ 5 min. **≈ 13–15 min.**

### (f) Smoke, nesta ordem
1. **Login** com o dono da JM.
2. **Funil com os mesmos cards:**
   - rodar `psql "$con" -X -q -A -t -f supabase/scripts/corte/foto-funil.sql -o funil-depois.txt` e depois `fc funil-antes.txt funil-depois.txt`: tem de dar **igual**. Na cópia foram 17 linhas iguais antes do corte, depois do corte e depois da volta.
   - abrir `/leads` nas duas lojas: os cards batem com a tela de antes.
3. **Abrir conversa** de um lead com histórico: as mensagens aparecem, as mídias abrem (`/api/midia`) e o badge some ao abrir.
4. **Mandar e receber WhatsApp.** Responder pelo CRM: chega no celular, e a bolha "agora" vira a mensagem real com o tique. Responder do celular do cliente: aparece **sem F5** no chat aberto, no kanban (o card sobe) e no sino. Isso confirma o tempo real no `v1`.
5. **2ª via de contrato:** reimprimir um contrato existente.
6. **`/api/whatsapp/send`:** chamar como o PDV/OS chama (o mesmo teste do passo A). A mensagem chega e aparece na conversa do lead.
7. *(extra)* **ZapIntel:** o dashboard atualiza sozinho quando chega mensagem (gatilho `zapintel_ao_vivo` em `mensagens`).

---

## (g) Volta

Use se d4, e ou f falharem. Ela devolve o banco ao estado do b1. A ordem importa: salvar → esvaziar → restaurar → externos → revoke → repor.

| # | Passo | Comando | Cópia |
|---|---|---|---|
| g0 | Salvar as mensagens que chegaram depois do corte | `cd dumps\AAAA-MM-DD-corte` e `psql "$con" -X -v ON_ERROR_STOP=1 -v marco=<b3> -f ..\..\supabase\scripts\corte\volta-salvar-mensagens.sql` → gera `mensagens-pos-corte.csv` | 0,15 s |
| g1 | Esvaziar o `public` (o schema fica) e **zerar os privilégios padrão do `postgres` no `public`**, na mesma transação | `psql "$con" -X -v ON_ERROR_STOP=1 -f supabase/scripts/corte/volta-limpar-public.sql`. Os privilégios padrão voltam no g2, pelo próprio dump. Sem zerar, o `pg_restore` cria cada tabela e função já com os grants padrão do Supabase, e o dump não revoga o que não existia. No ensaio de 20/10 isso reabriu 215 grants de anon e 140 de authenticated em tabelas que a produção fechou (ex.: `canais_conectados`), mais EXECUTE de `service_role` numa função. | 0,9–1,1 s |
| g2 | Restaurar o dump **sem as entradas DEFAULT ACL do `supabase_admin`** | `pg_restore -l dumps\AAAA-MM-DD-corte\public.dump \| findstr /V /R /C:"DEFAULT ACL .* supabase_admin" > dumps\AAAA-MM-DD-corte\restaurar.lst` e depois `pg_restore -d "$con" --single-transaction --exit-on-error -n public -L dumps\AAAA-MM-DD-corte\restaurar.lst dumps\AAAA-MM-DD-corte\public.dump`. **Sem a lista o g2 FALHA:** o `postgres` não pode recriar os privilégios padrão do `supabase_admin`; a transação volta e o `public` fica vazio do g1. Elas nem saíram, porque o g1 não apaga o schema. As do `postgres` ficam na lista: é por elas que os privilégios zerados no g1 voltam. Conferir que a lista tem as 3 entradas do `postgres` e nenhuma do `supabase_admin`. | 14,7–16,6 s |
| g3 | Recriar o que fica fora do `public` | `psql "$con" -X -v ON_ERROR_STOP=1 -f dumps\AAAA-MM-DD-corte\externos.sql`. Em produção roda como `postgres`: o `supautils.policy_grants` libera policy em `storage.objects`/`realtime.messages` e o privilégio TRIGGER libera `auth.users` (conferido em 19/10). | 0,1–0,2 s |
| g4 | Conferir as funções | `select count(*) filter (where has_function_privilege('anon',oid,'execute')), count(*) filter (where has_function_privilege('authenticated',oid,'execute')) from pg_proc where pronamespace='public'::regnamespace` → **0 e 22**. Com o g1 e o g2 acima, a ACL volta exatamente a do dump. Só se der diferente: rodar `supabase/migrations/20261020000000_revoke_rpc.sql`. | — |
| g5 | Repor as mensagens | no mesmo diretório do g0: `psql "$con" -X -v ON_ERROR_STOP=1 -f ..\..\supabase\scripts\corte\volta-repor-mensagens.sql` | 0,2 s |
| g6 | Código anterior | Vercel → Deployments → o último deploy de produção **antes** do e2 → **Instant Rollback**. Ele foi buildado sem `NEXT_PUBLIC_DB_CORE`, então é legado. **E** apagar `NEXT_PUBLIC_DB_CORE` das variáveis de Production; se ficar, o próximo build sai `v1`. | segundos (manual) |
| g7 | Conferir | `foto-funil.sql` igual ao `funil-antes.txt`; `select count(*) filter (where has_function_privilege('anon',oid,'execute')), count(*) filter (where has_function_privilege('authenticated',oid,'execute')) from pg_proc where pronamespace='public'::regnamespace` → **0 e 22**; uma mensagem recebida entra (a Edge do c3 chama a versão A, que o restore trouxe de volta). | — |

**Volta no banco, medida na cópia** (ensaio de 20/10 com o dump completo da produção, duas passadas seguidas): g0–g5 = **16,5–18,3 s**. Mais o rollback da Vercel, que leva segundos.

No ensaio, comparando o banco depois da volta com o de antes:
- contagem por tabela: igual nas 95, fora `lead_mensagens` +1, que é a mensagem reposta;
- funções, grants, policies, gatilho de auth, publicação, privilégios padrão e o hash das ACLs de tabelas e de funções: iguais.

Das 2 mensagens simuladas na janela, a do lead antigo voltou. A do contato novo foi listada, e esse é o comportamento esperado.

**O que a volta perde:** o que não é mensagem e foi gravado entre o b1 e o g1. Por exemplo: lead criado à mão, card movido, venda. O aviso de manutenção existe para isso. As mensagens de contato que nasceu na janela também não voltam sozinhas: ficam listadas pelo g5, o texto está no CSV e a próxima mensagem da pessoa recria o lead.

---

## Depois do corte

- **Lista de morte — o que já saiu (noite de 20/10, loja fechada; volta = restaurar só a tabela/schema do dump `dumps/2026-10-21-limpeza/public.dump` de 20/10 10:42, nunca restore completo):**
  - `old_leads`, `old_clientes`, `old_lead_mensagens`, `old_canais_conectados` (antecipado do dia +14; o dump das 10:42 tem as quatro);
  - schemas `backup` e `evolution` (`backup.dump`, `evolution.dump`);
  - `followups_gerados` e a régua de follow-up; `v_inventario_veiculo`;
  - `campanhas_fidelidade`, `lista_espera`, `solicitacoes_marketing` (e as telas);
  - o tenant 3 (Imobiliária) inteiro, por `hard_delete_empresa(3)`;
  - 8 índices nunca usados que não cobrem FK.
- **Etapa 0 (branch `feat/etapa-0`, deploy em 22/10 à noite):**
  - **Ordem do deploy:** (1) as migrações `20261021003xxx` (sincronizam o legado nas tabelas do core; não apagam nada e o app de hoje segue funcionando); (2) o deploy do app; (3) as migrações `20261022000xxx` (os DROPs), só com o app novo no ar. Volta de (3) = restaurar só a tabela/coluna do dump tirado antes, nunca restore completo.
  - `v_orfaos_chat_midia` (migração 20261021003300; o script manual de órfãos passou a ler `storage_orfaos`). Pode rodar antes do deploy.
  - `segmentos_config` (1.1): sincronização 20261021003200, drop 20261022000100. O menu, a trava de rota, o `entrar`, o `meu-menu`, o ranking e as telas de Segmentos/Laboratório do superadmin leem `presets_onboarding` + `empresa_menu.itens.{superadmin,dono}` + `empresa_modulos.config.forcado` por `lib/empresa-config.ts`. Quem grava `empresas.segmento` grava `preset_onboarding` junto. Teste: `scripts/comparar-menu.mts` (menu idêntico por empresa, loja e papel).
  - `complementos_empresa` (1.2): sincronização 20261021003400 (copia TODAS as empresas para `empresa_modulos('inteligencia')`, troca a linha da trava em `zapintel_escopo` e o comando do job `zapintel-conversa-aquecer`), drop 20261022000200. Layout do ZapIntel, atalho do /admin, cron `ponte-vendas` e a tela/rota de add-on do superadmin leem e gravam `empresa_modulos`. Teste: `supabase/testes/zapintel_acesso.sql` (15 ok antes, depois da sincronização e depois do drop).
  - `types/database.ts` agora é uma sobreposição de `types/database.gerado.ts` (saída crua do `supabase gen types`): as 37 views de módulo do core são tipadas como a tabela que espelham (`types/views-espelho.ts`, gerado de `supabase/testes/views_espelho.sql` por `scripts/tipos-espelho.mjs`). Regerar os dois quando o schema mudar.
- **Lista de morte — o que fica, e até quando:**
  - as 18 colunas de `empresas` com `COMMENT 'obsoleta'`: próxima leva;
  - `ops.volta_filial_20261020`: volta do principal por loja, apagar a partir de 03/11;
  - `segmentos_config`, `complementos_empresa`, `lead_atribuicoes`: **ficam**, o código lê (menu, ZapIntel/`ponte-vendas`, distribuição);
  - ~89 índices nunca usados que cobrem FK: ficam.
- **Toda view nova ou recriada leva `with (security_invoker = true)`.** O `create or replace view` sem a opção a apaga, e a view passa a ignorar a RLS (furo de 20/10, 2 min 44 s; ver o 06). O banco recusa (event trigger `exigir_security_invoker`) e o build também (`npm run check:views`).
- **Views de compatibilidade:** sair conforme as telas migram para o core.
  - Regra: uma view só cai quando `grep -rn "from('<nome>')" app components lib hooks supabase/functions` volta vazio.
  - Ordem natural: as 37 views simples de módulo (renomear as chamadas para `vendas_vendas`, `estoque_produtos` etc.) → `canais_conectados` → `clientes` → `lead_mensagens` → `leads`.
  - **Quando a view `leads` cair, a Edge passa a chamar `mensagem_registrar` por identidade** (`identidade` + canal, sem `lead_id`) e deixa de resolver o lead pela `upsertLead`. Hoje a regra de não duplicar negócio de quem volta pelo canal vive em dois lugares: no gatilho `compat_leads_iud`, que morre com a view, e na `mensagem_registrar` B. As duas chamam `core_negocio_do_canal`. Sem essa troca na Edge, a duplicação volta.
  - Quando `leads` e `lead_mensagens` caírem, saem também:
    - os gatilhos e funções `compat_*` (a `core_negocio_do_canal` fica);
    - o ramo "legado" de `lib/realtime/tabelas.ts`, que passa a ler `negocios`/`mensagens` direto e deixa de reler pelas views;
    - a variável `NEXT_PUBLIC_DB_CORE`.
- **`mensagem_registrar`:** fica. A Edge continua gravando por ela, e o corpo é a versão B.

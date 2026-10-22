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

> **Vale para TODO deploy, não só para o corte.** Os passos 1, 8 e 9 (p) são o mínimo de qualquer deploy; os demais quando o deploy mexe no que eles cobrem.

1. **Login** com o dono da JM.
2. **Funil com os mesmos cards:**
   - rodar `psql "$con" -X -q -A -t -f supabase/scripts/corte/foto-funil.sql -o funil-depois.txt` e depois `fc funil-antes.txt funil-depois.txt`: tem de dar **igual**. Na cópia foram 17 linhas iguais antes do corte, depois do corte e depois da volta.
   - abrir `/leads` nas duas lojas: os cards batem com a tela de antes.
3. **Abrir conversa** de um lead com histórico: as mensagens aparecem, as mídias abrem (`/api/midia`) e o badge some ao abrir.
4. **Mandar e receber WhatsApp.** Responder pelo CRM: chega no celular, e a bolha "agora" vira a mensagem real com o tique. Responder do celular do cliente: aparece **sem F5** no chat aberto, no kanban (o card sobe) e no sino. Isso confirma o tempo real no `v1`.
5. **2ª via de contrato:** reimprimir um contrato existente.
6. **`/api/whatsapp/send`:** chamar como o PDV/OS chama (o mesmo teste do passo A). A mensagem chega e aparece na conversa do lead.
7. *(extra)* **ZapIntel:** o dashboard atualiza sozinho quando chega mensagem (gatilho `zapintel_ao_vivo` em `mensagens`).
8. **Listar e criar tarefa (todo deploy, desde 21/10):** abrir `/tarefas` nas DUAS lojas (Mogi Guaçu e Jaguariúna) — a lista aparece, com o nome do lead; criar pela tela uma tarefa "TESTE DEPLOY <data> — apagar" numa loja, conferir que aparece só nela, e apagar. Por quê: de 20/10 a 21/10 a lista veio vazia e criar tarefa falhou calado (embed ambíguo, PGRST201) — nenhum teste olhava tarefas (06, seção 8).
9. **(p) Mídia do chat em cache (desde 21/10):** com o DevTools do Edge aberto na aba Rede (filtro `midia`, *sem* marcar "Desativar cache"), abrir uma conversa com fotos, sair para outra conversa e voltar nela em menos de 8 min. Na **segunda** abertura nenhum `/api/midia` vai à rede: a coluna Tamanho mostra `(cache de disco)` ou `(cache de memória)`. Se aparecer `302` de novo, o `Cache-Control: private, max-age=480` não chegou (conferir o cabeçalho na primeira abertura). Por quê: com `no-store` cada redesenho do chat subia a função, ~125 ms de CPU por arquivo (152 chamadas em 12 h, 3º lugar da Vercel em 21/10).

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
- **Lista de morte — o que saiu na noite de 21/10 (Etapa 0 + ZapIntel; loja fechada; volta = restaurar só a tabela/coluna/função do dump `dumps/2026-10-22-etapa0/public.dump` de 21/10 18:41, nunca restore completo):**
  - `v_orfaos_chat_midia` (20261021003300, 18:52, antes do deploy);
  - `segmentos_config` (20261022000100, 21:19), `complementos_empresa` (000200, 21:20), `lead_atribuicoes` (000300, 21:20; as 691 linhas já estavam todas no `negocio_historico`) e as 18 colunas de `empresas` (000400, 21:21). As quatro, depois do deploy da main `ec10dd5` (READY 19:03) e do smoke;
  - as funções do ZapIntel deixaram de ler as views `leads`/`lead_mensagens` (20261022001000, 21:27) — as views continuam, outras telas leem. **Volta do ZapIntel:** reaplicar as 11 funções do dump E depois rodar de novo o bloco DO da 20261021003500 (troca `lead_atribuicoes` → `negocio_historico` no `zapintel_conversa_calc`) e o da 20261021003600 (troca `segmento` → `preset_onboarding` no `zapintel_resumo`): o dump é de antes dessas duas, e sem elas as funções voltariam lendo o que não existe mais.
  - Contagem em `public` depois da noite: 101 tabelas, 45 views, 86 funções, banco 195 MB (antes: 103, 46, 82, 196 MB).
- **Etapa 0 (branch `feat/etapa-0`; executada na noite de 21/10 — o plano era 22/10):**
  - **Ordem do deploy:** (1) as migrações `20261021003xxx` (sincronizam o legado nas tabelas do core; não apagam nada e o app de hoje segue funcionando); (2) o deploy do app; (3) as migrações `20261022000xxx` (os DROPs), só com o app novo no ar. Volta de (3) = restaurar só a tabela/coluna do dump tirado antes, nunca restore completo.
  - `v_orfaos_chat_midia` (migração 20261021003300; o script manual de órfãos passou a ler `storage_orfaos`). Pode rodar antes do deploy. **Mas `scripts/limpar-orfaos-chat-midia.mjs` NÃO roda entre as 003xxx e o deploy do app:** o código antigo do script lê a view que a 003300 apaga, e o novo lê `storage_orfaos`. Vale para qualquer volta do deploy (Instant Rollback) com as 003xxx aplicadas.
  - `segmentos_config` (1.1): sincronização 20261021003200, drop 20261022000100. O menu, a trava de rota, o `entrar`, o `meu-menu`, o ranking e as telas de Segmentos/Laboratório do superadmin leem `presets_onboarding` + `empresa_menu.itens.{superadmin,dono}` + `empresa_modulos.config.forcado` por `lib/empresa-config.ts`. Quem grava `empresas.segmento` grava `preset_onboarding` junto. Teste: `scripts/comparar-menu.mts` (menu idêntico por empresa, loja e papel).
  - `complementos_empresa` (1.2): sincronização 20261021003400 (copia TODAS as empresas para `empresa_modulos('inteligencia')`, troca a linha da trava em `zapintel_escopo` e o comando do job `zapintel-conversa-aquecer`), drop 20261022000200. Layout do ZapIntel, atalho do /admin, cron `ponte-vendas` e a tela/rota de add-on do superadmin leem e gravam `empresa_modulos`. Teste: `supabase/testes/zapintel_acesso.sql` (15 ok antes, depois da sincronização e depois do drop).
  - `lead_atribuicoes` (1.3): sincronização 20261021003500, drop 20261022000300. A posse do lead fica só no `negocio_historico`: `negocio_atribuir()` (só `service_role`) marca a ação e o autor na transação e o gatilho `core_negocio_historico` os grava; sem marca, grava `atribuicao` como antes. As rotas `atribuir`/`distribuir` chamam a função; o painel do responsável e `zapintel_conversa_calc` leem as ações detalhadas; `fundir_clientes` perdeu a linha da tabela. Teste: `zapintel_conversa_calc` da JM idêntico com e sem a migração (3, 7 e 14 dias; a rodada de 30 dias não terminou na cópia).
  - **As 18 colunas de `empresas`** (1.4): sincronização 20261021003600 (copia de novo para `empresa_branding` e `empresa_dados_contrato`, abre a LEITURA de `empresa_dados_contrato` a qualquer membro — o vendedor emite contrato no PDV e sempre leu estes dados em `empresas` —, troca `segmento` por `preset_onboarding` em `zapintel_resumo`), drop 20261022000400. O app lê com alias e spread do PostgREST (`segmento:preset_onboarding`, `...empresa_branding(wl_cor:cor, ...)`, `...empresa_dados_contrato(...)`): o objeto devolvido tem os nomes de sempre. Escritores: cadastro (branding), "Minha empresa" (identificação em `empresas`, contrato e white-label nas tabelas próprias — e passou a gravar os 7 campos de representante/banco que descartava), Aparência (`sidebar`), superadmin e previews (`preset_onboarding`). Testes: `scripts/comparar-empresa.mts` (22 leituras de white-label/segmento/contrato iguais, como serviço e como vendedor) e `scripts/comparar-contrato.mts` (6 contratos reemitidos como dono e vendedor + 2ª via: 24 HTMLs idênticos byte a byte).
  - **Painel (2.1):** todas as consultas do painel em `lib/painel/metricas.ts`, lendo o core; lucro e margem só sobre vendas com custo lançado. Sem migração. Teste: `scripts/comparar-painel.mts` (rodar com `db-max-rows = 1000` no PostgREST, como o Supabase).
  - **Ferramentas fora do menu (2.4):** Simular parcela → aba `/orcamentos/parcela`; Check IMEI → `/estoque/imei` (aba de Estoque); Consulta FIPE → `/avaliacoes/fipe` (botão em Avaliações); as três no ⌘K. O módulo liberado continua o mesmo href (`/simular-parcela`, `/check-imei`, `/consulta-fipe`) — `moduloDaRota` traduz a rota nova. Sem migração.
  - **Duplicadas num lugar só (2.3):** Relatórios e Financeiro ficam no CRM (`/relatorios`, `/financeiro`; `/admin/relatorios` e `/admin/financeiro` apagados, 308); Integrações fica em `/admin/integracoes` (a aba de Configurações saiu; `?aba=integracoes` responde 308); os redirects antigos do proxy (`/conversao`, `/equipe`, `/metas`, grupo Sistema) passam a 308. Código copiado virou função: `reconciliarAssinaturas` (cron × botão do superadmin) e `entrarNaEmpresaDePreview` (laboratório × preview de segmento). Relatórios passa a contar lucro só com custo, como o painel. Sem migração.
  - **Vitrine de módulo desligado (2.5):** migrações `20261021003700_modulo_pedidos.sql` (tabela nova, RLS sem política, só service_role) e `20261021003710_modulo_pedidos_idx.sql` (índice parcial CONCURRENTLY — rodar FORA de transação). Rodam antes do deploy. O proxy reescreve `/agenda`, `/executivo` e `/gestao-leads` para `/vitrine/<modulo>` quando desligados; Agenda e Executivo mostram a mesma vitrine quando o segmento não tem a tela. "Ativar": superadmin liga (camada `empresa_menu.itens.superadmin.habilitados`), dono/admin abre pedido (aparece na tela da empresa no superadmin). A trava passou a somar a liberação por empresa — antes o módulo ligado só para uma empresa aparecia no menu e era barrado na rota. O superadmin perde a passagem livre só nesses três módulos.
  - **Fora da numeração — tarefas (5fc4b39): JÁ EM PRODUÇÃO desde 21/10 09:53, como `eb9a485`** (deploy próprio; ver o 06, seção 8). Na entrega da Etapa 0, **pular o 5fc4b39** no cherry-pick: o conteúdo já está em main (só o `verificar-auditoria.sh` difere, por ordem de regras).
  - **Decisão do Lucas (21/10) sobre o 1.3:** o Atendimento conta só a distribuição EXPLÍCITA (`pegar`, `devolver`, `transferir`, `atribuir`, `distribuir`), como antes; as trocas genéricas `atribuicao` do gatilho não entram. É o que o código da branch já faz.
  - `types/database.ts` agora é uma sobreposição de `types/database.gerado.ts` (saída crua do `supabase gen types`): as 37 views de módulo do core são tipadas como a tabela que espelham (`types/views-espelho.ts`, gerado de `supabase/testes/views_espelho.sql` por `scripts/tipos-espelho.mjs`). Regerar os dois quando o schema mudar.
- **O que mudou em 22/10 (deploy de dia 11:13 e noite 18:04–19:00; volta de cada um na seção "Noite de 22/10/2026"):**
  - **Deploy de aplicação da `feat/modulos` (`40bf3a4`, 11:13, sem migração):** menu em grupos, Configurações numa tela, Central de Módulos, check-segmento no build. Os 308 do `/admin` entraram no ar aqui (prazo abaixo).
  - **`v_leads_nao_lidas` lê do core** (`20261023000100`, 18:14): `negocios` + `mensagens`, sem passar pelas views `leads` e `lead_mensagens` — elas perderam este leitor. Resultado idêntico em produção (1.278 leads, mesma assinatura); 52 ms no banco.
  - **Corrida de identidade** (`20261023000200`, 18:20): trava de identidade em `compat_leads_iud` e `mensagem_registrar`; `core_negocio_do_canal` com 7 parâmetros (os chamadores de 4 e 5 seguem valendo) e origem no negócio novo; `webhook_mid_novo`; 6 negócios fundidos (3 pares gêmeos de 20–21/10 e 3 herdados do corte). Edge `webhook-leads` versão 67 (18:20): descarta a segunda entrega do mesmo Direct — confirmado no Direct de teste das 18:48.
  - **Views de compatibilidade que zeraram leitor hoje: nenhuma.** A `v_leads_nao_lidas` deixou de ler `leads`/`lead_mensagens`, mas as duas seguem lidas pelo app (`grep` da regra abaixo não volta vazio). Nenhuma migração de drop pendente.
- **Lista de morte — o que fica, e até quando:**
  - `ops.volta_filial_20261020`: volta do principal por loja, apagar a partir de 03/11;
  - **Chaves `mid:` em `ops.webhook_recebidos`:** cada uma vive 60 s (a própria `webhook_mid_novo` apaga as vencidas); nada a limpar à mão;
  - **Volta da noite de 22/10:** `supabase/scripts/volta/volta-corrida-identidade.sql` e `D:\Nexus-Copia\noite\volta-v-leads-nao-lidas.sql` — guardar até a próxima limpeza; a fusão de dados não volta;
  - **Redirects 308 das ferramentas da Etapa 0 (`next.config.ts`), no ar desde 21/10 19:03: REMOVER EM 21/11/2026** — `/simular-parcela` → `/orcamentos/parcela`, `/check-imei` → `/estoque/imei`, `/consulta-fipe` → `/avaliacoes/fipe` (2.4). Depois de 21/11, link salvo antigo cai no 404. (Os 308 dos duplicados da 2.3 e de todo o `/admin/*` saíram antes do prazo, em 22/10 — decisão do Lucas; o `/admin` dá 404.);
  - pedido de teste nº 1 em `modulo_pedidos` (JM, `/agenda`, smoke (e) de 21/10 19:07): atender ou apagar pelo superadmin — **ainda lá em 22/10** (o recusar do superadmin apaga e registra em `superadmin_logs`);
  - **Mapa `LEGADO_ADMIN` do `proxy.ts` (endereços de antes do /admin, até 21/08):** fica. `/canais` é o `redirect_uri` registrado no app da Meta e tem de continuar levando a Integrações;
  - **`/api/metas` e `/api/ranking/metas`: ficam.** Gravam em tabelas diferentes (`metas_comissoes` × `metas`). Critério para sair: **unificar na tela de metas, fase F** — uma tabela, uma rota (decisão do Lucas, 21/10);
  - ~89 índices nunca usados que cobrem FK: ficam.
- **Para o módulo Vendas (anotado em 21/10, decisão do Lucas):**
  - **Lançar custo em venda já feita:** não existe tela (só na encomenda). O custo nasce na unidade do estoque e o PDV copia para a venda; venda feita sem custo fica sem lucro para sempre. Fica para o módulo Vendas.
  - **Defeito do PDV — canal "encomenda":** 34 das 37 vendas dos últimos 12 meses da JM estão com `canal_venda = 'encomenda'` (na cópia), e o donut "Vendas por canal" do painel mostra "encomenda 100%". Encomenda é tipo de venda, não canal: o PDV grava o lugar errado. O painel mostra como está até o módulo Vendas corrigir a origem.
  - **Visão geral com faturamento R$ 0,00 × painel:** a Visão geral (o antigo `/admin`, hoje `/visao-geral` em Insights) mostra "Faturamento no mês R$ 0,00 · 0 vendas concluídas" enquanto o painel mostra R$ 122.262,00 em 15 vendas no mesmo mês (cópia, 21/10). Já era assim antes da navegação nova (foto `navegacao-antes-3-admin.png`): a Visão geral não lê pelo `lib/painel/metricas.ts`. Fica para o módulo Vendas (anotado em 21/10, decisão do Lucas).
- **Para o módulo Estoque (anotado em 21/10, decisão do Lucas):**
  - **"Nova marca" leva a Configurações sem cadastro:** no Catálogo, aba Marcas, o botão "Nova marca" abre Configurações (antes `/admin/configuracoes`, hoje `/configuracoes`), onde não existe cadastro de marca — o botão não leva a lugar nenhum útil. Defeito anterior à navegação nova.
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

## Noite de 22/10/2026 (depois das 18h, loja fechada, IOwait abaixo de 20%)

**Prompt das 18h:** "executar a seção Noite de 22/10/2026 do 05, itens 1 a 7, na ordem" (decisão do Lucas, 22/10). Resultado e tempo de cada item antes do seguinte; qualquer falha = parar e avisar.

Migrações pelo `apply_migration` do MCP, uma por vez, com `GET /rest/v1/` (anon) respondendo e nenhum 5xx entre elas.

**O repositório continua recriando a produção do zero:** nenhuma migração vai para a produção sem estar antes na `main` local, e os arquivos entram na `main` na mesma ordem em que são aplicados (`20261023000100` → `20261023000200`). Assim `supabase start` num banco limpo segue chegando ao mesmo estado da produção. O push da `main` (item 7) leva as duas branches e o commit de docs por cima.

1. **View de não lidas** — merge da `fix/nao-lidas-core` (`9fb16f4`) na `main` local, com gate completo (tsc, testes, verificador, núcleo, avisos, check-views, build; next dev e Edge do Playwright encerrados); depois aplicar `20261023000100_v_leads_nao_lidas_core.sql` **do arquivo que está na `main`**. Conferir: mesmas colunas e tipos, `security_invoker`, grants mantidos; abrir `/leads` com o modal.
2. **Corrida de identidade** — merge da `fix/corrida-identidade` (`7593932`) na `main` local, com gate completo; depois aplicar `20261023000200_corrida_identidade.sql` do arquivo da `main`.
3. **Edge `webhook-leads` republicada** com o `index.ts` e o `reenvio.ts` **da `main`** já com o merge do item 2 (a publicada em 22/10 era a versão 66, idêntica à `main` antes do merge — é a volta). Um Direct de teste do Lucas pelo Instagram: 1 lead, 1 mensagem.
4. **Conferências depois de aplicar:**
   - (a) anon 0 / authenticated 22 (funções do `public` executáveis);
   - (b) 6 eventos `negocio.fundido` e 3 linhas novas em `contato_fusoes` (6509/6510, 6528/6529, 6555/6556; herdados 617/983, 1777/3607, 4237/4301);
   - (c) `webhook_mid_novo` existe, só `service_role` executa;
   - (d) **sino × view de não lidas, só leitura** (pedido do Lucas, 22/10): na cópia, 4 leads divergem entre o contador `leads.msgs_nao_lidas` (o que o sino lê) e a `v_leads_nao_lidas` — **970, 2059, 2468 e 4542** — com as funções antigas ou novas e com a view antiga ou nova (não é desta noite). Conferir em produção, como dono da JM, depois do item 1 (com a view antiga cada leitura custa ~1,7 s): esses quatro e quantos outros. Consulta: a do sino em `supabase/testes/contratos_e_sino.sql`, lead a lead (`full join` da view com `leads where ativo and msgs_nao_lidas > 0`). **Se divergirem, anotar como item da Inbox única (item 2 da viagem): o sino novo lê `conversas` direto**, e o contador espelho sai junto com `lead_mensagens`.
5. **Volta**, se algo falhar sem conserto em 5 min: `supabase/scripts/volta/volta-corrida-identidade.sql` + Edge da main (versão 66); a view volta pela definição antiga (`pg_get_viewdef` de 22/10, guardada em `D:/Nexus-Copia/noite/volta-v-leads-nao-lidas.sql`). A fusão de dados não volta (registrada em `contato_fusoes` e `eventos`).
6. **Leitura, sem alteração nenhuma:**
   - (a) `pg_stat_activity` agrupado por `application_name` e `state`: quantas conexões de cada cliente (PostgREST, Realtime, Auth, Storage, pg_cron, MCP), quantas `idle` e há quanto tempo (`now() - state_change`), quantas `idle in transaction`;
   - (b) `max_connections` (`show max_connections`) contra o total em uso;
   - (c) quem entra pelo pooler e quem entra direto (`client_addr` / `application_name` do Supavisor contra os serviços internos);
   - (d) conexões ociosas: as mais antigas e de quem são;
   - (e) **memória e swap dos últimos 7 dias** pelo painel (Observability → Database, "Last 7 days": Memory usage, Swap, Memory commitment) — em 22/10 o painel marcava 1,72 GB comprometidos de 1,4 GB de capacidade ("Severe") e 653 MB de swap;
   - (f) **ZapIntel desde 21/10 19:03** (o deploy do ZapIntel lendo o core): chamadas, média e máximo por RPC com `scratchpad/saude/zapintel-delta.mjs`, contra `pgss-20261021-1650.json` (a última foto antes do deploy) e contra a base do dia (`pgss-20261022-0600.json`); `zapintel_resumo` por janela de foto.
   Só consultas de catálogo e a Q2 canônica do pgss (`D:\Nexus-Copia\saude\LEIA-ME-fotos.md`); nenhum log fora de janela de 15 min.
7. **Fechamento:**
   - 05: lista de morte (views que zeraram e a migração de drop pendente; os 308 do `/admin` com prazo 21/11; o que a noite mudou);
   - 06: seção do dia, com os números das Partes 0 e 1 (máquina, fotos de saúde, ZapIntel, Vercel/monitor), do deploy de dia da `feat/modulos` (11:13), e dos itens 1 a 6 desta noite;
   - commit de docs **por cima da `main`** que já tem os merges dos itens 1 e 2; push da `main` (leva as duas branches e os docs; a Vercel publica — conferir READY e `/api/saude` 200);
   - foto de saúde final (Q1, Q2, IOwait) e Docker fechado.

## Para a viagem (escrito em 22/10/2026 — NÃO executar sem o ok do Lucas pelo chat)

Ordem das próximas telas, na branch, cada uma lendo **só o core** e derrubando a sua view de compatibilidade. Tudo testado no Supabase local (`supabase start`, IDE fechado); **nenhum deploy e nenhuma migração em produção sem o ok do Lucas pelo chat**.

**0. ZERO-SEGMENTO** (antes de qualquer tela). Ponto de partida medido em 22/10 (`scratchpad/segmento-grep.md`): 520 ocorrências em app/, components/ e lib/ — **152 condicionais, 126 leituras, 40 textos e 202 comentários**; os 91 pontos "morre" do 03 deveriam ter saído com a Etapa 0 e não saíram. Desde 22/10 o build reprova segmento em código novo (`scripts/check-segmento.mjs`; exceções em `scripts/segmento-excecoes.json`, 88 arquivos, 720 ocorrências, a lista só encolhe). Eliminar pela classificação do inventário:
- (a) o que decide **tela ou funcionalidade** vira "módulo ligado" (`ligadosDaEmpresa` / `empresa_modulos`, core.modulo_ligado);
- (b) o que decide **campo** vira `campos_personalizados`;
- (c) o que decide **rótulo** vira `empresa_menu` / preset;
- (d) **telas que só existem para um segmento** — `/imoveis`, `/ranking`, cardápio, `/agendar`, `/menu`, `/imob`, feed de veículos — viram telas de módulo, visíveis quando o módulo está ligado para a empresa, qualquer que seja ela. **A Agenda perde qualquer dependência de segmento** e passa a funcionar para qualquer empresa, lendo o core; as telas que hoje só existem para imobiliária/saúde viram a tela única do módulo (decisão do Lucas, 22/10: até lá o tile da Agenda fica "Em preparação", sem botão, e nenhum texto da Central fala em segmento). O mesmo vale para os outros módulos marcados `emPreparacao` em `core/modulos.ts`;
- (e) **"mesma rota, tela diferente"** — `/dashboard`, `/relatorios`, `/clientes`, `/financeiro`, `/entrar`, `/api/match` — vira uma tela só, com seções condicionadas a módulo;
- (f) `lib/segmentos.ts` e `app/superadmin/segmentos` morrem; o preset de onboarding é o único lugar que conhece a palavra, lido uma vez no `/register`; os 202 comentários também saem.
- Ao fim, a lista de exceções do check-segmento fica só com `presets_onboarding` e `register`.

**1. Card do lead com campos personalizados** — derruba a view `leads`. **Resolve pela raiz o pico de 72% de IOwait** (21/10 19:16): a abertura de `/leads?lead=` lê a lista inteira pela view e a `v_leads_nao_lidas` (2,05 s e ~1,2 GB de blocos por abertura na cópia: o planejador estima 1 linha onde há 11 mil e cruza 19 milhões de pares). Proposta medida e NÃO aplicada (`scratchpad/leads/proposta-nao-lidas.sql`): não lidas contadas sobre `mensagens` + principal por contato e loja (DISTINCT ON, como os helpers do ZapIntel) — 76 ms, resultado idêntico (916 leads, 0 diferenças). Pode sair antes do card, como migração própria, se o pico voltar.

**2. Inbox única** WhatsApp + Instagram + Messenger — derruba `lead_mensagens` e o sino antigo.
- **O sino novo lê `conversas` direto** (decisão do Lucas, 22/10). Motivo medido na noite de 22/10 (item 4d, só leitura, empresa 1): o contador espelho `leads.msgs_nao_lidas` (o que o sino lê hoje) e a `v_leads_nao_lidas` divergem em **8 de 1.278 leads** — 970 (view 87 / sino 65), 2059 (20/10), 2468 (14/—), 3982 (18/—), 4542 (39/57), 5714 (34/56), 6314 (—/14), 6339 (—/10). Os pares (2059 com 6339, por exemplo) indicam contatos com negócio nas duas lojas: a view e o contador repartem as mensagens entre os negócios de jeitos diferentes. Na cópia, os mesmos quatro primeiros já divergiam com as funções e a view antigas — não veio da noite de 22/10. O contador espelho sai junto com `lead_mensagens`.

**3. "Automatize" no funil** — cadências por etapa.

**Etapa Plataforma** (etapa 8 do 02-COMPARACAO-E-PLANO): **monitor de disponibilidade criado de propósito, apontando para /api/saude, com alerta para o Matheus.** Origem (22/10/2026): o único monitor era o 10350616 do Sentry ("Uptime Monitoring for https://crm-saas-beta.vercel.app", projeto `nexus-crm`, sem dono, criado pelo próprio Sentry — o Lucas nunca criou monitor), batendo em `GET /` a cada 60 s (`SentryUptimeBot/1.0`, EUA): ~1.440 chamadas/dia, ~72 s de CPU/dia na Vercel (36 s em 12 h, 55% da CPU do projeto) e uma leitura de `planos_config` no Supabase por chamada. Decisão do Lucas: desativar (status disabled, sem apagar, para manter o histórico). Desativado pelo Lucas no painel do Sentry às ~07:50 de 22/10 (a API do Sentry devolveu 500 duas vezes pelo MCP); último `GET /` do SentryUptimeBot no log da Vercel às 07:49:20, nenhum de 07:50 a 07:54. Hoje o CRM fica SEM monitor de disponibilidade até esta etapa.

**Primeira migração da viagem:** `modulo_pedidos` ganha `status` (`pendente`/`atendido`/`recusado`) e o "Recusar" do superadmin deixa de apagar (decisão do Lucas, 22/10; até lá recusar apaga e registra em `superadmin_logs`). **Junto, `empresa_segredos`** (decisão do Lucas, 22/10 à noite): token de portal e do site cifrado por empresa, gerado na hora em que o módulo Imóveis é instalado (Central de Módulos ou atendimento de pedido no superadmin), lido por `lib/portal-token.ts`; RLS fechada, só `service_role`. Pronta e testada no Supabase local na branch; aplicação só com o ok do Lucas. Até lá nenhuma empresa tem token de portal e as rotas de portal e de site respondem 401 (desde 22/10 só aceitam `Authorization: Bearer`).

## Supabase local (`supabase start`) — desde 21/10/2026

- **O que é:** Docker Desktop + `npx supabase start` na raiz do repo sobe Postgres, Auth, PostgREST, Storage e Realtime locais e aplica `supabase/migrations` num banco limpo. Desde 21/10 o resultado é **igual à produção** no `public` (103 tabelas, 46 views, 375 índices, 179 políticas, 71 gatilhos, RLS, 82 funções ignorando ``, EXECUTE, 422 grants de tabela e 12 por coluna) e fora dele (5 buckets, 13 políticas de storage, a de `realtime.messages`, publicação com 7 tabelas, 2 jobs do cron, `ops`, extensões, event triggers). Comparação feita por catálogo, sem dado. **Desatualizada desde a noite de 21/10:** a produção passou a 101 tabelas, 45 views e 86 funções (Etapa 0 + ZapIntel); refazer a comparação antes do próximo uso.
- **Para poupar memória:** `npx supabase start -x imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. Portas padrão 543xx: não sobe junto com o PostgREST/gateway da cópia (54322/54323). Desligar com `npx supabase stop --no-backup`; a VM do Docker só devolve a memória fechando o Docker Desktop.
- **Dados para teste:** `pg_dump --data-only --disable-triggers -n public` da cópia (sem as tabelas que já saíram) + `auth.users` à parte, carregados como `supabase_admin` (com `on_auth_user_created` desligado durante a carga). JWT de teste: HS256 com o segredo local que o `supabase start` imprime.
- **⚠ NUNCA `supabase link` + `supabase db push` (ou `migration repair`) contra a produção.** O histórico de migrações da produção guarda o horário em que o MCP aplicou cada uma, não o nome do arquivo; a CLI acharia todas pendentes. Migração em produção continua pelo `apply_migration` do MCP.
- **Por que valeu:** pegou antes do deploy a troca de texto da `20261021003500` que não casava com CRLF (o psql do Windows mascarava) e o `check-views` que quebraria o build com SQL dinâmico.

## Navegação nova (branch `feat/navegacao`, depois do deploy de 21/10)

> **O deploy da noite de 21/10 sai do `deploy/noite-20261021` (= `ef06a07`), não da ponta da branch.** Os commits da navegação ficam por cima e sobem num deploy próprio.

### A.1 — Menu em grupos com verbo

- **O que muda:** a sidebar (e a gaveta do celular) deixa de ser uma lista corrida e passa a ter até 8 grupos — Início, Comunicação, Pipeline, Vendas, Estoque, Pós-venda, Automações, Insights. Grupo de um item só vira o próprio item (sem gaveta). Grupos abrem e fecham; o grupo da tela atual fica sempre aberto; o menu inteiro recolhe para um trilho de ícones (botão ao lado do logo). Rodapé fixo: Configurações (por enquanto `/admin`, só dono/admin), Ajuda (abre o assistente), Notificações (abre o painel do sino do topo, com o ponto aceso quando há não lidas) e a conta (nome com a ausência, sair). O estado (recolhido, grupos fechados) fica no navegador (`nexus_menu_v1`).
- **O que NÃO muda:** quais itens aparecem, rótulos, cadeados e ordem — tudo continua saindo de `resolverMenuPlano` (empresa_modulos, empresa_menu, presets). `resolverMenuAgrupado` só reparte a lista final. Dentro do grupo, a ordem é a da lista; os grupos aparecem na ordem do primeiro item de cada um, então a ordem arrastada em "Menu do CRM" continua mandando. Módulo desligado não aparece (não está na lista).
- **Teste:** `npx tsx scripts/comparar-menu-agrupado.mts <menu-core.json>` contra a foto da cópia (`supabase/testes/menu_foto_core.sql`): **15/15 iguais** (JM lojas 3 e 6 + Preview loja 1, × dono, admin, vendedor, técnico, superadmin) — mesmos itens, mesma ordem relativa, no máximo 9 entradas. `tests/menu-agrupado.test.ts` faz o mesmo para todos os segmentos do código (imobiliária, saúde, food, veículos) e confere que todo item do catálogo tem grupo.
- **Como fica a JM (todos os papéis):** Início [Dashboard, Tarefas] · Chat · Pipeline [Leads, Clientes] · Vendas [Orçamentos, PDV, Histórico] · Estoque [Estoque, Produtos] — 10 itens em 5 entradas.

| Tela | Grupo antigo (catálogo, sem cabeçalho desde 20/08) | Grupo novo |
|---|---|---|
| Dashboard, Tarefas, Agenda | Hoje | Início |
| Chat | Hoje | Comunicação |
| Leads, Clientes, Fila do dia, Gestão de Leads | Comercial | Pipeline |
| Orçamentos, Propostas | Comercial | Vendas |
| PDV, Histórico, Financiamento | Operação | Vendas |
| Avaliações (veículos) | Veículos | Vendas |
| Cozinha (KDS) | Food | Vendas |
| Estoque, Produtos, Compras | Operação | Estoque |
| Imóveis | Imóveis | Estoque |
| Cardápio | Food | Estoque |
| Garantia, Assistência | Operação | Pós-venda |
| Executivo, Relatórios, Financeiro | Gestão | Insights |
| Metas e Ranking (extra da imobiliária) | Gestão | Insights |
| Simular parcela, Check IMEI, Consulta FIPE | — (ferramentas, fora do menu desde a etapa 0) | — |
| Extra de segmento sem grupo no mapa | o que ele declarar | pelo grupo antigo: Hoje→Início, Comercial→Pipeline, Operação/Veículos/Food→Vendas, Imóveis→Estoque, Gestão→Insights |

Automações não tem item na A.1 (as telas de automação ainda estão no `/admin`); o grupo some enquanto estiver vazio.

### A.2 — Configurações numa tela, o /admin fora

- **O que muda:** o /admin (19 itens) e as 12 abas de /admin/configuracoes viram **uma tela**, `/configuracoes`, dentro do CRM, com menu lateral próprio em 4 seções. O menu principal recolhe sozinho em trilho ali (abrir vale só ali). Cada item é a tela de antes, com o componente de antes (as abas: `ConfiguracoesView` com `aba` fixa, sem a barra). Nada de funcionalidade nova. Decisões do Lucas (21/10): Perfil e IA só com o que existe; leituras do /admin em Insights; motor de vendas dividido entre Automações (menu) e Área de trabalho.
- **Quem vê:** Perfil é de todo mundo (o "Configurações" do rodapé agora aparece para todos); o resto só dono/admin — guarda no layout dos grupos `configuracoes/(admin)` e `(gestao)`, como o layout do /admin fazia (várias telas não conferem o papel sozinhas). Seção sem item não aparece.
- **Itens novos no menu principal (só dono/admin):** Insights ganha Visão geral (`/visao-geral`), Conversão (`/conversao`), Meta da empresa (`/metas`); Automações ganha Cadências (`/cadencias`), Distribuição (`/distribuicao`), Lead scoring (`/scoring`), Modelos (`/modelos`), Respostas e assinatura (`/respostas`), Gatilhos (`/automacoes`). Marcados `sempreLiberado` (o /admin não dependia do opt-in do segmento nem da trava) e `donoNaoOculta` (o /admin não se ocultava). Relatórios e Financeiro também ganharam `donoNaoOculta`: a JM os tinha ocultado do menu do CRM e chegava neles só pelo /admin. A tela Menu do CRM não lista esses itens (o botão não faria nada). O ocultar do superadmin e as permissões do papel continuam valendo.
- **Teste:** `MSYS_NO_PATHCONV=1 npx tsx scripts/comparar-menu-agrupado.mts <menu-core.json> --foto=<menu-a1.json> --novos=...` (a foto é a lista de cada combinação gravada com o lib da A.1, commit `b82fe19`, por `--gravar`). Sem `--novos`: 9 de 15 diferentes — dono, admin e superadmin nas 3 lojas; **vendedor e técnico idênticos**. Com a diferença declarada: 15/15. **Diferença esperada:** JM (lojas 3 e 6) +11 itens para dono/admin/superadmin (Relatórios, Financeiro, Visão geral, Conversão, Meta da empresa, Cadências, Distribuição, Lead scoring, Modelos, Respostas e assinatura, Gatilhos; 10 → 21 itens em 7 entradas); Preview +9 (já tinha Relatórios e Financeiro; 17 → 26 itens em 8 entradas).

| Antes | Agora |
|---|---|
| `/admin` (Visão geral) | `/visao-geral` — Insights |
| `/admin/conversao`, `/admin/metas` | `/conversao`, `/metas` — Insights |
| `/admin/cadencias`, `/admin/distribuicao`, `/admin/scoring`, `/admin/modelos` | `/cadencias`, `/distribuicao`, `/scoring`, `/modelos` — Automações |
| `/admin/configuracoes?aba=automacoes` | `/automacoes` (Gatilhos) — Automações |
| `/admin/configuracoes?aba=modelos` | `/respostas` (Respostas e assinatura) — Automações |
| `/admin/configuracoes?aba=notificacoes` | `/configuracoes/perfil` — Perfil (com a Ausência) |
| `/admin/empresa`, `/admin/filiais`, `/admin/aparencia`, `/admin/meu-menu` | `/configuracoes/empresa`, `/lojas`, `/aparencia`, `/menu` — Área de trabalho › Empresa |
| `/admin/equipe`, `/admin/permissoes` | `/configuracoes/usuarios`, `/permissoes` — Área de trabalho › Usuários |
| `/admin/funil`; abas `funis`, `sla`, `motivos`, `horario` (+ `agendamento` da saúde) | `/configuracoes/funil` (Etapas do funil), `/funis`, `/sla`, `/motivos`, `/horario`, `/agendamento` — Área de trabalho › Vendas e atendimento |
| abas `pagamentos`, `taxas`, `troca`, `contrato`, `dados` (+ `cardapio` do food); `/admin/contrato` | `/configuracoes/pagamentos`, `/taxas`, `/troca`, `/contrato`, `/dados`, `/cardapio`; `/configuracoes/documentos` — Área de trabalho › Loja |
| `/admin/planos` (+ `/sucesso`) | `/configuracoes/faturamento` (+ `/sucesso`) — Área de trabalho › Faturamento |
| (atalho do ZapIntel no /admin) | IA › ZapIntel (só com o add-on ligado) |
| `/admin/integracoes`, `/admin/canais`; abas `portais`/`veiculos-portais` | `/configuracoes/integracoes`, `/configuracoes/portais` — Integrações e canais |
| CRM antigo `/canais`, `/funil`, `/meu-menu`, `/permissoes`, `/aparencia`, `/empresa`, `/planos`, `/equipe` (proxy) | direto para o destino novo (antes passavam pelo /admin) |

- **Não existe hoje e ficou de fora** (sem funcionalidade nova): idioma, trocar senha, configuração do assistente para o lojista, "formatos" (data/moeda). Dois defeitos antigos achados no caminho foram anotados para os módulos Vendas e Estoque (seção "Depois do corte").
- **No deploy:** (1) os links que saem do sistema já apontam para o endereço novo — Stripe (`success_url`, `cancel_url`, `return_url` do portal), retorno do Instagram; sessão de Stripe aberta antes do deploy volta pelo 308 de `/admin/planos/sucesso`, com o `session_id`. (2) O `redirect_uri` da Meta é `/canais`: o proxy troca só o caminho, a `?code=` passa (testado: `/canais?code=` → `/configuracoes/integracoes?code=`). (3) Smoke: abrir Configurações como dono e como vendedor (vendedor só vê Perfil), uma seção de cada grupo, `/admin` → Visão geral, `/admin/configuracoes?aba=horario` → Horário.


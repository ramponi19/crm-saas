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
  - **Deploy de aplicação da `feat/modulos` (`40bf3a4`, 11:13, sem migração):** menu em grupos, Configurações numa tela, Central de Módulos, check-segmento no build.
  - **Todos os 308 da Etapa 0 e do `/admin` saíram antes de 21/11** (decisão do Lucas, 22/10 à noite): `/admin/*` e os duplicados da 2.3 (`/admin/relatorios`, `/admin/financeiro`, `?aba=integracoes`) em `fd605f8`; as ferramentas da 2.4 (`/simular-parcela`, `/check-imei`, `/consulta-fipe`) em `53cc73d` (em produção desde 22/10 22:03). Todos dão 404. Conferido em produção em 03/11: as três respondem 307 para `/login`, sem 308, e o `redirects()` do `next.config.ts` roda antes do proxy. **Nada a remover em 21/11.** Fica só o mapa `LEGADO_ADMIN` do `proxy.ts` (abaixo). Os 307 do ZapIntel (`/zapintel/performance` etc., de 15/10) não são desta lista.
  - **`v_leads_nao_lidas` lê do core** (`20261023000100`, 18:14): `negocios` + `mensagens`, sem passar pelas views `leads` e `lead_mensagens` — elas perderam este leitor. Resultado idêntico em produção (1.278 leads, mesma assinatura); 52 ms no banco.
  - **Corrida de identidade** (`20261023000200`, 18:20): trava de identidade em `compat_leads_iud` e `mensagem_registrar`; `core_negocio_do_canal` com 7 parâmetros (os chamadores de 4 e 5 seguem valendo) e origem no negócio novo; `webhook_mid_novo`; 6 negócios fundidos (3 pares gêmeos de 20–21/10 e 3 herdados do corte). Edge `webhook-leads` versão 67 (18:20): descarta a segunda entrega do mesmo Direct — confirmado no Direct de teste das 18:48.
  - **Views de compatibilidade que zeraram leitor hoje: nenhuma.** A `v_leads_nao_lidas` deixou de ler `leads`/`lead_mensagens`, mas as duas seguem lidas pelo app (`grep` da regra abaixo não volta vazio). Nenhuma migração de drop pendente.
- **O que mudou em 03/11 à noite (card do lead, `4eb5098`, só app; detalhe na seção 15 do 06):** o card lê e grava o core por `/api/leads/[id]/card`, sem a view `leads`; fusão de contatos com desfazer pela foto em `contato_fusoes.movido._desfazer` (fusão anterior a 03/11 não tem foto). `from('leads')`: 93 leituras em 52 arquivos — a view não sai ainda.
- **O que mudou em 03/11 (zero-segmento; loja aberta, com o ok do Lucas; detalhe na seção 14 do 06):**
  - **Migração `20261029000100_presets_completos`** (só dados: 8 `UPDATE` em `presets_onboarding` + 1 `INSERT … ON CONFLICT` em `empresa_menu`; aplicada pelo MCP às 14:59, versão `20261103175901`): cada preset passa a ter tudo com que a empresa nasce (habilitados já mesclados, rótulos, vocabulário, tela inicial, funil, campos, nome do cadastro), sem `hidden_hrefs` — ocultar é só de `empresa_menu`; as duas empresas (1 e 5) ganharam `empresa_menu.itens.base`, camadas `dono`/`superadmin` intactas.
  - **Código `1ea2281`** (46 commits da `feat/zero-segmento`, fast-forward sobre `53cc73d`; READY 15:03): `presets_onboarding` só é lido no `/register` e nas ferramentas de preset do superadmin; o app lê a empresa (`empresa_menu` + `empresa_modulos`); capacidades e painéis do card vêm do módulo ligado (manifesto `core/modulos.ts`); `/superadmin/segmentos` → `/superadmin/presets` (404 na antiga); "Trocar segmento" saiu da ficha; `lib/segmentos.ts` apagado.
  - **Segmento no código: zero condicionais** (152/152 caíram). A palavra fica em 14 arquivos, 36 ocorrências (`scripts/segmento-excecoes.json`): `register` 2, `presets_onboarding` 2 (tela `/superadmin/presets`), `texto_publico` 10 (landing e descrição do site — decisão do Lucas, 03/11). A lista só encolhe.
- **Lista de morte — o que fica, e até quando:**
  - **Volta do zero-segmento** (`supabase/scripts/volta/volta-presets-completos.sql`, ida/volta/ida testada no local): guardar até a próxima limpeza; volta junto com o Instant Rollback para `53cc73d` (código novo sem `itens.base` cai para o núcleo; código velho com a volta fica como antes);
  - ~~`ops.volta_filial_20261020`~~ — **saiu na noite de 03/11** (`20261104000100`, 20:45). As 131 linhas estão em `dumps/2026-11-03-noite/volta_filial_20261020.json` (md5 `32f27e0c…`), e a volta é `restaurar-volta_filial_20261020.sql` no mesmo lugar. O script `volta-principal-por-loja.sql` sai na próxima limpeza;
  - **Voltas da noite de 03/11, guardadas até a próxima limpeza:**
    - `supabase/scripts/volta/volta-quadro-core.sql`, que apaga as 4 funções `quadro_*`;
    - `supabase/scripts/volta/volta-viagem-1.sql`, em três partes (A e C sozinhas, por causa do CONCURRENTLY);
    - `dumps/2026-11-04-manha/volta-contatos_update.sql`, com a política antiga lida da produção;
    - `dumps/2026-11-03-noite/restaurar-mensagens_filial_20261103.sql`, que devolve a loja das 64 mensagens alinhadas;
  - pedido **#2** em `modulo_pedidos` (empresa 5 Preview · Loja, `/imoveis`, smoke (i) da noite de 03/11): **fica como `recusado`**. É o histórico que a viagem 1 passou a guardar;
  - **Chaves `mid:` em `ops.webhook_recebidos`:** cada uma vive 60 s (a própria `webhook_mid_novo` apaga as vencidas); nada a limpar à mão;
  - **Volta da noite de 22/10:** `supabase/scripts/volta/volta-corrida-identidade.sql` e `D:\Nexus-Copia\noite\volta-v-leads-nao-lidas.sql` — guardar até a próxima limpeza; a fusão de dados não volta;
  - pedido de teste nº 1 em `modulo_pedidos` (JM, `/agenda`, smoke (e) de 21/10 19:07): **apagado em 22/10 à noite** pelo recusar do superadmin, com registro em `superadmin_logs` (0 pendentes; ver o 06);
  - **Mapa `LEGADO_ADMIN` do `proxy.ts` (endereços de antes do /admin, até 21/08):** fica. `/canais` é o `redirect_uri` registrado no app da Meta e tem de continuar levando a Integrações;
  - **`/api/metas` e `/api/ranking/metas`: ficam.** Gravam em tabelas diferentes (`metas_comissoes` × `metas`). Critério para sair: **unificar na tela de metas, fase F** — uma tabela, uma rota (decisão do Lucas, 21/10);
  - ~89 índices nunca usados que cobrem FK: ficam.
  - **Função `assistente_status_conversas(bigint)`** (a de 0,7 a 3,8 s; substituída em 10/11/2026 por `assistente_status_leads` + `assistente_leads_visiveis`, migração `20261110000300`): fica só enquanto o app de antes pode voltar. **Critério para sair (decisão do Lucas, 10/11): nenhum leitor no código e no banco** — `grep -rnE "assistente_status_conversas['\"]" app components lib hooks supabase/functions tools scripts` vazio (nenhuma chamada; as menções em comentário, docs, migrações antigas e testes e2e históricos não contam) **e** no banco nenhuma função, view ou job do `pg_cron` que a cite (`select proname from pg_proc where prosrc ilike '%assistente_status_conversas%'`, idem `pg_views.definition` e `cron.job.command`) **e** zero chamadas em `pg_stat_statements` desde o deploy. Confirmado isso, **cai na próxima migração** (`drop function public.assistente_status_conversas(bigint)`; a volta é o corpo de `20261105001200_leads_core_antes.sql`, item 6).
- **Para o módulo Vendas (anotado em 21/10, decisão do Lucas):**
  - **Lançar custo em venda já feita:** não existe tela (só na encomenda). O custo nasce na unidade do estoque e o PDV copia para a venda; venda feita sem custo fica sem lucro para sempre. Fica para o módulo Vendas.
  - **Defeito do PDV — canal "encomenda":** 34 das 37 vendas dos últimos 12 meses da JM estão com `canal_venda = 'encomenda'` (na cópia), e o donut "Vendas por canal" do painel mostra "encomenda 100%". Encomenda é tipo de venda, não canal: o PDV grava o lugar errado. O painel mostra como está até o módulo Vendas corrigir a origem.
  - **Visão geral com faturamento R$ 0,00 × painel:** a Visão geral (o antigo `/admin`, hoje `/visao-geral` em Insights) mostra "Faturamento no mês R$ 0,00 · 0 vendas concluídas" enquanto o painel mostra R$ 122.262,00 em 15 vendas no mesmo mês (cópia, 21/10). Já era assim antes da navegação nova (foto `navegacao-antes-3-admin.png`): a Visão geral não lê pelo `lib/painel/metricas.ts`. Fica para o módulo Vendas (anotado em 21/10, decisão do Lucas).
- **Para o módulo Estoque (anotado em 21/10, decisão do Lucas):**
  - **"Nova marca" leva a Configurações sem cadastro:** no Catálogo, aba Marcas, o botão "Nova marca" abre Configurações (antes `/admin/configuracoes`, hoje `/configuracoes`), onde não existe cadastro de marca — o botão não leva a lugar nenhum útil. Defeito anterior à navegação nova.
- **Toda view nova ou recriada leva `with (security_invoker = true)`.** O `create or replace view` sem a opção a apaga, e a view passa a ignorar a RLS (furo de 20/10, 2 min 44 s; ver o 06). O banco recusa (event trigger `exigir_security_invoker`) e o build também (`npm run check:views`).
- **Views de compatibilidade: FEITO em 05/11/2026 — zero.** As 41 caíram (seção "Último lote", mais abaixo); a Edge grava por identidade, os `compat_*` saíram e o realtime não tem ramo legado. O texto abaixo é o histórico de como foi.
- **Views de compatibilidade (histórico):** sair conforme as telas migram para o core.
  - Regra: uma view só cai quando `grep -rn "from('<nome>')" app components lib hooks supabase/functions` volta vazio.
  - Ordem natural: as 37 views simples de módulo (renomear as chamadas para `vendas_vendas`, `estoque_produtos` etc.) → `canais_conectados` → `clientes` → `lead_mensagens` → `leads`.
  - **View `leads`, com o critério inalterado** (`from('leads')` em `app components lib core hooks supabase/functions`):

    | data | leituras | arquivos | o que saiu |
    |---|---|---|---|
    | 03/11, antes do card | 107 | 58 | — |
    | 03/11, card do lead (`4eb5098`) | 93 | 52 | o card |
    | **03/11 à noite (`73e2404`)** | **92** | **51** | o quadro de /leads, que agora lê as funções `quadro_*` |

    A abertura de /leads ainda faz 3 leituras da view, todas da moldura e não do quadro: o sino (`topbar.tsx`, até 1.000 leads com não lidas, 53 KB bruto ou 7 KB comprimido), `notification-provider.tsx` e `limite-banner.tsx` (HEAD de contagem). Elas saem com a Inbox única (item 2 da viagem).
  - `v_leads_nao_lidas`: 0 leituras no app desde a noite de 03/11. A view continua existindo e cai na mesma migração que a `leads`.
  - Em `scripts/` sobram 7 leituras (ferramentas, fora do critério).
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
   - 05: lista de morte (views que zeraram e a migração de drop pendente; os 308 do `/admin` com prazo 21/11 — superado: todos saíram em 22/10, ver "O que mudou em 22/10"; o que a noite mudou);
   - 06: seção do dia, com os números das Partes 0 e 1 (máquina, fotos de saúde, ZapIntel, Vercel/monitor), do deploy de dia da `feat/modulos` (11:13), e dos itens 1 a 6 desta noite;
   - commit de docs **por cima da `main`** que já tem os merges dos itens 1 e 2; push da `main` (leva as duas branches e os docs; a Vercel publica — conferir READY e `/api/saude` 200);
   - foto de saúde final (Q1, Q2, IOwait) e Docker fechado.

## Noite de 03/11/2026 (loja fechada, terminou às 06h31 de 04/11)

**Prompt da noite (Lucas):** itens 1 a 6, migração uma por vez pelo MCP, cada uma só depois de estar na `main` local, com a API conferida entre elas. IOwait abaixo de 20% para começar e parada acima de 30%. Falha sem conserto em 5 min = parar, avisar e executar a volta do item 5. A `PAYMENT_ENCRYPTION_KEY` existe em Production na Vercel desde junho.

| item | horário | resultado | commit / migração |
|---|---|---|---|
| 1. DROP da `volta_filial` | 20h45 | 131 linhas em `dumps/2026-11-03-noite/`; tabela fora | `452ad74` · `20261104000100` |
| 2. Quadro no core | 20h49 | 4 funções `quadro_*` INVOKER, executáveis só por authenticated; anon 0 / authenticated 26 | `567fdf3` · `20261104000200` |
| 3. Viagem 1 | 20h56 | `empresa_segredos` sem leitura por anon nem authenticated; `modulo_pedidos.status`; índice `modulo_pedidos_pendente` válido (CONCURRENTLY, solto) | `73e2404` · `20261024000100` + `000110` |
| 4. Push | 20h59 | `682444f..73e2404`, **READY 20h59min48s** | — |
| 4. Smoke (a)–(k) | 21h00 → 06h29 | todos passaram (ver o 06, seção 16). Dois achados consertados durante o smoke, com ok do Lucas | ver abaixo |
| ↳ dado (b) | 21h05 | 64 mensagens não lidas alinhadas à loja da conversa; quadro e view antiga passaram a bater 100% | dump em `dumps/2026-11-03-noite/` |
| ↳ defeito (e) | 06h22–06h25 | justificativa da perda descartada em silêncio, defeito nascido em `682444f` | `4cacea6` · `20261104000300`, **READY 06h25min43s** |
| 5. Volta | — | não usada | — |
| 6. Fechamento | 06h31 | 05, 06, acompanhamento, foto de saúde final | commit de docs |

**O que a noite mudou:**
- `/leads` lê `quadro_contagens` + `quadro_pagina`, com 50 cartões por etapa, "carregar mais" por cursor e tempo real relendo por id. Não lê mais a view `leads` nem a `v_leads_nao_lidas`.
- A abertura ficou bem abaixo de 300 KB, sem contar o JS em cache: o documento tem 11 KB em Jaguariúna e 64 KB em Mogi, e o quadro tem 4 KB comprimido.
- O banco responde em 58–79 ms (Mogi, dono). Na tela, a primeira abertura depois do deploy levou ~1,5 s e a seguinte ~220 ms.
- `contatos_update` passou a ter o mesmo USING do `contatos_select`: quem vê o contato pode editá-lo, como era pela view.
- O mover e o card conferem as linhas gravadas. Um UPDATE de 0 linhas responde 403 com o motivo e nunca "ok" (`lib/linhas-afetadas.ts`).
- O mover grava a justificativa antes de mover o negócio.
- `empresa_segredos` existe; o token de portal nasce quando o Imóveis for instalado, e ele continua "em preparação".
- Recusar um pedido de módulo grava `recusado` e não apaga mais.

**Pendências que a noite deixou (código, nenhuma migração):**
- ~~**Pedido recusado some da tela.**~~ **Resolvido em 04/11, às 07h18** (`50fd6b4`, só app):
  - `/superadmin/pedidos` ganhou o cartão "Recusados", com quem pediu e quem recusou;
  - o texto "apaga" saiu;
  - a Central mostra a recusa do último pedido ao dono e oferece "Pedir de novo".
  
  Smoke na empresa 5, ver o 06, seção 17.
- **Os 134 UPDATE/DELETE/upsert que não conferem linhas** (cliente do usuário, 70 arquivos): a lista `lista-update-sem-contagem-20261104.txt` foi superada pela trava `check:gravacao` em 05/11 (06, seção 32) e saiu do repositório em 09/11. Pelo banco, só o `contatos` tinha o SELECT mais largo que o UPDATE. Nos outros, a política de escrita é de papel (admin/dono), e o risco é a tela deixar outro papel tentar. A regra para código novo é pedir `.select('id')` e passar por `nadaGravado()`.
- **`contatos_delete`** continua só pela loja do próprio contato, mais estreito que o SELECT. Hoje não há DELETE de contato pelo cliente do usuário (fusão e desfazer usam a service_role).

## 04/11/2026 de dia: Inbox única (`3e3b47d`, só app, loja aberta)

O Lucas deu o ok às 11h20. Ele faz parte do modo construção: deploy de app a qualquer hora, com IOwait abaixo de 20%. O IOwait estava em 29,4% às 11h23 e em 21% às 11h24, e o push esperou até 6,0% às 11h28. O push foi `3243508..3e3b47d` e ficou **READY às 11h32min10s**, conferido pelo status do GitHub e pelo deployment Production `3e3b47d`. Smoke com o Lucas das 11h33 às 11h50, no 06, seção 18. **Volta (não usada):** Instant Rollback para `3243508`.

**O que mudou:**
- **`/comunicacao` (Inbox única, grupo Comunicação, no núcleo do menu):** WhatsApp, Instagram e Messenger numa coluna só. Tem filtros de canal, não lidas, aguardando e responsável, e busca por nome, telefone ou @instagram. A conversa abre com 200 mensagens e "anteriores". Dá para responder pela Edge, com anexo e modelo de 24 h, e a nota interna vai para `eventos` (`conversa.nota`). Pela conversa também se cria tarefa e se abre o card. A conversa só fica lida com a aba à vista, e "também em <loja>" usa `/api/comunicacao/[id]/lojas`.
- **Tempo real:** um canal por aba, filtrado pela empresa (`components/layout/tempo-real-empresa.tsx`). Ele alimenta o sino, o título da aba, os avisos e a Inbox. O topbar e o `notification-provider` perderam o canal próprio e a leitura da view `leads`, e o `lib/realtime/tabelas.ts` foi apagado. O chat interno ainda tem canal próprio (`chat_nao_lidas`).
- **O sino conta conversas** com `nao_lidas > 0`, e não mais mensagens.
- **`lib/envio-edge.ts`:** o envio saiu do `lead-modal` para ser usado também pela Inbox, sem mudar o comportamento.
- **`limite-banner` conta negócios:** 2.922, que bate com a view.

**Grep das views** (critério deste runbook, `git grep` sobre `HEAD` em app, components, lib, core, hooks e supabase/functions):
- `from('leads')`: 86 leituras em 47 arquivos (eram 92 em 51);
- `from('lead_mensagens')`: 23 em 9 arquivos (eram 24 em 10). São 8 na Edge `webhook-leads`, 5 em `lib/storage/retencao.ts`, 3 no assistente, 2 no `lead-modal` e 1 em cada um destes: `cliente-modal-imob`, `api/imob/[slug]/lead`, `api/portais/[slug]/leads`, `lib/esteira.ts` e `lib/zapintel/conversas.ts`.

Nenhuma das duas zerou, então não há migração de drop.

**Para as 18h (decisão do Lucas, 04/11):**
1. **`feat/inbox-notas`** (`696d9d1`): nota interna editável e apagável só pelo autor.
   - Migração `20261104000400_eventos_nota_do_autor.sql`; volta em `dumps/2026-11-04-manha/volta-eventos-notas.sql`.
   - Antes das 18h: teste no Supabase local e gate completo.
   - Ordem: migração pelo MCP → conferir a API → merge na `main` → deploy → smoke.
   - O smoke edita e apaga a nota 290 (conversa 1941), criada no smoke da Inbox.
2. **As 310 mensagens lidas com loja trocada** (as 4 conversas de 03/11):
   - antes, o dump delas e um script de volta;
   - depois, `UPDATE mensagens set filial_id = <loja da conversa>`;
   - por fim, conferir que sino, não lidas e quadro não mudam. São mensagens lidas, então não devem mudar.

**Próximo trabalho, depois das notas:** a Edge `webhook-leads` deixa de ler `lead_mensagens`.
- As 8 leituras passam para `conversas`, `mensagens` e `mensagem_registrar`.
- Teste no local, depois republicar a Edge e fazer smoke de Direct e de WhatsApp.

**Os 134 UPDATE sem conferir linhas**: resolvidos pela trava `check:gravacao` (05/11; exceções em `scripts/gravacao-excecoes.json`).
- Primeiro os que estão em fluxo de usuário: card, quadro, inbox, PDV e tarefa.
- Saem em lotes junto com as entregas, e a lista marca o que já foi feito.

## 04/11/2026 à tarde: lotes 1 e 2, mensagens, Edge v68 e notas, com a loja aberta e o ok do Lucas

**Pedido do Lucas:** "fazemos tudo agora", um item por vez, com a API conferida entre cada um. A migração das notas só entraria se o IOwait estivesse abaixo de 10% na hora; se não, ficaria para as 18h. Todos os passos de produção passaram. O detalhe e os números estão no 06, seção 19.

| item | horário | resultado | commit / migração / versão |
|---|---|---|---|
| 1. Lotes 1 e 2 dos 134 UPDATE (só app) | push 13h54 (IOwait 6,1%), **READY 13h57min29s** | smoke de tarefa, PDV e encomenda ok | `7f7cee4` + `525ff57` |
| 2. Mensagens com loja trocada | dump 14h07; transação 14h13min07s | **1.341** alinhadas (310 + 1.031, 49 conversas); 4 visões iguais | dados (`dumps/2026-11-04-noite/`) |
| 3. Edge sem a view + banco fora vira 500 | push 14h28 (READY 14h31min02s); Edge **v68** às 14h31min43s | Direct e WhatsApp do Lucas ok; 0 erro no log | `7d50e56` + `51c50aa` |
| 4. Notas editáveis pelo autor | migração 14h49min49s (IOwait 6,1%); push 14h50, **READY 14h52min42s** | editar e apagar a nota 290; vendedor 0/0 | `b189647` · `20261104000400` (versão `20261104174949`) |

**O que mudou:**
- **Tarefa, card e PDV conferem as linhas gravadas.** Em vez de "ok" calado, o 0 linhas agora avisa nestes casos:
  - concluir ou excluir uma tarefa que sumiu;
  - remover uma chamada;
  - cotação de troca já usada por outra venda;
  - volta de venda que falhou e não desfez tudo;
  - desfazer de encomenda que deixou sobra;
  - pedido que já estava marcado (mantém a data);
  - ajuste de encomenda que não gravou.
  
  Na lista dos 134 ficam 13 FEITO e 5 FICA, com o motivo.
- **Mensagens:** nenhuma mensagem fica mais em loja diferente da conversa (0 no banco).
- **Edge `webhook-leads` v68:**
  - não lê mais a view `lead_mensagens`;
  - a leitura do Direct vai pela identidade do canal e só pelas mensagens daquele canal;
  - banco fora na gravação (mensagem, anúncio, eco, histórico, lead) responde 500;
  - o pacote grande grava o hash de 24 h só no fim. Antes de processar, ele pega uma trava de 60 s, e a reentrega que chega durante o processamento recebe 503 com `Retry-After: 60`.
- **`eventos`:** só a nota (`conversa.nota`) aceita UPDATE e DELETE, e só pelo autor. O INSERT de nota exige `por_usuario` igual ao usuário logado. O resto continua imutável.

**Grep das views** (`git grep` sobre a `main` `b189647`):
- `from('leads')`: 85 leituras em 47 arquivos (eram 86 em 47). A que saiu é a leitura do Direct na Edge.
- `from('lead_mensagens')`: 15 em 8 arquivos (eram 23 em 9). A Edge zerou.

Nenhuma das duas views zerou, então não há migração de drop. As 21 leituras que restam na Edge são todas da view `leads`.

**Voltas, guardadas até a próxima limpeza:**
- **App:** Instant Rollback, um passo por vez: `51c50aa` (antes das notas), `525ff57` (antes da Edge no repositório) e `0e4aa3c` (antes dos lotes).
- **Notas:** `dumps/2026-11-04-manha/volta-eventos-notas.sql`. Restaura as 3 políticas antigas, conferidas iguais à produção antes de aplicar.
- **Mensagens:** `dumps/2026-11-04-noite/restaurar-mensagens_filial_20261104.sql`, com trava por id e loja. O dump das 1.341 está em `mensagens_filial_20261104.json`, com md5 do banco `21eb30da…`.
- **Edge:**
  - republicar a v67 a partir de `D:\Nexus-Copia\inbox\ferramentas\noite-0411\volta-edge-v67\` (o `index.ts` e o `reenvio.ts`, idênticos ao commit `7593932`);
  - comando: `npx supabase functions deploy webhook-leads --project-ref guiuzbcqkvelqcuogxtd --use-api --no-verify-jwt --yes`, com os dois arquivos no lugar;
  - fica fora do repositório porque um `.ts` em `dumps/` entra no eslint e reprova o gate.

**Pendências que a tarde deixou:**
- **O Instagram não manda entrega nem leitura.** Nos últimos 30 dias, as 1.493 respostas de Instagram ficaram em "enviada", desde antes da v68. Os eventos de entrega e leitura do Direct não estão chegando, e o provável é a assinatura no app da Meta. A leitura do Direct pela identidade ficou provada só no local. Decisão do Lucas, porque é zona da Meta.
- **A Inbox mostra o cartão de anúncio como JSON cru.** É a mensagem `tipo = 'anuncio'`: o card do lead mostra o cartão, mas a `/comunicacao` não. É código, e vai num próximo lote.
- **Lote 2 sem e2e em dois caminhos:** a venda do PDV com cotação de troca e a volta da venda que falha. Ficaram com o gate, o verificador e a revisão. O e2e cobriu encomendas (local 11/11 e smoke na produção).
- **`usuarios.json` do local está desatualizado:** a Rayssa está inativa na produção. Na foto, a visão de Jaguariúna usou a Vanessa Amorim Volpato.

## 04/11/2026 15h: o "visto" do Instagram (`86cb640`, Edge v69)

- **Causa:** o app (objeto `instagram`) e as duas contas (canais 25 e 26) assinavam só `messages`. Por isso as 1.493 respostas de Instagram dos últimos 30 dias ficaram todas em "enviada".
- **Feito na Meta, com a autorização do Lucas:**
  - `POST /{app-id}/subscriptions`: o objeto `instagram` passou a ter `messages`, `messaging_postbacks` e `messaging_seen`;
  - `POST /me/subscribed_apps` nas duas contas: `messages` e `messaging_seen`.
- **Edge v69 (15h26min45s):** o visto do login do Instagram chega como `read.mid`, não como `watermark`. Ele vale até a hora daquela mensagem, só no canal do Instagram e pelo contato da identidade. O `watermark` continua valendo.
- **App:** a conta conectada daqui para frente já assina `messaging_seen` (`CAMPOS_CONTA_INSTAGRAM`). READY às 15h28min41s.
- **Regra:** o Instagram não manda "entregue". O máximo é enviada → lida.
- **Volta:** republicar a v68, que é o código de `b189647` (`git show b189647:supabase/functions/webhook-leads/…`). Na Meta, tirar `messaging_seen` das assinaturas é inofensivo.
- **Grep das views:** `leads` com 85 leituras em 47 arquivos e `lead_mensagens` com 15 em 8, sem mudança.

## 04/11/2026 15h51: lote 3 (`1e043c6` + `4e7c0b5`, só app)

- **Inbox:** a mensagem de anúncio (`tipo = 'anuncio'`) aparece com o mesmo cartão do card do lead, porque `AnuncioChat` virou `components/modules/conversa/anuncio-chat.tsx`. Nunca mais aparece JSON cru nem "Abrir arquivo". A prévia da lista diz "Veio de anúncio".
- **Agora conferem linhas:** automação (ligar, desligar e remover), salvar motivo de perda e ficha de F&I (status e excluir).
- **Ficam como estão:** os upserts de Configurações e do card, porque o upsert barrado pela RLS dá **erro** (conferido no local), e não 0 linhas calado. Na lista: 19 FEITO e 17 FICA.
- **PDV:** pagamento que não grava agora desfaz a venda. Antes, o erro do insert de `vendas_pagamentos` era ignorado, a venda fechava e o pagamento sumia.
- **e2e no local:**
  - lote 3, 4/4;
  - PDV, 14/14: venda com cotação de troca, volta completa quando o pagamento é recusado e aviso de volta incompleta;
  - o recurso para forçar as falhas foi tirar grants **só no local**, devolvidos no fim.
- **Gate:** 215 testes, verificador 576/5, build. IOwait 10% no push. **READY às 15h53min49s.**
- **Smoke:** o cartão de anúncio de hoje apareceu na conversa 1941, a tela de automações e o PDV abriram, e o Sentry está limpo.
- **Volta:** Instant Rollback para `1838510`.
- **Grep das views:** `leads` 85/47 e `lead_mensagens` 15/8.

## 04/11/2026 17h35: Automatize no funil (`68db6d0` + `40d2164`, Edge v70, 2 migrações, job do pg_cron)

- **Ordem do Lucas: 1 → 2 → 5 → 6, com o gate.**
  1. Migração `20261105000100_automatize` pelo MCP às 17h35, com IOwait de 2,63% às 17h34. O que ela faz:
     - `automacoes` ganha as ações `enviar_modelo` e `atribuir_responsavel`, mais `espera_dias` e `modelo_id`;
     - `contatos` ganha `opt_out_em`;
     - entra a fila `automacao_execucoes`, com RLS de leitura por empresa e loja;
     - entra `automacao_reservar(lote)`, que só a service_role executa;
     - `automacoes`, `cadencias` e `cadencia_passos` passam a ser lidas por todos e gravadas só por dono/admin.

     API ok.
  2. `20261105000200_pg_net` (pg_net 0.20.3 em `extensions`) às 17h36. API ok.
  3. Edge `webhook-leads` **v70** às 17h37, pelo worktree em `68db6d0`, com o caminho de serviço `send_template_automacao`:
     - sem credencial, ou com Bearer falso: 401;
     - `send`, `send_meta` e `send_template` sem corpo: 400, como antes;
     - GET de verificação com token errado: 403.
  4. Push `aa0fd45..68db6d0`: **READY às 17h40min54s**. As rotas novas sem login ou sem segredo dão 401.
- **Segredo:** `cron_secret` está no Vault desde 17h08, gravado pelo Lucas. Para conferir sem exibir, uma chamada `net.http_get` com o valor do Vault na rota do cron voltou 200, então ele é igual ao CRON_SECRET da Vercel. Não precisou trocar.
- **Job:** `automacoes-hora`, `17 * * * *` (jobid 4), lê o segredo do Vault na hora. O texto em `cron.job` não tem o segredo. A retenção segue às `0 7 * * *`. Volta: `select cron.unschedule('automacoes-hora');`.
- **Correção antes do smoke (`40d2164`):** a automação casava com a etapa só pelo `slug`, e o slug só é único **dentro** de um funil (`funil_etapas_funil_slug_key`). Uma automação de "novo" num funil dispararia em quem entra em "novo" de outro funil.
  - Agora o executor, o "saiu da etapa", o quadro e a criação usam `etapa_id` quando os dois lados têm.
  - Só o slug repetido, sem o id, é recusado (400).
  - Testes: e2e local 29/29 de novo, mais o cenário novo `automatize-slug-e2e.mjs`, 6/6.
  - Gate: 220 testes, verificador 586/5, build. IOwait 11% às 17h54. **READY às 17h56min36s.**
- **Smoke na produção** (funil 6 "TESTE Automatize (apagar)", só o negócio 7077 do contato 2552 do Lucas, criado pela tela do dono):
  - **tarefa na hora:** nasceu com `origem = 'automacao'` e o nome do lead;
  - **troca de responsável:** passou de JM Store para Matheus Rosa;
  - **esperar 1 dia:** ficou agendada para 05/11 às 17h59. Adiantada e com o cron rodado à mão, executou às 18h00min12s; a tarefa foi para o novo responsável e a rodada ficou em `eventos` (`automacoes.rodada`);
  - **pausar todas:** a tela mostra "Automações pausadas" e reentrar na etapa não agendou nada. Retomado;
  - **vendedor** (RLS como a Vanessa): vê as 3 automações; desligar, apagar e mudar cadência afetam 0 linhas; inserir dá erro de RLS.
- **Limpeza:** apagados o funil 6, as etapas 60/61, o negócio 7077, as 3 automações, as 3 execuções, as 2 tarefas e as 4 linhas de `negocio_historico`. Produção com 0 automações; contato 2552 intacto.
- **Primeira rodada automática:** às 18h17min00s, `succeeded`, rota 200, fila vazia (578 ms).
- **Rodada vazia não grava em `eventos`:** é uma linha por empresa que teve trabalho. A resposta de cada chamada fica em `net._http_response` (o pg_net limpa sozinho).
- **Falta:** o smoke de envio, quando a Meta aprovar o `retorno_atendimento` (Utility) e ele entrar em `modelos_mensagem` como `aprovado`. Só para o número do Lucas.
- **Voltas:**
  - app: Instant Rollback para `68db6d0`, ou para `aa0fd45` para tirar o Automatize inteiro;
  - Edge: republicar a v69, que é o código de `aa0fd45`;
  - banco: `cron.unschedule('automacoes-hora')`, depois `supabase/scripts/volta/volta-automatize.sql`, depois `drop extension pg_net`.
- **Grep das views:** `leads` 85/47 e `lead_mensagens` 15/8, sem mudança.

## Como nasce um módulo (regra permanente do Lucas, 04/11/2026)

**Toda funcionalidade fora do core nasce como módulo.** Preço e o que se vende à parte ficam para a etapa Plataforma. Até lá, "módulo" quer dizer ligar e desligar por empresa, não cobrança.

O **core** não se instala nem se tira: Dashboard, Leads/Funil, Clientes, Tarefas, Comunicação (Inbox), Insights, Automações e Configurações. O resto é módulo, e todo módulo novo passa por estes cinco pontos:

1. **Entrada no manifesto** (`core/modulos.ts`, `MODULOS`):
   - `chave`, que é a linha em `empresa_modulos`;
   - `href`, `nome`, `frase` (o que faz, numa frase do balcão) e `grupo`;
   - `requer`: as chaves dos módulos sem os quais este não funciona;
   - itens de menu, que nascem pelo `href` e pelo catálogo de `lib/menu.ts`, com o grupo em `GRUPO_DO_HREF`;
   - `abasConfiguracoes`: as seções de Configurações que o módulo traz;
   - `paineisDoLead`: os painéis no card do lead;
   - `capacidades`: o que ele liga nas telas dos outros;
   - `realtime`: as tabelas que as telas dele assinam por `postgres_changes`. Elas precisam estar na publicação `supabase_realtime`; ativar o módulo inclui a migração `alter publication supabase_realtime add table public.<tabela>` quando ela não estiver lá. Caso de hoje: o **KDS** (`pedidos`, fora da publicação desde 09/11/2026).
2. **Rotas e telas protegidas por "módulo ligado" no servidor.** A tela e a API conferem `empresa_modulos` (por `lib/empresa-config.ts` ou pela trava de rota do proxy). Esconder o menu não protege nada. Desde o item 5 desta lista, o build reprova a rota que não pertence ao core nem a um módulo, ou a tela de módulo sem a conferência (`scripts/check-modulos.mjs`, com uma lista de exceções que só encolhe).
3. **Tabelas com o prefixo do módulo** (`estoque_*`, `vendas_*`, `assistencia_*`, `avaliacao_*`, `financeiro_*`, `imoveis_*`). Nunca view de compatibilidade nova; toda view leva `security_invoker = true`.
4. **Vitrine quando desligado:** a rota mostra `/vitrine/<modulo>`, com o que o módulo faz e o botão de instalar ou pedir, em vez de redirecionar ou dar 404.
5. **Aparece na Central** (`/modulos`), no grupo do manifesto. Instalar liga junto o que ele `requer`, e desinstalar fica bloqueado enquanto outro módulo ligado depender dele.

## Datas e fuso horário (regra permanente do Lucas, 10/11/2026)

**Toda data passa pela `lib/datas.ts`, no fuso da empresa.** O servidor roda em UTC; a loja, no fuso dela; o navegador, no de quem abre. Até 09/11 isso dava: KPI "Hoje" zerando às 21h, hora da visita +3h, mês virando no dia 30 às 21h, CSV com um dia a menos (06, seção 37).

1. **O fuso da empresa** mora em `configuracoes_sistema`, chave `fuso` (`{"fuso": "<IANA>"}`), padrão `America/Sao_Paulo` quando não há linha. Sem coluna nova. O dono ou admin troca em Configurações → Horário (`/api/empresa/fuso`, que valida o nome).
2. **No servidor:** `fusoDaEmpresa(db, empresaId)` (`lib/fuso-empresa.ts`, uma leitura por requisição). **No navegador:** `useFuso()` (`components/fuso-provider.tsx`, nos layouts do painel e do ZapIntel). Página pública: o fuso da empresa da página, lido no servidor e passado à tela. Superadmin (várias empresas): `FUSO_PADRAO`.
3. **Na biblioteca:** "agora" (`agora`), "que dia é" (`diaNoFuso`, `mesNoFuso`), limites de período sempre `[início, fim)` (`inicioDoDia`, `periodo('hoje'|'7d'|'mes'…)`, `limitesDosDias`, `limitesDoMes`), dia + hora digitados para instante (`instanteLocal`), formatação (`formatarData`, `formatarHora`, `formatarDataHora`, `formatarNoFuso`), comparação de instantes (`mesmoInstante`, `chaveDoInstante`). Coluna `date` é DIA PURO: compara como `YYYY-MM-DD` e mostra com `formatarData`, nunca `new Date('YYYY-MM-DD')`.
4. **No banco:** função que corta por dia ou mês usa `at time zone public.empresa_fuso(<empresa>)`, lido uma vez por chamada (variável na plpgsql, CTE materializada na sql). Nunca `current_date`, `date_trunc` ou `::date` sem fuso.
5. **Trava no build:** `scripts/check-datas.mjs` (no `check` e no `build`) reprova `getDate`/`setHours`/`toDateString`, `toLocale…` de data sem `timeZone`, `toISOString()` cortado como dia, `new Date(ano, mês, …)`, o fuso escrito à mão (`'America/Sao_Paulo'`, `-03:00`) e, em migração a partir de 20261110, `date_trunc`/`current_date`/`::date` sem `at time zone`. Exceções em `scripts/datas-excecoes.json`, com motivo, numa lista que só encolhe — em 10/11 ela está **vazia**.

## Abas de smoke com a conta do Lucas (regra permanente do Lucas, 10/11/2026)

**Toda aba de smoke aberta com a conta do Lucas é fechada ao fim do teste** (`tabs_close` no navegador do app, ou fechar a janela do chrome-devtools). Aba esquecida não é inofensiva: as telas do ZapIntel ficam "ao vivo" e continuam consultando o banco a cada aviso, com a conta dele.

Em 09/11 a aba do smoke do ZapIntel ficou aberta das 20h40 às 21h25. Ela gerou quase todas as chamadas da foto Q2 de 1 hora e os dois estouros do dashboard (20h45 e 21h03), que foram lidos como "uso real da loja" até os logs da API mostrarem um só usuário e uma só sessão (06, seção 39).

1. **Ao terminar** o smoke: fechar cada aba aberta para ele, antes de tirar foto, contar eventos ou medir qualquer coisa.
2. **Antes de medir** uso real: conferir nos logs da API (janela ≤ 15 min, filtrada) que nenhuma chamada é da sessão do smoke.
3. Vale também para a regra do superadmin: sair da empresa impersonada ao fim de cada rodada.

## Troca de instância do banco (regra permanente do Lucas, 10/11/2026)

**Troca de instância (Compute and Disk) só com a loja fechada, prevendo até 40 min fora do ar.** A Supabase diz
"menos de 2 minutos"; a troca Nano → Small de 10/11 ficou **~36 min** fora (15:57–16:33, com a loja aberta). Nesse
tempo a Edge `webhook-leads` não grava nada (546/503/504) e o que a Meta não reentregar se perde.

1. **Janela:** loja fechada, sem deploy, com 40 min de folga antes de abrir. IOwait < 10% antes.
2. **Antes:** dump único (`tools/banco/dump-unico.ps1`) e a foto leve do "antes" (07, passo 4).
3. **Depois:** o checklist do 07 inteiro — são **4 jobs** do pg_cron (`automacoes-hora`, `zapintel-conversa-aquecer`,
   `retencao-diaria`, `lgpd-exportacoes-limpar`), não 3.
4. **Mensagens do buraco:** comparar o recebido por loja com o ritmo normal e listar para a equipe as conversas que
   estavam ativas antes da queda (06, seção 40).

## 04/11/2026 à noite: fase final das views — lotes 1 e 2 (15 views caídas, restam 26)

**Pedido do Lucas:** zerar as 41 views de compatibilidade em lotes: troca das leituras para as tabelas do core, e2e da tela, deploy do app e só então a migração de drop (DDL com IOwait abaixo de 10%), com a API conferida. Detalhe e números no 06, seção 23.

**O critério de "zerou" ficou mais largo** que o `grep from('<nome>')` da seção "Depois do corte". Uma view só cai com zero em todos estes:
- `from('<view>')` em app, components, lib, core, hooks, supabase/functions e scripts;
- **embed do PostgREST dentro do `select`** (`clientes(nome)`, `produtos!produto_id(nome)`). O PDV, o estoque, a garantia e a agenda usam muito. Na troca, o embed ganha alias e a chave do objeto fica igual (`produtos:estoque_produtos!produto_id(nome)`);
- **tipo** (`Tables<'view'>`), que quebraria na próxima geração dos tipos;
- **corpo de função SQL/plpgsql que cita a view.** Ele não entra no `pg_depend`: o `drop view` passa e a função quebra só na hora de rodar. Foi assim que apareceu a `fundir_clientes` no lote 2.

Ferramentas em `D:/Nexus-Copia/inbox/ferramentas/views/`: `inventario.mjs` (contagem por view, `--view=` e `--json`), `renomear.cjs` (troca from, embed com alias e tipo, preservando CRLF), `tirar-tipos.cjs` (tira a view de `types/`) e os e2e.

| lote | código no ar | migração | views que caíram |
|---|---|---|---|
| 1 | `43911d1`, READY 18h45min57s | `20261105000300` às 19h38min21s (versão `20261104223821`), IOwait 0,5% | `pre_vendas` (já sem leitor), `movimentacao_estoque`, `veiculo_dados`, `subcategorias_produtos`, `imei_consultas`, `payment_webhook_eventos`, `fipe_consultas`, `fipe_referencia` |
| 2 | `c9b2372`, READY 19h29min24s; `ebd95b7` (só a migração) | `20261105000400` às 19h41min15s (versão `20261104224115`) | `cobrancas`, `lancamentos_financeiros`, `taxas_pagamento`, `tenant_payment_config`, `troca_cotacoes`, `troca_precos`, `troca_regras` |

- **Funções do banco que passaram a ler a tabela (lote 2):**
  - `numerar_cotacao_troca`: a chave da trava continua `'troca_cotacoes:'||empresa`;
  - `refresh_status_atrasados`: sem chamador hoje;
  - **`fundir_clientes`**: 11 views de módulo, 19 trocas conferidas pelo próprio bloco `DO`. Nela ficam só `clientes`, `leads` e `lead_mensagens`.
- **Views no `public`:** eram 45, agora são 30. As 26 de compatibilidade que restam somam **493 leituras** (eram 562). O grep do critério antigo segue em `leads` 85/47 e `lead_mensagens` 15/8.
- **Tipos:** as 15 saíram de `types/database.gerado.ts` e `types/views-espelho.ts`, junto com as 4 relações que apontavam para elas. O `supabase gen types` da CLI atual mudou de formato: gera 11 mil linhas, contra as 6 mil de hoje. Por isso a retirada foi feita no arquivo atual, só com deleções.
- **Lista dos 134 UPDATE:** consertados a unidade do estoque (salvar e remover), o financeiro (editar, excluir, marcar pago), apagar orçamento, apagar cotação e salvar preço de troca (avulso e por família). Os dois upserts (config de pagamento e regras de troca) e o webhook (service_role) ficam como estão, com o motivo.
- **Voltas, guardadas até a próxima limpeza:**
  - `supabase/scripts/volta/volta-views-lote1.sql` e `volta-views-lote2.sql` recriam as views com os grants da produção. A ida/volta/ida foi conferida no local. As funções do lote 2 não voltam ao corpo antigo, porque lendo a tabela funcionam com ou sem as views.
  - App: Instant Rollback para `c9b2372`, `43911d1` ou `4698b45`. **Só junto com a volta das views**, porque o código antigo lê os nomes velhos.
- **Defeito achado:** transferir estoque com uma loja escolhida no topo dá erro de RLS. O UPDATE muda `filial_id` para fora de `filiais_visiveis()`, e o WITH CHECK de `estoque_unidades` barra. Só funciona em "Rede". **O Lucas decidiu:** corrigir no lote 3. Dono e admin transferem de qualquer loja que enxergam para qualquer outra da empresa; vendedor não transfere. Com e2e nas duas direções.
- **Próximos lotes:**
  - **lote 3:** pós-venda (`garantias_assistencias`, `orcamentos`, `servicos_reparo`), as vendas pequenas (`comissoes`, `contrato_documentos`, `contrato_modelos`, `pedidos_compra`, `propostas`, `fichas_financiamento`, `contratos_venda`) e a transferência;
  - **depois:** estoque (`produtos`, que é lido por `estoque_item_sync` e `zapintel_posvenda`; `categorias`, `marcas`, `fornecedores`, `tabela_precos`, `inventario_unidades`), `vendas` (4 funções do ZapIntel) e imob;
  - **por último:** `canais_conectados`, `clientes`, `lead_mensagens` e `leads`, mais a `storage_orfaos`, que lê as duas últimas e precisa mudar antes delas.
  - Já resolvidos do item 5: o `lib/realtime/tabelas.ts` foi apagado com a Inbox, e a `NEXT_PUBLIC_DB_CORE` tem 0 referências no código. Falta conferir na Vercel.

### Lote 3 (04/11, 20h11): pós-venda, vendas e a transferência — caem 10, restam 16

| código no ar | migração | views que caíram |
|---|---|---|
| `74518b8`, READY 20h07min32s; `e73fad5` (exportação e encomenda) | `20261105000500` às 20h11min16s (versão `20261104231116`), IOwait 4,2% | `garantias_assistencias`, `orcamentos`, `servicos_reparo`, `comissoes`, `contrato_documentos`, `contrato_modelos`, `pedidos_compra`, `propostas`, `fichas_financiamento`, `contratos_venda` |

- **Transferência de estoque** (decisão do Lucas, 04/11): dono e admin transferem de qualquer loja que enxergam para qualquer outra loja ativa da empresa; o vendedor não transfere.
  - A leitura das unidades continua pela RLS, então só se move o que a pessoa enxerga.
  - A gravação (a unidade e as duas linhas de histórico) vai pelo cliente de serviço, presa à empresa da sessão e aos ids já lidos. A loja de destino é procurada entre as lojas ativas da empresa.
  - Sem DDL.
  - Smoke na produção: unidade 53, Mogi → Jaguariúna → Mogi, cada perna com a loja de origem escolhida no topo e com o "Confirmar chegada" de verdade; o histórico de Mogi mostrou as 2 linhas da loja. Depois, o teste foi limpo.
- **Critério das views ganhou mais uma coluna: nome em texto.** Dois leitores escaparam do from, do embed e do tipo:
  - `from(tabela)` com o nome numa variável: o desfazer da encomenda no PDV, `'pedidos_compra'`;
  - a lista de tabelas da **exportação LGPD** do superadmin, com `cobrancas`, `lancamentos_financeiros` e `comissoes`. O CSV dessas três saiu **vazio, sem aviso**, desde 19h41 (as duas primeiras) e 20h11 (a terceira) até `e73fad5`.
  
  A exportação agora devolve 500 com o nome da tabela quando uma leitura falha. O `inventario.mjs` passou a listar `literal` (nome entre aspas fora de comentário); o que aparecer ali se revisa à mão, porque chave de aba e de módulo usam os mesmos nomes. O tipo pegou o desfazer da encomenda ao tirar as 10 views de `types/`.
- **Contrato:** emissão e 2ª via de 3 contratos, como dono e como vendedor, deram 12 HTMLs idênticos byte a byte antes e depois (`scripts/comparar-contrato.mts` no local).
- **Lista dos 134:**
  - **conferem linhas:** OS (marcar pronto não cria a tarefa de aviso quando não gravou; salvar), garantia, serviços (salvar e remover), metas da equipe, receber compra, documentos de contrato (renomear e apagar) e propostas;
  - **ficam como estão:**
    - o vínculo da unidade no receber compra, que é complemento;
    - o "desativa a versão anterior" do modelo de contrato, em que 0 linhas é normal.
- **Volta:** `supabase/scripts/volta/volta-views-lote3.sql`, junto com o Instant Rollback para antes de `74518b8`.
- **Restam 16 views de compatibilidade, com 419 leituras:**
  - estoque: `produtos`, `categorias_produtos`, `marcas_produtos`, `fornecedores`, `inventario_unidades`, `tabela_precos`;
  - `vendas`;
  - `avaliacoes_usados`;
  - imob: `imoveis`, `chaves_imoveis`, `negocios_imobiliarios`, `lead_perfil_busca`;
  - núcleo: `canais_conectados`, `clientes`, `lead_mensagens`, `leads`.

### Lote 4 (04/11, 20h55): estoque — caem 7, restam 9

| código no ar | migração | views que caíram |
|---|---|---|
| `f18ea63`, READY 20h52min36s | `20261105000600` às 20h55min28s (versão `20261104235528`), com IOwait de 8,1% e aprovação do Lucas no chat | `produtos`, `categorias_produtos`, `marcas_produtos`, `fornecedores`, `inventario_unidades`, `tabela_precos`, `avaliacoes_usados` |

- **Funções que liam `produtos`** e passaram para `estoque_produtos`: `estoque_item_sync` (gatilho) e `zapintel_posvenda`. O `DO` conferiu 1 ocorrência em cada no corpo da produção. A `zapintel_posvenda` do Supabase local **não é igual** à da produção (o md5 difere), então o repositório não recria essa função exatamente. Fica para conferir no lote de vendas, que mexe nela de novo.
- **Leitor por literal:** `app/api/avaliacoes/route.ts`, no `acharOuCriar(tabela: 'marcas_produtos' | 'categorias_produtos')`. **Checagem do verificador presa ao nome:** a linha 26, sobre a garantia, passou a procurar `estoque_unidades`. A linha 635, `from('clientes')` na tela de imóveis, muda no lote de `clientes`.
- **Varredura retroativa das 25 views anteriores**, com o critério completo (from, embed, tipo, função, literal; app, Edge, scripts, testes; e funções, cron, views, políticas e gatilhos de todos os schemas da produção): **nada sobrando**, além dos dois corrigidos em `e73fad5`. O filtro pelo alias do embed (`.eq('contrato_modelos.ativo', true)`) foi conferido no PostgREST.
- **Exportação LGPD conferida pelo superadmin:** cobranças 2, lançamentos 0 e comissões 0 batem com o banco. **Defeito antigo:** `leads` e `lead_mensagens` saem cortados em 1.000 linhas, o teto do PostgREST (3.120 e 102.589 no banco). Paginar não basta, porque passa dos 4,5 MB de resposta da Vercel; o caminho seria um ZIP no Storage com link assinado. Decisão do Lucas pendente.
- **Smoke nas duas lojas:** antes e depois do drop, as 9 telas deram 200, com os mesmos números de produto no estoque e no PDV. O `/zapintel/posvenda` deu **500 por timeout** (`57014`, 8,9 s) na primeira chamada depois do DDL, e o `zapintel_resumo` também, embora não tenha mudado. As duas passaram na segunda tentativa, e a função mede 774 ms. É a recarga de schema do PostgREST somada ao IOwait de 8% (regra 3 do topo deste runbook).
- **Lista dos 134:**
  - **conferem linhas:** cardápio, catálogo (importação de preços, categoria, preço), produto, avaliação e concluir encomenda;
  - **fica como está:** o vínculo da unidade criada pela avaliação.
- **Restam 9 views de compatibilidade:** `vendas`, `imoveis`, `chaves_imoveis`, `negocios_imobiliarios`, `lead_perfil_busca`, `canais_conectados`, `clientes`, `lead_mensagens` e `leads`. Ficam também `storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos` e `v_empresas_plano`, que não são de compatibilidade.
- **Dependências entre módulos (item 4):** nenhuma empresa tem módulo ligado sem o requisito. A JM e a Preview têm `pdv`, `estoque` e `assistencia` ligados, e nenhuma tem `avaliacoes`. Leitura adotada: "vendas" = `pdv`.

### 05/11 de manhã: dependências entre módulos e check-modulos (`38e778a`, só app)

- **`requer` no manifesto** (`core/modulos.ts`): PDV e Assistência requerem Estoque; Avaliação requer PDV. Orçamentos não requer nada, e contrato não é módulo à parte (fica no PDV). A conta é transitiva (`lib/modulos-central.ts` → `requisitosDe`, `requisitosFaltando`, `dependentesLigados`).
- **Central:** instalar com requisito faltando confirma "Vai ligar também: X" e grava os requisitos antes do módulo. Requisito pago ou em preparação bloqueia, com o motivo. Desinstalar o que um módulo ligado usa dá 409 ("Estoque é usado por PDV, Assistência: desinstale PDV, Assistência antes"), e o botão fica desligado.
- **Pedido de módulo pago:** abre também o pedido de cada requisito que falta. O atender do superadmin instala os requisitos (com o forçado de plano de cada um) e fecha os pedidos deles. Requisito em preparação bloqueia o atendimento.
- **`scripts/check-modulos.mjs`** (no `npm run build` e no `npm run check`): toda tela e rota de `app/` tem dono (core, plataforma ou módulo do manifesto). Rota de módulo fora da trava do proxy confere "módulo ligado" no servidor (`exigirModuloLigado` de `lib/modulo-ligado.ts`, ou `moduloLigado`, `ligadosDaEmpresa`, `inteligenciaLigada`, `zapintelAcesso`). A lista `scripts/modulos-excecoes.json` só encolhe:
  - **fora (4):** `/ranking`, `/api/ranking/metas`, `/api/assistente` e `/api/assistente/meu-dia` — viram módulo no manifesto ou ganham dono;
  - **sem trava (38):** as APIs de módulo e os links públicos (OS, orçamento, proposta, imóvel, cardápio, portais), que funcionam com o módulo desligado. **Defeito antigo**, agora listado.
- **Testes:** e2e local 20/20 (`D:/Nexus-Copia/inbox/ferramentas/modulos/dependencias-e2e.mjs`); 3 testes unitários novos. O pedido pago com requisito só tem teste unitário: nenhum módulo pago tem requisito hoje.
- **Smoke na produção** (Central da JM, sem clicar): Estoque "Usado por PDV, Assistência", botão desligado; PDV, Assistência e Orçamentos com Desinstalar normal.

### Lote 5 (05/11, 07h43): vendas — cai 1, restam 8

| código no ar | migração | view que caiu |
|---|---|---|
| `22113a9`, READY 07h25min50s | `20261105000700` às 07h43 (versão `20261105104323`), IOwait 2,06%, aprovação do Lucas no chat | `vendas` |

- **29 arquivos** passaram para `vendas_vendas` (from, embed `venda:vendas_vendas!venda_id` da garantia, tipo) e **2 literais** de verdade: o desfazer da encomenda (`apagar('vendas_vendas', ...)`) e a exportação de vendas da empresa (`/api/exportar`). Os outros 39 `'vendas'` são rótulo de tela, grupo do menu, aba ou evento do broadcast.
- **Funções:** `zapintel_conversa_calc` (1), `zapintel_dashboard` (1), `zapintel_insights` (3) e `zapintel_posvenda` (1) liam a view. O `DO` troca só `from/join vendas`, confere o número na produção e pula a função que já lê a tabela, para ida/volta/ida funcionar no local. As 4 funções do local **não são iguais** às da produção (md5 diferente nas 4, não só na posvenda): o banco local não recria o corpo exato.
- **Smoke, antes e depois do drop, nas duas lojas** (superadmin do Lucas na aba isolada, como dono da JM):

  | | Mogi | Jaguariúna | banco |
  |---|---|---|---|
  | histórico | 55 vendas, R$ 386.017,00, lucro R$ 376.317,00 | 37 vendas, R$ 203.115,00, lucro R$ 200.415,00 | igual (só concluídas no faturamento) |
  | Visão geral, relatórios, metas, financeiro (mês) | R$ 9.795,00 em 1 venda | R$ 16.383,00 em 4 vendas | igual |
  | ZapIntel (rede) | painel R$ 26,2 mil em 5 vendas; Insights 42 vendas, R$ 290.520, 33 ligadas; pós-venda 341 clientes, 66 com venda | | iguais antes e depois |

  As 12 telas deram 200 nas duas lojas; `/equipe` leva a `/configuracoes/usuarios`.
- **Tipos:** `vendas` saiu de `types/database.gerado.ts` (o bloco à mão, por ser o último da seção, e 8 relações pela ferramenta) e de `types/views-espelho.ts`.
- **Volta:** `supabase/scripts/volta/volta-views-lote5.sql`, junto com o Instant Rollback para antes de `22113a9`.
- **Restam 8 views de compatibilidade:** `imoveis`, `chaves_imoveis`, `negocios_imobiliarios`, `lead_perfil_busca`, `canais_conectados`, `clientes`, `lead_mensagens` e `leads`. Ficam também `storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos` e `v_empresas_plano`.

### Lote 6 (05/11, 08h14): imob — caem 4, restam 4 de compatibilidade

| código no ar | migração | o que caiu |
|---|---|---|
| `17d59ab`, READY 08h10min13s | `20261105000800` às 08h14 (versão `20261105111438`), IOwait 1,61%, aprovação do Lucas no chat | `imoveis`, `chaves_imoveis`, `negocios_imobiliarios`, `lead_perfil_busca` e a função `propagar_filial_do_lead()` |

- **23 arquivos** foram para `imoveis_imoveis`, `imoveis_chaves`, `imoveis_negocios` e `imoveis_perfis_busca` (from, embed `imoveis:imoveis_imoveis(...)` da agenda e do painel, tipo), mais os 2 literais da exportação imob (`imob_imoveis`, `imob_financeiro`).
- **`propagar_filial_do_lead()`**: era a única função que citava uma delas (update em `lead_perfil_busca`, `lead_mensagens` e `clientes`). Estava morta: função de gatilho sem gatilho, substituída pelos `core_*` no core v1. Caiu junto, e a migração confere antes que nenhum gatilho passou a usá-la. A volta a recria, com os grants.
- **As políticas `imoveis_*` de `storage.objects`** falam do BUCKET `imoveis`, não da view. Ficam.
- **Produção sem dado de imob** (0 imóveis, chaves, negócios e perfis; nenhuma empresa com o módulo). O e2e foi no local, com o Imóveis ligado só lá para a empresa 1 e os dados de teste apagados no fim: as 4 escritas pela RLS do dono, os embeds visita→imóvel e chave→imóvel, 7 telas com 200, `/api/match` e as duas exportações imob.
- **Smoke na produção** (JM, 2 lojas, antes e depois do drop): 11 telas com 200. Com o módulo desligado, `/imoveis` leva a `/dashboard` e a exportação imob dá 403, como esperado.
- **Defeito do lote 4 achado aqui e corrigido em `17d59ab`:** o `renomear.cjs` trocou `storage.from('produtos')` (bucket) por `estoque_produtos` em `components/ui/upload-fotos.tsx`. O upload de foto de produto e de unidade falhava desde 04/11 20h52; o bucket tinha 0 objetos, então ninguém chegou a tentar. A ferramenta agora pula `storage.from`. **Teste real na produção** (05/11, pedido do Lucas): produto "TESTE FOTO — apagar" (id 179) com foto PNG pela tela do catálogo, gravado com `foto_url` no bucket `produtos/1/`, URL pública 200. Depois, arquivo apagado pela API do Storage e produto apagado: 0 objetos no bucket e 35 produtos na JM, como antes.
- **Defeito antigo anotado:** `/clientes` dispara o erro de hidratação React #418 (texto diferente entre servidor e navegador) também na produção sem o lote 6, com ou sem o Imóveis. **Decisão do Lucas:** corrigir no lote de `clientes`.
- **Tipos:** as 4 saíram de `types/database.gerado.ts` (com 3 relações) e de `types/views-espelho.ts`, que ficou vazio.
- **Volta:** `supabase/scripts/volta/volta-views-lote6.sql`, junto com o Instant Rollback para antes de `17d59ab` (**sem** desfazer a correção do bucket: se voltar, reaplicar só a linha do `upload-fotos.tsx`).
- **Restam 4 views de compatibilidade** (`canais_conectados`, `clientes`, `lead_mensagens`, `leads`) e 4 que não são (`storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos`, `v_empresas_plano`).

### Lote 7 (05/11, 09h10): canais — cai 1, restam 3 de compatibilidade

| código no ar | Edge | migração | view que caiu |
|---|---|---|---|
| `9b0968a`, READY 08h53min39s | `webhook-leads` **v71** (08h57min57s, do worktree em `9b0968a`) | `20261105000900` às 09h10min21s (versão `20261105121021`), IOwait 6,27%, aprovação do Lucas no chat | `canais_conectados` |

- **12 arquivos, 33 leituras** foram para `canais`: 11 delas na Edge, as rotas de canais e de modelos, a renovação de token, o envio do WhatsApp e a exclusão de empresa. Mais as 2 **URLs REST** dos scripts de diagnóstico (`rest/v1/canais_conectados`), um formato que o critério não pegava. O mesmo formato foi conferido para as 37 views já caídas: nenhuma ocorrência.
- **Mesmo acesso:** a tabela tem os mesmos grants da view (authenticated nas 25 colunas, sem anon) e a mesma RLS; a view era `security_invoker`.
- **Edge local:** os 25 cenários passaram com e sem a view (canal fora = 500 e a Meta reenvia, reenvio, mid duplicado, visto do IG, pacote grande). O proxy de teste passou a derrubar `/rest/v1/canais`. O cache de canal da Edge vive no processo: para repetir "canal fora", reiniciar a Edge antes.
- **Smoke real com o Lucas** (WhatsApp e Instagram, Mogi e Jaguariúna):
  - **recebidas** pela v71 no canal e na loja certos: WA Mogi (canal 15, loja 3), WA Jaguariúna (28, 6), IG Mogi (26, 3) e IG Jaguariúna (25, 6). Uma mensagem real de cliente também entrou às 08h58;
  - **respostas** do Lucas pela Comunicação, com o login de dono: as 4 saíram pelo canal da loja, com o id da Meta (`wamid…` e o mid do Direct), e chegaram a **lida** entre 09h07 e 09h08. As 4 chegaram no celular;
  - o superadmin impersonando **não envia**: a Edge exige vínculo em `empresa_usuarios` (`usuarioDoEnvio`). É regra antiga e fica.
- **Depois do drop:** as mensagens continuaram entrando (a última às 09h10min21s); `/api/canais` devolve os 5 canais ativos; os modelos e 4 telas deram 200.
- **Build:** o `types/views-espelho.ts` vazio (do commit de tipos do lote 6, `2773a64`) reprovou o ESLint, e o deploy de `2773a64` falhou. A produção ficou em `17d59ab`, com o mesmo código. Corrigido em `9b0968a` (`Record<never, never>`). Daqui em diante, o gate roda **depois** de tirar os tipos.
- **Tipos:** `canais_conectados` saiu de `types/database.gerado.ts` (com 3 relações) e de `ColunasObrigatorias` em `types/database.ts`.
- **Volta:** `supabase/scripts/volta/volta-views-lote7.sql` + Instant Rollback para antes de `9b0968a` + republicar a Edge v70 de `D:/Nexus-Copia/inbox/ferramentas/lote7/volta-edge-v70/` (`index.ts` e `reenvio.ts` de `40d2164`). As três juntas.
- **As 4 views que não são de compatibilidade** (conferido em 05/11, pedido do Lucas):
  - `core_v_planos`: nenhum leitor (código, funções, jobs, views; 0 chamadas no `pg_stat_statements`). **Cai no último lote.**
  - `v_empresas_plano`: nenhum leitor (1 chamada no `pg_stat_statements`, de consulta de inspeção). Tem SELECT para `anon`, mas filtra por `get_empresa_id()`. **Cai no último lote.**
  - `v_leads_nao_lidas`: lida pela `quadro_base` (o quadro de `/leads`; 145 chamadas). Uso real, mas lê `leads`/`lead_mensagens`: cai com elas, e a `quadro_base` passa a contar no core antes.
  - `storage_orfaos`: lida só pelo script manual `scripts/limpar-orfaos-chat-midia.mjs` e pela `acharOrfaos()` de `lib/storage/retencao.ts`, que não tem chamador. Lê `leads`/`lead_mensagens`: reescrever sobre `mensagens`/`negocios` antes de elas caírem.
- **Restam 3 views de compatibilidade:** `clientes`, `lead_mensagens` e `leads`.

### Lote 8 (05/11, 10h20): clientes — cai 1, restam 2 de compatibilidade

| código no ar | migrações | o que caiu |
|---|---|---|
| `2f7faa9`, READY 10h16min46s; `05cb255` (só a migração B) | `20261105001000` (só dados, ANTES do deploy) às 10h12 (versão `20261105131202`), IOwait 2,85%; `20261105001100` às 10h20min50s (versão `20261105132050`), IOwait 3,98%; as duas com aprovação do Lucas no chat | a view `clientes`, o gatilho `compat_clientes_iud` e a função `fundir_clientes` |

- **A view não era 1:1.** Cliente é o contato com a marca `dados._cliente`; a view tirava ~30 colunas do JSON e o gatilho INSTEAD OF (SECURITY DEFINER) montava o JSON de volta. Virou a camada **`lib/clientes.ts`** (sem RPC nova):
  - **ler:** `consultaClientes(db, colunas)` (o builder já filtrado por `dados->_cliente`), `clienteDoContato` (a forma de sempre: endereco, cidade, tipo_cliente…), `lerCliente`, `lerTodosOsClientes` (de mil em mil);
  - **gravar:** `criarCliente` e `atualizarCliente`, só pelo servidor (`POST /api/clientes`, `PATCH /api/clientes/[id]`). A busca pelo telefone usa o serviço, como o gatilho: o vendedor de Mogi que cadastra um telefone de Jaguariúna marca o contato que já existe em vez de bater no índice único. A edição confere a RLS da sessão (era o `security_invoker` da view) e grava pelo serviço;
  - **CPF/CNPJ conferido no app** (`lib/documento.ts`, o validador que já existia na máscara do ZapIntel): 11 dígitos têm de ser CPF válido, 14 CNPJ válido, o resto é recusado; vazio passa. `cpf_validado`/`cnpj_validado` passaram a ser verdadeiros (o gatilho gravava sempre `false`).
- **Campos por dono** (regra do Lucas): colunas de `contatos` (nome, telefone, e-mail, CPF, Instagram, observações, ativo), `contatos.endereco` (logradouro… cep), campos do **core** em `dados` (`core/campos.ts`: nascimento, estado civil, profissão, nacionalidade, **tipo e origem do cliente**) e campos do **módulo Imóveis** (`campos` no manifesto, `modulo_dono = 'imoveis'`: tipo de negócio, valor pretendido, região de interesse, análise cadastral, corretor, proprietário). `contatos.tipo` (pessoa/empresa) e `contatos.origem` (canal de entrada) dizem outra coisa, por isso tipo e origem do cliente são campos. Nenhum campo de imobiliária no core; a marca `_cliente` ficou só com `cpf_validado`, `cnpj_validado`, `lead_id`, `usuario_id` (e `ids`, do corte).
- **Campos de partida:** o cadastro (`aplicarPreset`) garante os do core e os dos módulos ligados; instalar um módulo (`aoInstalarModulo`) garante os dele (`lib/campos-padrao.ts`). Até aqui empresa nova nascia sem os do core e o nascimento digitado sumia.
- **Fusão de clientes:** pela `core_fundir_contatos` com foto (`fundirContatos` em `lib/fusao-contatos.ts`, a mesma do card do lead) e botão **Desfazer** no aviso. A `fundir_clientes` caiu (lia `clientes`, `leads` e `lead_mensagens`; não tinha volta).
- **`marcar_cliente_proprietario`** (gatilho de `imoveis_imoveis`) é lógica do módulo Imóveis: grava só o campo `proprietario` em `dados`, só com o módulo ligado e o campo ativo. Sem o módulo, não grava nada.
- **ZapIntel:** `zapintel_posvenda` e `zapintel_insights` só têm `'clientes'` como chave de JSON; `zapintel_dashboard` não cita. Ficam.
- **35 arquivos** pela camada; os 12 embeds viraram `clientes:contatos!cliente_id(...)` (a FK já aponta para `contatos`; só colunas). A exportação de clientes (`/api/exportar`, inclusive `imob_clientes`, com o corretor em `dados->>corretor_id`) e o `clientes.csv` da exportação LGPD saem da camada (este sem o teto de mil).
- **Defeitos achados e corrigidos:**
  - **React #418 de /clientes:** um cliente com nome começando por emoji ("✨ Agueda"). As iniciais pegavam `nome[0]`, meio par UTF-16, que o servidor manda como "�". `iniciais()` em `lib/sem-nome.ts`, por ponto de código. Na produção: 0 erros no console nas duas lojas;
  - **a edição levava as outras lojas junto:** o gatilho regravava `contatos.filial_id` em toda edição, e `contatos_propagar_filial` (AFTER UPDATE OF filial_id) movia negócios, conversas e mensagens das outras lojas para a loja do contato. A camada não regrava a loja;
  - a ficha da imobiliária não recarregava a lista depois de salvar.
- **Converter lead** manda o `lead_id`: o lead que só tem Instagram não ganha um segundo contato.
- **Testes (local):** `scripts/comparar-clientes.mts` (camada × view, 77 clientes, 0 divergência); `comparar-contrato.mts` 12/12 HTMLs idênticos byte a byte (3 contratos, dono e vendedor, emissão e 2ª via); e2e `views-lote8-e2e.mjs` 47/47 e `views-lote8-imob-e2e.mjs` 15/15 no build de produção local (lista, busca, criar, editar, CPF inválido, fundir e desfazer, PDV, histórico, exportar, dono e vendedores nas duas lojas, Imóveis ligado e desligado); `tests/clientes.test.ts`. Ida/volta/ida das migrações no local.
- **Smoke na produção** (superadmin na aba isolada, saiu no fim): Mogi 71 e Jaguariúna 42 clientes na tela = view = RLS, antes e depois do drop; 12 telas 200; criar, CPF inválido 400, editar, fundir, desfazer e desativar com 2 clientes de teste, apagados depois. A exportação dá 403 ao superadmin impersonando (exige `empresa_usuarios`, regra antiga).
- **Dois clientes com documento incompleto** (recusados ao salvar até alguém corrigir): Alexandre Fernandes 17pm (Jaguariúna, 9 dígitos, id 47) e Luana (Mogi, 10 dígitos, id 16). O número não foi alterado; a equipe corrige.
- **Tipos:** `clientes` saiu de `types/database.gerado.ts` (com 18 relações), `fundir_clientes` das funções, `clientes` de `ColunasObrigatorias`.
- **Volta:** `supabase/scripts/volta/volta-views-lote8.sql` (recria view com defaults e grants, gatilho, `fundir_clientes`, a `marcar` antiga, e devolve os cinco campos à marca) + Instant Rollback para antes de `2f7faa9`. A `20261105001000` não precisa voltar.
- **Restam 2 views de compatibilidade** (`lead_mensagens`, `leads`) e 4 que não são (`storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos`, `v_empresas_plano`).

### Último lote (05/11, 13h30): leads e lead_mensagens — zero views de compatibilidade

| o quê | quando | detalhe |
|---|---|---|
| Edge `webhook-leads` **v72** | 11h10 (`7eece14`, do worktree) | grava por identidade, sem a view `leads` |
| migração A `20261105001200_leads_core_antes` | 12h38min51s (versão `20261105153851`), depois de 12 min seguidos com IOwait < 10% (pedido do Lucas: a coluna gerada reescreve `negocios`) | só acrescenta |
| app `de17682` | READY 12h43min39s | 68 + 12 arquivos pela camada `lib/leads.ts` |
| migração B `20261105001300_drop_views_ultimo_lote` | 13h30min35s (versão `20261105163035`), IOwait 8,4% logo depois de um pico | o drop |

Aprovação do Lucas no chat nas duas migrações.

- **Edge v72 (grava por identidade).** Recebimento, echo, histórico, agenda do celular e envio leem e gravam `contato_identidades`/`contatos`/`negocios`. **Com negócio ativo na loja do canal (mesmo ganho ou perdido), a mensagem entra nele por `lead_id`** — como antes; 242 negócios ganhos/perdidos estão ativos e a identidade pura os reabriria (apagando `ganho_em`). **Sem negócio ativo, entra pela `mensagem_registrar` por identidade**, que chama `core_negocio_do_canal` com as duas travas: quem volta pelo canal não duplica negócio. Cadastro manual casa pelo E.164 (era "últimos 8 dígitos") e ganha a identidade do WhatsApp. Direct responde pela identidade da conta que envia (era o `origem_id` do contato, que para quem chegou pelo WhatsApp era um telefone).
  - Local: `cenarios.mjs` 25/25 e `ferramentas/ultimo-lote/cenarios-identidade.mjs` (37: novo, segunda mensagem, retorno com negócio zerado reabre sem duplicar, ganho não reabre, outra loja, **3 entregas simultâneas = 1 contato e 1 negócio**, cadastro manual, anúncio, echo, histórico, agenda, Direct) — com e sem as views.
  - Produção: ~170 mensagens reais entre 11h10 e 11h37 no canal e na loja certos, 2 contatos novos com 1 negócio cada; teste do Lucas 13h17–13h20 nos 4 canais (Instagram Mogi e Jaguariúna recebidas e respondidas até **lida**; WhatsApp das duas lojas até **entregue**), sem negócio novo.
  - Volta: republicar a v71 de `D:/Nexus-Copia/inbox/ferramentas/ultimo-lote/volta-edge-v71/` (a v71 funciona com as views de pé).
- **Migração A:** `negocios.ativo` (coluna GERADA de `dados._lead.ativo`; 2.988 ativos, 153 inativos, 0 divergências); `storage_orfaos` sobre `mensagens`/`contatos`; `negocio_atribuir`, `preencher_filial_do_lead` (gatilho de `imoveis_perfis_busca` e `cadencia_inscricoes`), `buscar_lead_por_numero` e `assistente_status_conversas` sobre o core (a última: 2.473 linhas iguais à versão da view, no local); bucket privado `lgpd-exportacoes` (50 MB, só zip) e o job `lgpd-exportacoes-limpar` (`43 * * * *`, segredo do Vault). Volta: `supabase/scripts/volta/volta-leads-core-antes.sql`.
- **App (`lib/leads.ts`):** o "lead" = negócio + contato + etapa + conversa do contato na loja (só no negócio principal, como a view). `leadDoNegocio`, `conversasDosLeads`, `leadsParaEscolher`, `embedLead` (`leads:negocios!<fk>(...contatos!contato_id(nome))`), `mensagensDoLead`, `criarLead`, `marcarNoLead`, `registrarMensagemDoLead`. Novo lead e o lead da ficha imob pelo servidor (`POST /api/leads`: mesmo telefone = mesmo contato; o cliente entra no funil no próprio contato, mesmo sem telefone); chat de canal sem integração por `POST /api/leads/[id]/mensagem` (`mensagem_registrar`, com o autor). UPDATE com contagem: reservas e retenção. **Diferenças conhecidas:** a lista para escolher (tarefa, agenda) põe primeiro quem tem conversa; o ⌘K ordena pela última mensagem entre os 200 mais novos que batem; excluir etapa move só os leads daquela etapa (a view movia o mesmo slug de outro funil); a esteira lê as marcas da conversa (exatas; antes, das 4.000 mensagens mais novas da empresa).
- **Exportação LGPD:** completa (de mil em mil pelo id), só core e módulos (`contatos`, `contato_identidades`, `negocios`, `negocio_historico`, `conversas`, `mensagens` + `leads.csv` na forma de lead + os de antes), ZIP DEFLATE no bucket privado, link assinado de 10 min, apagado em ≤ 25 h. **Conferida em produção pela conta de superadmin do Lucas, antes e depois do drop**, contando os registros DENTRO do ZIP: 103.693 mensagens, 3.144 negócios/leads, 2.999 contatos, 3.584 conversas, 2.985 identidades, 1.459 histórico, 102 clientes, 68 tarefas, 92 vendas, 14 usuários = banco no instante da exportação. ZIP 9,2 MB, 24 s. Cópias locais apagadas.
- **Migração B:** caem `leads`, `lead_mensagens`, `v_leads_nao_lidas`, `core_v_planos`, `v_empresas_plano`; `compat_leads_iud`, `compat_lead_mensagens_iud`, `compat_etapa`, `compat_guarda`; e as mortas `enforce_lead_limit`, `sincronizar_nao_lidas`, `tg_lead_marcos_conversa`, `incrementar_msgs_nao_lidas`. `core_negocio_do_canal` e `mensagem_registrar` ficam. Volta: `supabase/scripts/volta/volta-views-ultimo-lote.sql` (com o corpo de `compat_leads_iud` da PRODUÇÃO — o do local difere) + Instant Rollback para antes de `de17682`; ida/volta/ida no local.
- **Smoke na produção (superadmin, aba isolada, saiu no fim):** 20 telas com 200 nas duas lojas antes e depois do drop, 0 erro de console; badge Leads de Mogi = core (750 → 752); Clientes Mogi 71; mensagens entrando depois do drop sem negócio duplicado. Tarefas mostra 0 ao superadmin impersonando: a tela filtra pelo responsável de quem não é dono/admin em `empresa_usuarios` (regra antiga, igual em `d32d30f`).
- **Testes (local, sem as views):** e2e `ferramentas/ultimo-lote/views-ultimo-lote-e2e.mjs` 64/64 (18 telas, novo lead pela tela, mesmo telefone, chat manual, atribuir, mover, ⌘K, ficha imob, vendedores das duas lojas e RLS, LGPD completa contra o banco, job de 24 h); lote 8 47/47. Gate depois de tirar os tipos: check (tsc), 227 testes, menu 15/15, verificador 592/5 antigas, build.
- **Tipos:** as 5 views (com 127 relações) e 3 funções saíram de `types/database.gerado.ts`; `negocios.ativo` entrou. Sem view de compatibilidade, a correção de `types/database.ts` (`views-espelho.ts`, `ColunasObrigatorias`) e as ferramentas dela (`scripts/tipos-espelho.mjs`, `supabase/testes/views_espelho.sql`) saíram.
- **Realtime e variável:** nenhum ramo legado sobrou (o app só assina `negocios`, `contatos`, `conversas`, `mensagens`, `mensagens_internas`, `acessos`, `pedidos`; `pedidos` é só do KDS e saiu da publicação em 09/11, ver "Como nasce um módulo"); `NEXT_PUBLIC_DB_CORE` com 0 referências no código; na Vercel ela existia só em Production — **a remover pelo Lucas no painel** (o conector da Vercel não apaga variável). Sem efeito enquanto não sai: nenhum código a lê.
- **Picos de IOwait de 11h11 a 13h23** (20–33% a cada 8–10 min, entre eles 2–7%): **não são consultas** — entre as fotos canônicas do `pg_stat_statements` das 12h46 e 13h21 (`D:/Nexus-Copia/saude/pgss-20261105-*.json`, tiradas pela `supabase db query --remote --read-only` direto em arquivo), todas as consultas juntas escreveram 4,9 MB de WAL e leram ~1,6 MB do disco; nem autovacuum (só tabelas < 3,5 MB). **O arquivamento do WAL NÃO se confirmou como causa:** ele roda a cada ~2 min (`archive_timeout` 2 min; 4 segmentos de 13h20min58s a 13h29min01s), mas os picos não seguem esse ritmo (13h25–13h30 sem pico com 2 arquivamentos). Causa em aberto: fora do Postgres das consultas (infra do plano free).
- **O cliente que volta (05/11, 15h14; detalhe no 06, seção 31):** um card por contato por loja (decisão do Matheus). A `core_negocio_do_canal` decide dentro da trava: aberto em qualquer funil recebe sem mover; ganho há até N dias recebe (pós-venda; `configuracoes_sistema.retorno_cliente.pos_venda_dias`, padrão 30); senão o MESMO negócio volta à 1ª etapa do seu funil, depois de gravar o fechamento em `negocio_historico.detalhe`; sem negócio, cria. A Edge (v75) manda toda recebida por identidade. Relatórios por `lib/fechamentos.ts` (atual + reabertos). Volta: `volta-retorno-cliente.sql` + Edge v74 (código da v72). A v73 (negócio novo) foi revertida; o único duplicado que criou foi fundido.
- **Lista de morte: ZERO views de compatibilidade.** As 41 do corte caíram (lotes 1–8 e este). No `public` sobra só `storage_orfaos` (não é de compatibilidade; lê o core). (escrito em 22/10/2026 — NÃO executar sem o ok do Lucas pelo chat)

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
- **Pronta em 23/10 na branch `feat/viagem-migracao-1`** (migrações `20261024000100_segredos_e_status_pedidos.sql` e `20261024000110_modulo_pedidos_pendente_idx.sql`; `lib/empresa-segredos.ts`, `lib/modulos-instalacao.ts`, `lib/portal-token.ts`; tipos regenerados do local). Testes no Supabase local: `supabase/testes/segredos_e_pedidos.sql` 10/10 (anon e authenticated não leem `empresa_segredos`, service_role lê; pedido nasce pendente; dois pendentes do mesmo módulo barrados; recusar não apaga; pedido novo entra depois de recusado; `atendido` exige `atendido_em`); fluxo do token 9/9 (só o Imóveis gera; no banco só o cifrado; reinstalar não troca; portal e site: 401 sem Bearer, com `?token=` e com Bearer errado, 200 com o certo).
- **Ordem para aplicar (com o ok do Lucas):** (1) `20261024000100` pelo MCP; (2) `20261024000110` SOZINHA (CONCURRENTLY, fora de transação); (3) deploy da aplicação — o código novo lê `modulo_pedidos.status` e `empresa_segredos`, então NÃO pode subir antes das migrações. Pré-requisito: `PAYMENT_ENCRYPTION_KEY` configurada na Vercel (a mesma das credenciais de pagamento; conferir antes). Volta: deploy anterior + `drop table empresa_segredos` e as colunas novas de `modulo_pedidos` (sem dado a perder enquanto ninguém instalar o Imóveis).
- Enquanto o Imóveis estiver "em preparação" no manifesto, nenhum caminho de tela o instala: o token só nasce quando ele sair de preparação.
- **Aplicada na noite de 03/11** (item 3, 20h56; código no ar desde 20h59). A ordem foi a de cima e a chave foi conferida antes. A volta é `supabase/scripts/volta/volta-viagem-1.sql`.

**Nota da etapa Plataforma (Lucas, 03/11):** a `PAYMENT_ENCRYPTION_KEY` cifra hoje as credenciais de pagamento e também o `empresa_segredos`. Quando o Stripe recorrente for retomado, ela deve ser renomeada para uma chave de **cofre geral**, por exemplo `COFRE_ENCRYPTION_KEY`. A troca é recifrar com a chave nova, e o nome atual não deve ser reaproveitado para outro fim.

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


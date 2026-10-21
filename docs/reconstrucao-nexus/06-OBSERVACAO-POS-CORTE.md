# 06 — Observação pós-corte (20/10/2026)

**O que é:** o que vimos em produção no primeiro dia depois do corte para o core v1 (feito em 20/10, das 08:24 às 09:01, conforme o `05-RUNBOOK-CORTE.md`).

**Como foi feito:** só leitura em produção:
- logs da Edge e do Postgres pelo Supabase;
- logs da Vercel;
- consultas de leitura no banco.

A única exceção foram duas respostas de teste enviadas pelo CRM para o número do próprio Lucas (lead 3598), para medir a latência.

**O que saiu daqui:** dois consertos na branch `fix/edge-webhook`, que vão para o ar junto com a limpeza:
- `11789ee`: reenvio da Meta respondido sem reprocessar;
- `a2ba8cc`: prazo de 20 s no envio à Meta.

---

## 1. Jaguariúna (loja 6, canal 28): 418 reenvios do mesmo pacote

### O que acontece

A Meta reenvia o mesmo webhook do canal 28 desde que ele foi conectado, em 13/10. São os mesmos bytes, chegando várias vezes:

| Pacote | Vezes | Período |
|---|---|---|
| Sincronização de contatos (`smb_app_state_sync`) | **418** | 13/10 até 20/10 08:58 |
| Histórico (`history`) | **252** | até 19/10 10:26 |

### Causa

A Edge leva cerca de um minuto para responder aos pacotes grandes. Como a Meta não recebe o 200 a tempo, considera a entrega falha e manda de novo, e o ciclo se repete.

Tempo de resposta da Edge nas 24 h anteriores à análise:

| Chamadas | Quantidade | Mediana | Máximo |
|---|---|---|---|
| Pacotes > 10 KB (sincronização) | 70 | 63 s | 98,9 s |
| Pacotes > 10 KB que estouraram o limite de 150 s da Edge (HTTP 546) | 2 | 150 s | 150 s |
| Mensagens normais | 2.124 | 1,8 s | — |

O pacote grande é lento por dois motivos:
- ele vira centenas de chamadas REST em sequência;
- cada chamada atravessa o continente, porque a Edge roda em regiões dos EUA e o banco está em São Paulo (sa-east-1). Isso dá cerca de 170 ms de ida e volta por chamada.

Nada se perde, porque o processamento é idempotente. Mas cada reenvio refaz o trabalho inteiro: gasta CPU da Edge, gasta egress e gera escrita no banco.

### A importação de histórico de 19/10

Em 19/10, às 10:26, a Meta mandou 12 pacotes de histórico novos. Eles gravaram **12.746 mensagens antigas** no canal 28:
- todas entre 10h e 11h, com data da Meta mais de 1 h no passado (as mais antigas de até 68 dias antes);
- gravadas como lidas, sem mexer no contador de não lidas.

Fora esse bloco, as mensagens recebidas nas 48 h analisadas foram só ao vivo, de 1 a 36 por hora, inclusive no domingo.

*Como medir backlog:* pela ordem de inserção (`id`). O `updated_at` não serve, porque muda a cada status de entrega.

### Fusão, reaberturas e reconexão

- A fusão do corte absorveu **93 registros em 74 contatos** na loja 6:
  - identidade + telefone: 60;
  - só telefone: 29;
  - só identidade: 4.
- **Reaberturas pela regra nova desde o corte: 0.** Nasceram 3 negócios novos, todos de contatos que ainda não tinham negócio.
- **Reconexão do canal nas últimas 48 h: não houve.** O `conectado_em` continua em 13/10. O `updated_at` de hoje às 08:59 vem só da sincronização de contatos repetida.
- **Duplicadas descartadas no canal 28:** 3 recebidas e 1 eco repetido.

### O conserto (`11789ee`, ainda não está no ar)

Tabela `ops.webhook_recebidos`, com hash, canal, hora e tamanho e retenção de 24 h:
- A Edge calcula o SHA-256 do corpo bruto depois de validar a assinatura.
- Se o hash já foi visto nas últimas 24 h, responde 200 sem processar.
- Pacote grande (> 10 KB): o hash é gravado **antes** de processar. Assim, um reenvio que chega enquanto o primeiro ainda roda também é cortado.
- Pacote pequeno: o hash só é gravado no fim do processamento, e só se der certo. Se der erro no meio, o reenvio da Meta processa de novo.
- Se o banco falhar na consulta do hash, a Edge processa normalmente.
- A lógica de sincronização não foi tocada.

Medido na cópia, com a Edge real (Deno) e o PostgREST local, usando o pacote real de contatos do canal 28 (62.755 bytes):

| Caso | Tempo |
|---|---|
| Pacote grande, 1ª entrega (processa) | 1,2 s |
| Pacote grande, reenvios | 9,3 / 14,8 / 15,1 ms |
| Reenvio 150 ms depois, com a 1ª ainda processando | 16,2 ms |
| Pacote pequeno, 1ª entrega | 148,7 ms |
| Pacote pequeno, reenvios | 7,6 / 4,8 ms |

Em produção, cada reenvio ainda soma uma ida e volta ao banco, cerca de 170 ms a mais: algo em torno de **0,2 s, contra os ~60 s de hoje**.

O que este conserto **não** resolve: a primeira entrega de um pacote grande continua levando cerca de 1 min em produção. Se a Meta reenviar antes dessa primeira terminar, o reenvio já é cortado. Mas a primeira resposta segue lenta, e o problema de fundo é a distância entre a Edge e o banco.

---

## 2. Latência no envio pelo CRM: o caso de 77 s

Medimos duas respostas pelo CRM, trecho a trecho, nos logs da Edge, do Postgres e do navegador, e comparamos com o caso lento:

| Trecho | Envio 1 | Envio 2 | O caso de 77 s |
|---|---|---|---|
| Subida do worker da Edge | 29 ms | 26 ms | 25–42 ms |
| Edge antes de chamar a Meta (lead, auth, canal, assinatura) | 1,25 s | 0,45 s | 0,90 s |
| Resposta da API da Meta | 1,39 s | 1,48 s | **≈ 69,5 s** |
| Gravação (`mensagem_registrar`) | 0,35 s | 0,12 s | ≈ 6,1 s |
| **Total na Edge** | **3,4 s** | **2,3 s** | **77,4 s** |
| Realtime até o navegador | 0,55 s | 0,16 s | — |

- **A causa foi a espera pela resposta HTTP da Meta.** A Meta despachou a mensagem em cerca de 3 s: o webhook de status chegou às 11:51:12. Mas a resposta para a Edge só voltou uns 65 s depois.
- **A gravação lenta daquele envio não foi culpa do banco.** No Postgres, a chamada nunca passou de 342 ms (77 execuções, média de 107 ms). Os ~6 s foram de rede, entre a Edge e o REST.
- **Worker frio × quente:** não fez diferença. A Edge sobe um worker novo em toda chamada, em 25–43 ms.
- **Espera síncrona:** não há. Nesse caminho, a Edge não espera transcrição, ficha do ZapIntel nem histórico.
- **Frequência:** 1 caso em 16 envios nas últimas 48 h. Os outros levaram de 1,2 s a 9 s.
- O `fetch` para a Meta não tinha prazo. Por isso, um travamento do lado da Meta prendia a tela do vendedor pelo tempo que durasse.

### O conserto (`a2ba8cc`, ainda não está no ar)

**Prazo:** 20 s no envio à Meta, com `AbortController` cobrindo a resposta inteira. Vale para texto, mídia, modelo, Instagram e Messenger.

**Quando o prazo estoura:**
- a mensagem é gravada com `status_entrega = 'falha_envio'` e `erro_envio = 'timeout_meta'`;
- o app recebe 504 com `codigo: 'timeout_meta'`;
- a mensagem de erro avisa que ela pode ter chegado e pede para conferir antes de reenviar.

**Confirmação atrasada (WhatsApp):** todo envio leva uma marca `crm:<uuid>` em `biz_opaque_callback_data`, e a linha que estourou o prazo é gravada com essa marca. Quando o webhook de status chega com a marca:
- a linha ganha o id real da Meta e o erro é limpo;
- o status segue normal (entregue, lida).

Instagram e Messenger não devolvem a marca: se a mensagem saiu, o eco entra como uma mensagem enviada separada.

**No chat:**
- a bolha não some e o texto não volta para o campo, para evitar envio duplo sem perceber;
- a bolha mostra o ícone de alerta, "sem confirmação" e o botão **Tentar de novo**;
- quando a confirmação atrasada chega, a bolha vira ✓✓.

Medido na cópia, com a Meta simulada:

| Caso | Resultado |
|---|---|
| Meta normal | 200 em 0,8 s, gravada como enviada, com o id da Meta |
| Meta lenta (25 s) | 504 em 20,1 s, gravada como `falha_envio` / `timeout_meta`, com a marca |
| Status atrasado com a marca | linha com o id real, `entregue`, erro limpo |

**Não testado na cópia:** a bolha no navegador, porque não há Realtime local. Fica para o smoke do deploy.

---

## 3. Saúde do dia

Foto a cada 2 h, só leitura. O arquivo com as fotos fica em `D:\Nexus-Copia\saude\2026-10-20.md`.

O que cada foto mede:
- mensagens do dia por canal (recebidas / enviadas);
- respostas 5xx na Vercel;
- respostas 5xx na Edge;
- erros no Postgres;
- tamanho de `integracao_eventos`.

| Foto | Mensagens hoje (rec / env) | 5xx Vercel | 5xx Edge (desde 0h) | Erros Postgres (desde 0h) | `integracao_eventos` |
|---|---|---|---|---|---|
| 09:12 | Mogi 15: 20 / 3 · IG 26: 1 / 0 · Jaguariúna 28: 22 / 8 | 2 × 500 em `/api/webhook/c2s/imobiliaria-cf893076` às 07:55 (deploy anterior ao corte) | 0 | 0 | 11.348 linhas, 40 MB (banco 324 MB) |
| 10:13 | Mogi 147 / 222 · IG 2 / 4 · Jaguariúna 51 / 68 | só os 2 do C2S às 07:55 | 0 | **8 depois do corte**: 7 timeouts no dashboard do ZapIntel (08:58–09:05) e 1 ao abrir o chat (10:11). Causa: a view `lead_mensagens` (ver a seção 5) | 11.401 linhas, 40 MB (banco 326 MB) |
| 10:40 | Mogi 191 / 343 · IG 3 / 7 · Jaguariúna 54 / 76 | 0. C2S depois do corte: 83 POST, todos 200, 6 leads novos | 0 | 0 do app desde a correção da view (10:36) | — |
| 10:45 | entrando | 0 | 1 (Edge de 60 a 144 s por chamada) | 8 timeouts (10:44–10:46), **durante o dump do `public`** | — |
| 11:00 | entrando | 0 | 0 desde 10:50 | 0 desde 10:47 | — |
| **11:04–11:20** | — | — | 546, 504 e 503 em série; Edge com mediana de 100–150 s até 11:20 | **API fora até 11:11; ver a seção 6** | — |
| 11:20–11:30 | entrando | — | 0; mediana 1,3–1,5 s, p90 ~3 s | 0 do app | — |

**Os dois 500 do webhook C2S da imobiliária:** aconteceram antes do corte, mas esse webhook cria leads, que agora passam pela view. Por isso ficam em observação.

---

## 4. Item de negócio, não técnico: 2.297 mensagens não lidas em Jaguariúna

A loja 6 tem **2.297 mensagens não lidas, de 306 contatos**, com data anterior a 20/10. A mais antiga é de 28/08.

**Não é defeito.** Conferimos que todas foram gravadas na hora em que chegaram, nenhuma veio de reenvio ou de importação de histórico (a importação grava como lida). São conversas reais em que um cliente escreveu e ninguém abriu.

**O que fica para o dono da loja decidir:**
- **Ação imediata:** passar pelas 306 conversas e marcar como resolvidas as que já foram atendidas por fora (o celular da loja usa o app do WhatsApp em coexistência, então parte delas pode ter sido respondida direto no aparelho).
- **A pergunta de verdade:** quantos desses 306 contatos eram clientes esperando resposta. É venda perdida por falta de atendimento, não por falha do sistema.
- **Sugestão de rotina:** a fila do dia e o contador de não lidas já existem. Falta alguém responsável por zerar a caixa da loja 6 todos os dias.

**O que não fazer:** marcar todas como lidas de uma vez pelo banco. Isso apaga o sinal antes de alguém olhar.

---

## 5. A view `lead_mensagens` lenta, corrigida às 10:36 (`69579bf`)

**Sintoma:** abrir o chat ficou lento depois do corte, e às 10:11 uma abertura passou dos 8 s e caiu por timeout. O dashboard do ZapIntel teve 7 timeouts entre 08:58 e 09:05.

**Causa:** a view do corte achava o negócio principal mensagem por mensagem (`LEFT JOIN LATERAL` sobre `mensagens`). Por isso o filtro `lead_id = X` não tinha onde se apoiar:
- **chat:** cada abertura lia as ~80 mil mensagens da empresa;
- **dashboard:** o `zapintel_turnos` cruzava 499 leads ativos com essa varredura, ou seja, 40 milhões de linhas.

**Correção:** a view passou a partir do negócio (`n.id` = principal do contato; mensagens pelo índice de contato), mais as mensagens de contato sem negócio, com `lead_id` nulo, num `UNION ALL`.

**Conferências:**
- **mesmas linhas:** 80.162 na cópia, com 0 diferenças nos dois sentidos;
- **dashboard idêntico** ao da view antiga, rodando as duas no mesmo instante;
- **os 22 usos de `lead_mensagens` no código, medidos na cópia:** nenhum passou de 500 ms. O pior é o assistente procurando quem citou um produto, de 123 para 191 ms.

| Medida em produção, como usuário logado | Antes | Depois |
|---|---|---|
| Chat do lead 3598 (61 mensagens) | 2.548 ms (1ª) / 55 ms | 11 ms (1ª) / 1–2 ms |
| Trecho do `zapintel_turnos` (EXPLAIN) | 38,7 s | 2,6 s (1ª) / 225 ms |
| `zapintel_dashboard` inteiro | timeout (> 8 s) | 3,1 s (1ª) / 1,1 s |

A primeira execução em cada conexão custa cerca de 2,4 s a mais, com a view velha e com a nova. Não é efeito da view e não investiguei a causa.

---

## 6. Incidente de 20/10, 11:04–11:20: a API fora e a Edge degradada durante a limpeza

### Linha do tempo (horário de São Paulo)

| Hora | O que aconteceu |
|---|---|
| 10:42–10:46 | Dump completo do `public` pelo operador (Bloco 1 da limpeza). Levou **230 s**; no corte, antes do expediente, foram 26 s. Durante o dump, a Edge levou de 60 a 144 s por chamada, houve 8 timeouts do app no Postgres e 1 resposta 5xx da Edge. |
| 10:47–11:03 | Tudo de volta: Postgres sem erro, Edge com mediana de 1,8–2 s. Dumps pequenos às 11:00 (`backup` e `evolution`, menos de 1 MB). |
| 11:04 | Migração da retenção aplicada (2.1: procedure, tabela de registro e pg_cron). **Todo DDL faz o PostgREST recarregar o cache de schema.** |
| 11:04:44 | Primeira purga do `historico_bruto`, em lotes de 500 com pausa de 1 s. Seis lotes passaram (**3.000 de 4.573 linhas**). O 7º estourou o tempo limite de 2 min às 11:06:53. |
| 11:04–11:08 | Com o banco lento, a recarga do cache do PostgREST falhou várias vezes (`PGRST002: Could not query the database for the schema cache`), e **a API passou a responder 503 para todo mundo**: app e Edge. Pico de 785 erros às 11:07. |
| 11:07:53–11:09:17 | A Edge não conseguia buscar o canal, tratava o evento como órfão e respondia 200. **97 eventos da Meta descartados.** |
| 11:08:05 | Cache de schema carregado (a consulta levou 8,4 s). PostgREST reconectado às 11:08:47. |
| 11:09–11:10 | Mais ~550 respostas 5xx, de chamadas que estavam na fila. |
| 11:10–11:17 | Mais 13 timeouts no Postgres e **35 falhas de gravação na Edge** (26 ecos, 9 recebidas). |
| 11:11 | API sem 5xx. |
| 11:11–11:20 | **A Edge segue degradada:** ~780 chamadas com mediana de 100–150 s (muitas 546, o limite de 150 s), boa parte reenvio da Meta represado. |
| 11:20 | Normal: mediana 1,3 s, p90 2,9 s, 0 erro do app. |

### Causa provável

**O disco do plano free estava sem fôlego desde o dump das 10:42.** Duas evidências:
- o dump levou quase 9 vezes o tempo de antes do expediente;
- um lote de 500 linhas passou de 2 minutos (cada linha tem ~15 KB de TOAST).

Sobre isso vieram duas cargas: a purga, apagando TOAST, e a recarga do schema pelo DDL.

**O que o painel do Supabase mostrou depois** (Observability → Database, gráfico de CPU, pontos de 2 min):

| Hora | IOwait | CPU total | IOPS (máx. 3.000) |
|---|---|---|---|
| 10:02–10:08 (antes) | 4–9% | 7–16% | 11–17 |
| 10:44–10:46 (dump) | **sem dado**: o coletor de métricas não conseguiu ler o banco | — | — |
| 10:48 | **58%** | 75% | 23 |
| 11:04–11:18 (incidente) | **sem dado** de novo | — | — |
| 11:20 | **64%** | 82% | 19 |
| 11:22–11:32 | 9–15% | 13–22% | 13–23 |

- **CPU 98%:** é o máximo do dia no painel de infraestrutura, e quem enche a CPU é o IOwait: o processador esperando o disco. Contas de verdade (User) ficaram abaixo de 18%.
- **Poucas operações e muita espera:** as operações por segundo ficaram baixas (~20 de 3.000), mas a espera pelo disco foi alta. Isso aponta para o limite de banda de disco da própria máquina (t4g.nano), não o do volume.
- **O painel do plano free não mostra o *Disk IO budget* em porcentagem.** O que dá para acompanhar é o IOwait no gráfico de CPU. O "Disk IO 1%" do dia, no painel de infraestrutura, é consumo médio e não pegou o pico.

**O que transformou lentidão em perda** foi um defeito antigo da Edge:
- erro de banco na busca do canal era tratado como "canal não existe";
- o evento era descartado com 200, e a Meta não reenvia quando recebe 200;
- esse "não existe" ainda ia para o cache do worker, então o evento seguinte também virava órfão, mesmo com o banco já de volta.

Corrigido em `85250c3`: erro de banco responde 500 e a Meta reenvia. **No ar desde 20/10 19:43 (Edge v66).**

### Os 97 eventos descartados, por canal

| Canal | `messages` (mensagem do cliente ou status) | `smb_message_echoes` (resposta pelo celular) | Outros |
|---|---|---|---|
| Mogi (15, `1252570627941541`) | 26 | 27 | — |
| Jaguariúna (28, `1390168490838928`) | 13 | 12 | 1 `smb_app_state_sync` |
| Instagram @jmstore_importados (26, `17841460104258132`) | 18 (mensagens, ecos e status do Instagram vêm todos no mesmo evento) | | |

- **Não dá para saber quantos eram mensagem de cliente:** o log guarda só o canal e o campo, não o conteúdo, e parte dos `messages` é status de entrega ou leitura.
- **Outras 33 mensagens tiveram erro de gravação com o id registrado** ("gravar mensagem recebida" ou "gravar echo", entre 11:04 e 11:17).
  - Nesses casos a Edge demorou ou caiu, e a Meta reenviou: **29 já estão no banco**.
  - **4 continuam faltando:** 3 respostas pelo celular (ecos) e 1 mensagem recebida. Os ids estão nos logs da Edge (`function_logs`, "gravar", 20/10 14:03–14:20 UTC).
  - Quatro mensagens de WhatsApp não voltam pela API; só pelo celular.

### O que dá para recuperar

- **Instagram (canais 25 e 26):** dá. A API do Instagram lista as conversas e as mensagens com o id.
  - O script `scripts/recuperar-instagram-20261020.mts` busca a janela 11:06:30–11:10:30.
  - Ele pula o que já existe e grava o que falta por `mensagem_registrar`, de forma idempotente. Sem lead, só lista: não cria.
  - **Preparado, não rodado.** Simula por padrão; `--gravar` grava.
- **WhatsApp (Mogi e Jaguariúna):** a Cloud API não tem como listar mensagens passadas. O que se perdeu só volta se o cliente escrever de novo, ou pela sincronização de histórico da coexistência, se a Meta mandar outra.
  - **Ação de negócio:** avisar Mogi e Jaguariúna de que mensagens recebidas entre 11:07 e 11:10 podem não ter aparecido no CRM; conferir no celular.

### Estado depois do incidente

- **Retenção:** está no ar. Faltam **1.574** linhas do `historico_bruto`, para o cron das 04:00.
  - O cron hoje chama `ops.purgar_retencao()` com o padrão de **5.000 por lote**.
  - A troca para 500 (`cron.alter_job`) fica para depois das 18h.
- **Regra nova no runbook (05):** gate de IOwait no gráfico de CPU do painel. Acima de 20%, não começar; acima de 30% durante a operação, parar. I/O e DDL só fora do expediente.
- **Decisão do Lucas (20/10):** nada mais em produção com a loja aberta enquanto estivermos no plano free. Sem Supabase Pro.

---

## 7. A noite de 20/10 (18:13–21:40): limpeza, deploy e o que apareceu nos testes

Loja fechada. Gate de IOwait em todo item (acima de 20% não começa, acima de 30% para). O IOwait ficou entre 0 e 18% a noite toda; os picos foram das próprias operações.

### O que foi feito

| Hora | Item | Resultado |
|---|---|---|
| 18:1x | 0.2 cron da retenção | `call ops.purgar_retencao(500, 1)` às 04:00 (lotes de 500, pausa de 1 s) |
| 18:21 | 2.2 índices | 2 índices de FK em `tarefas` (CONCURRENTLY); 8 índices nunca usados que não cobrem FK, fora |
| 18:2x | 2.3 | `v_inventario_veiculo` fora |
| 18:34 | 2.4 régua de follow-up | rota, cron e card fora; 1.112 tarefas de automação abertas apagadas (3 lotes, 7,1 s); `followups_gerados` fora |
| 18:39 | 2.5 tenant 3 (Imobiliária) | `hard_delete_empresa(3)` em 36 s; 0 linha restante; rota do C2S responde 404 `not_found` |
| 18:4x | 2.6 / 2.7 | schemas `backup` e `evolution` fora; `old_leads`, `old_clientes`, `old_lead_mensagens`, `old_canais_conectados` fora |
| 19:24 | 2.8 índice da view `leads` | `negocios_contato_principal_idx`; contagem de não lidas 20,5 → 18,2 ms |
| 19:26 | 2.9 Realtime | `tarefas` fora da publicação |
| 19:43 | 3.2 / 3.3 | `ops.webhook_recebidos` + Edge **v66** (reenvio, prazo de 20 s, 500 com banco fora) |
| 19:48 | 3.3 app | main `0699fdf` no ar |
| 20:13–20:19 | 3.4 testes | (a) 4 mensagens nos 4 canais; (c) resposta pelo CRM; (d) `/api/whatsapp/send` 200; (e) lead e 2ª via; (f) funil; (g) anon 0 / authenticated 22; (h) menu |
| 20:56 | principal por loja | ver abaixo |
| 20:59 | furo do `security_invoker` fechado | ver abaixo |
| 21:0x | RLS de `contatos` e `storage_orfaos` | ver abaixo |
| 21:17 | deploy | main `6a25a66` no ar |
| 21:2x | 3.5 | `campanhas_fidelidade`, `lista_espera`, `solicitacoes_marketing` fora (vazias) |
| 21:2x | bloco 4 Instagram | simulação: 5 mensagens na janela do incidente, **as 5 já gravadas**; nada a recuperar |
| 21:37 | bloco 5 vacuum | `historico_bruto` 69 MB → 69 MB (ver abaixo) |

**Banco:** 329 MB (18:13) → **191 MB** (21:37, 200.584.339 bytes). **Em `public`:** 103 tabelas e 46 views, todas com `security_invoker`.

### O que o Lucas achou no teste (a): duas lojas, um card

Ele mandou "Teste" para o WhatsApp de Mogi e o de Jaguariúna; as duas mensagens caíram no card de Mogi (3598). O card de Jaguariúna (3548) ficou sem a conversa dele. Três peças:
- as views `leads` e `lead_mensagens` escolhiam **um** principal por contato (ativo mais recente), sem olhar a loja;
- o gatilho de filial dava à mensagem e à conversa a loja do **contato**: a mensagem 274137, do canal de Jaguariúna, nasceu "de Mogi". Em produção eram 24 conversas e 107 mensagens assim;
- `core_negocio_do_canal` devolvia nada quando o contato não tinha negócio na loja do canal.

**Conserto (`721a063`):** principal, badge, última mensagem e mensagens por contato **e loja**; mensagem e conversa de canal têm a loja do canal (`core_filial_do_canal`); `core_negocio_do_canal` cria o negócio que falta (mensagem enviada não reabre nem cria). Produção: 82.445 mensagens, 0 perdidas ou duplicadas, 0 fora da loja do canal, 0 negócio de loja com conversa vazia. A loja antiga das linhas corrigidas ficou em `ops.volta_filial_20261020`.

O `/api/whatsapp/send` (PDV e OS) enviava e não gravava: o recibo chegava no celular e não aparecia no card. Agora grava pela `mensagem_registrar` (`34e7174`); testado às 21:19 (274145, card 3598, entregue).

### O furo do `security_invoker` (20:56:47 → 20:59:31, 2 min 44 s)

- **Causa:** a migração do principal por loja recriou `leads` e `lead_mensagens` com `CREATE OR REPLACE VIEW` sem `with (security_invoker = true)`. O replace **apaga** as opções que não forem repetidas; as views passaram a rodar como o dono (postgres, que ignora RLS).
- **Efeito:** a separação por loja não valia por essas duas views. Um vendedor de Jaguariúna lia 1.885 cards e 61.762 mensagens de Mogi. **Só a JM tem dados** (o tenant 3 já tinha saído às 18:39): nenhuma outra empresa exposta.
- **Achado** no teste do card nas duas lojas, ao medir o que um vendedor de Jaguariúna enxergava. Corrigido com `ALTER VIEW ... SET (security_invoker = true)` às 20:59:31.
- **Trava em duas camadas (`1884960`):**
  1. **Banco:** event trigger `exigir_security_invoker` no fim de todo `CREATE VIEW` / `ALTER VIEW`. Se qualquer view de `public` ficar sem a opção, o comando falha e a migração inteira volta. Testado na cópia: recusa o replace sem a opção, aceita com ela.
  2. **Build:** `scripts/check-views.mjs` no `npm run build` (o build da Vercel) e no `npm run check`. Acompanha as views pelos arquivos de migração; sem a correção, reprova `leads`, `lead_mensagens` e `storage_orfaos`. Limite: as views criadas pelo script do corte (SQL dinâmico) só a trava do banco vê.
- `storage_orfaos` também estava sem a opção, e com SELECT para anon e authenticated (lista nomes de arquivo do `chat-midia`). Passou a `security_invoker` e a só `service_role` (`6a25a66`); a retenção lê como `service_role`.
- Produção depois: 46 views, todas com a opção.

### Os 69 cards que faltavam por loja desde o corte

A view `leads` junta `contatos`, e a RLS de `contatos` olhava só a loja do contato. Contato com negócio nas duas lojas tem **uma** loja: na outra, o contato sumia e levava o card junto (as mensagens do negócio apareciam, o card não). Desde o corte, **faltavam 60 cards em Mogi e 9 em Jaguariúna**.

**Conserto (`a3de246`):** o contato fica visível para quem enxerga a loja dele **ou** tem negócio ou conversa numa loja que a pessoa enxerga (só a leitura). Testado na cópia com um vendedor de cada loja e com o dono em Mogi, em Jaguariúna e na rede: cards = negócios visíveis, 0 de outra loja, 0 contato sem vínculo, contatos das duas lojas 88/88 e 62/62. Kanban 110 → 115 ms. Produção: Mogi 1.885 cards = 1.885 negócios; Jaguariúna 671 = 671.

Na tela às 21:18: o card do Lucas em Mogi (3598) só com a conversa do número de Mogi; em Jaguariúna (3548), só com a do número de Jaguariúna.

### Item para o card novo: o formulário marca "alteração não salva" ao abrir

Ao abrir o card 3548 em Jaguariúna, o formulário mostrou **"alteração não salva"** e o botão Salvar sem ninguém ter mexido em nada. Fechado sem salvar. Não investigado: o card novo (reconstrução) deve comparar com o valor carregado, não com o estado inicial vazio.

### Vacuum do `historico_bruto` (bloco 5)

Às 21:37:33, pelo operador (`sql-vacuum-historico`). Gate: 21:22–21:37 abaixo de 10% (máx. 8,75%), último ponto 1,6%.

| | total | tabela | vivas | mortas |
|---|---|---|---|---|
| antes | 69 MB | 2,9 MB | 2.440 (estimativa) | 0 |
| depois | 69 MB | 2,9 MB | 2.329 | 0 |

- `VACUUM (VERBOSE)` em **0,46 s**: 0 páginas removidas, 0 linhas mortas (o autovacuum já tinha passado às 11:07, depois da purga do incidente), 29 páginas sujas, 12 KB de WAL.
- **Não devolve espaço ao disco**, como era de esperar: o VACUUM comum só marca para reuso. Os 66 MB são TOAST de 14.719 pedaços dos pacotes brutos. Quem diminui a tabela é a retenção (cron das 04:00, 7 dias), e o espaço volta ao disco só com `VACUUM FULL`, que trava a tabela e não foi feito.

### O que NÃO foi dropado, e por quê

| O quê | Por quê |
|---|---|
| `segmentos_config` (7 linhas) | o menu lê (11 arquivos) |
| `complementos_empresa` (2 linhas) | liga o ZapIntel por empresa; o cron `ponte-vendas` lê (6 arquivos) |
| `lead_atribuicoes` (191 linhas) | a distribuição de leads lê (3 arquivos) |
| `historico_bruto` (2.440 linhas, 69 MB) | retenção de 7 dias pelo cron das 04:00; a tabela fica |
| as 18 colunas `obsoleta` de `empresas` | não estavam no escopo da noite |
| ~89 índices nunca usados | cobrem FK; só os 8 que não cobrem saíram |
| views de compatibilidade (`leads`, `lead_mensagens`, `clientes`, `canais_conectados` e as 37 de módulo) | as telas ainda leem; caem conforme migrarem (05) |
| `v_orfaos_chat_midia` | sem leitor no código: candidata para a próxima leva |
| `ops.volta_filial_20261020` (131 linhas) | volta do principal por loja; apagar depois de 14 dias |
| usuário do auth do dono do tenant 3 | `auth.users` fora do escopo; decisão do Lucas |
| `types/database.ts` cita as tabelas apagadas | arquivo gerado; regenerar |

### Pendente

- **(b) reenvio em menos de 1 s:** não houve reenvio real da Meta nas janelas da noite. A Edge v66 grava os hashes (23 em `ops.webhook_recebidos` às 21:2x). Conferir amanhã numa janela de 15 min.
- **POSTs reais do C2S levando 404:** a rota responde 404; os POSTs do C2S não foram conferidos (o MCP da Vercel está sem acesso ao time, 403).
- **Instagram de Jaguariúna (canal 25):** a busca de perfil às 20:14 deu "session invalidated because the user changed their password", mas o envio funciona (resposta às 20:37 com ✓). Acompanhar.

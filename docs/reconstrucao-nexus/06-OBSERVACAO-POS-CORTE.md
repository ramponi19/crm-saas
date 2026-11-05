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

## 8. Hotfix das tarefas (21/10, deploy próprio às 09:53)

### O defeito
O corte (20/10, `migrar_jm_para_core.sql`, passo da linha 559) deu a `tarefas` a coluna `negocio_id` com chave para `negocios`, ao lado de `lead_id`, que já apontava para lá. Com duas chaves para a mesma tabela, o embed `leads(nome)` ficou ambíguo e o PostgREST passou a responder **PGRST201** em quatro pontos:

- `/tarefas`: a lista vinha **vazia** — a página ignora o `error` e mostra lista nenhuma;
- criar tarefa pela tela: o insert com `select('*, leads(nome)')` falha **inteiro**, nenhuma linha gravada;
- painel: o card "Meus follow-ups" sumia; painel da imobiliária: o bloco de tarefas sumia.

Nada chegou ao Sentry (o erro era engolido pela tela). Achado na Etapa 0, testando o painel na cópia.

**Retrato em produção:** tarefas criadas por dia — 17/10: 2; 19/10: 4; **20/10: 0; 21/10 até o conserto: 0**. Ninguém conseguiu criar tarefa pela tela por cerca de 1 dia e meio.

### O conserto
`leads!tarefas_lead_id_fkey(nome)` nos quatro pontos (commit `eb9a485` em main, cherry-pick do `5fc4b39` da `feat/etapa-0` mais o card do painel, que na main ainda tinha o embed antigo). Varredura: das tabelas com 2+ chaves para a mesma tabela, só `tarefas` e `cadencia_inscricoes` ganharam a segunda no corte, e `cadencia_inscricoes` não tem embed de leads no código.

### O deploy
- Gate: tsc 0, testes 151/151, build ok (avisos no teto de 41), verificador 468 ok (5 falhas antigas da IA do ZapIntel).
- IOwait antes do push: 3,5% (última meia hora entre 3% e 11%, um pico isolado de 27,9% às 09:43, já passado). Regra: < 20%.
- Push 09:50:59 → Vercel pronto 09:53:17.

### Teste em produção (dono da JM)
- `/tarefas` em **Mogi Guaçu**: 8 atrasadas, 9 a fazer, 20 concluídas, com o nome do lead.
- `/tarefas` em **Jaguariúna**: 1 atrasada, 4 a fazer, 5 concluídas, com o nome do lead.
- Criada pela tela, em Mogi, a tarefa "TESTE DEPLOY 21/10 — apagar" (lead Lucas Ramponi): aviso "Tarefa criada", apareceu na lista com o nome do lead (A fazer 9 → 10) e **não** apareceu em Jaguariúna. Apagada pela tela; conferido no banco: 0 linhas de teste restantes.
- "Listar e criar tarefa" entrou no smoke de todo deploy (05, passo f).

## 9. C2S desligada (21/10, ~14h)

- **Por quê:** a C2S chamava `/api/webhook/c2s/<slug>` da imobiliária (tenant 3, apagado em 20/10) ~556 vezes por dia; cada chamada subia uma função da Vercel, abria o Supabase e devolvia 404. Nenhuma empresa usa a integração.
- **Do lado da C2S:** a assinatura (3 gatilhos, feita em 24/08 pela API, com o token da conta da imobiliária) foi desfeita com `POST https://api.contact2sale.com/integration/api/unsubscribe`, um por gatilho, rodado pelo Lucas no terminal dele com o token da conta C2S (autorizado por ele; o token não passou pela conversa nem foi gravado). Conferência antes (`GET /company`): HTTP 200, conta da imobiliária. Resposta: `on_create_lead`, `on_update_lead` e `on_close_lead` → HTTP 200 `{"success":true,"message":"Unsubscribed successfully"}`.
- **Do nosso lado (feat/navegacao, deploy de 21/10 à noite):** a rota saiu e o 404 vem estático, sem função nem middleware; o "assinar" da tela recusa (409). Religar = restaurar a rota antes de tirar o bloqueio.
- **Conferir:** em Observability → Functions, `/api/webhook/c2s/[slug]` deve zerar (a C2S parou de chamar; e depois do deploy, mesmo que chamasse, não haveria função).

## 10. ZapIntel: "a consulta demorou demais" o dia inteiro desde o corte (diagnóstico de 21/10)

**Sintoma:** as telas do ZapIntel mostram "a consulta demorou demais, tente em instantes" o dia inteiro desde o corte de 20/10. O papel `authenticated` tem `statement_timeout = 8s`; o que passa disso é cancelado.

### Produção — pg_stat_statements (só leitura, Q2 canônica com `max`)

Janela: do zeramento de 20/10 16:07:17 até 21/10 16:50 (`D:\Nexus-Copia\saude\pgss-20261021-1650.json`, 693 entradas). A Q2 ganhou o campo `max` nesta foto (é o novo canônico, ver o LEIA-ME). Recorte em node: tudo com `zapintel` no texto, por tempo médio.

| Consulta | Papel | Chamadas | Média | Máximo | Lê de |
|---|---|---|---|---|---|
| zapintel_dashboard (rpc) | authenticated | 19 | 4,1 s | **7,95 s** | views `leads` + `lead_mensagens` |
| zapintel_leads_com_conversa (rpc) | service_role | 9 | 2,9 s | 3,83 s | views |
| zapintel_analises_pendentes (rpc) | service_role | 7 | 2,5 s | 4,71 s | views |
| zapintel_resumo (rpc) | authenticated | 78 | 1,7 s | 6,62 s | views |
| zapintel_escopo (rpc) | authenticated | 16 | 58 ms | 339 ms | tabelas próprias |
| zapintel_lead_perfil (leitura e gravação) | service_role | 846 | 2–11 ms | 332 ms | tabela própria |
| zapintel_venda_lead, midia_retida, zapintel_ativo | service_role | 35 | ≤ 33 ms | 50 ms | tabelas próprias |

**Quantas passaram de 8 s: o pg_stat_statements não diz.** Consulta cancelada por `statement_timeout` termina em erro e não entra no pgss — o `max` acima é sempre de quem terminou. Por isso o dado mais forte é o que FALTA: `zapintel_dashboard_lista`, `zapintel_leads_lista`, `zapintel_insights`, `zapintel_posvenda`, `zapintel_atendimento` e `zapintel_conversa` têm **zero chamadas terminadas** em 24 h. Ou ninguém abriu (improvável para o dono, o dia todo), ou toda chamada morreu nos 8 s. O dashboard terminou 19 vezes, com máximo de 7,95 s: encostado no teto.

O job `zapintel-conversa-aquecer` (que prepara o "Como a loja conversa") rodou 1 vez no período e **falhou por statement timeout aos 120 s** (`cron.job_run_details`). Sem ele, o cache não se atualiza e a tela calcula na hora — e também morre.

**Todas as RPCs pesadas leem pelas views de compatibilidade `leads` e `lead_mensagens`.** Nenhuma lê `negocios`, `mensagens` ou `contatos` direto. (O "clientes" de insights e posvenda é chave do JSON, não a view `clientes`.)

### Na cópia (crm_zap = crm_etapa0, o estado da produção depois da Etapa 0), como o dono da JM, sem o teto

2ª rodada de cada chamada, cache quente (`scratchpad/zapcore/bench.sh`):

| RPC | Tempo |
|---|---|
| zapintel_conversa_calc (30 dias) | **200,0 s** |
| zapintel_insights (tudo) | **134,2 s** |
| zapintel_insights (30 dias) | **74,3 s** |
| zapintel_dashboard | 1,42 s |
| zapintel_atendimento (30 dias / loja 3) | 1,28 s / 1,14 s |
| zapintel_turnos (30 dias) | 0,48 s |
| zapintel_analises_pendentes | 0,47 s |
| zapintel_leads_com_conversa | 0,47 s |
| zapintel_resumo | 0,31 s |
| zapintel_dashboard_lista / leads_lista | 0,27–0,28 s |
| zapintel_posvenda | 0,20 s |

A cópia (máquina local) é 3–5× mais rápida que o banco free: o dashboard dá 1,4 s aqui e 4,1 s de média lá — por isso, lá, ele raspa nos 8 s e insights e conversa nunca terminam.

### EXPLAIN ANALYZE das 3 piores (auto_explain com `log_nested_statements`, como o dono da JM, na cópia)

1. **`zapintel_insights` (76,7 s):** quase tudo no `PEDIU` (clientes a quem a loja pediu indicação). Ele junta `lead_mensagens` com 150 clientes, e para **cada** cliente o plano faz duas varreduras sequenciais completas de `mensagens` — uma por ramo do UNION da view (o do principal e o "sem negócio", com NOT EXISTS). 150 × 2 × 80 mil linhas. O `lead_id` da view é calculado (subconsulta correlacionada por mensagem), então nenhum índice serve.
2. **`zapintel_conversa_calc` (216,9 s):** 155 s num nested loop do `E` que varre o CTE `MT` (16 mil mensagens) **17.356 vezes**, e mais 28 s igual no `SEQ`. A causa é a estimativa: sobre a view, o planejador acha que `MT` tem 5 linhas (são 40 mil), `AUT` 1 (são 17 mil) e `L` 24 (são 2.314) — e escolhe laço onde devia escolher hash.
3. **`zapintel_dashboard` (1,2 s):** espalhado — `MODELOS` (300 ms), `zapintel_turnos` (243 ms), várias agregações de `lead_mensagens` da empresa inteira, e subconsulta por lead dentro de laço (fila e `SIL`).

**Causa de fundo:** as duas views calculam o negócio principal de cada contato e loja **linha a linha**. Para a tela de um lead isso é barato (conserto de 20/10); para uma tela da empresa inteira — que é o ZapIntel — vira varredura em laço, e as estimativas ficam erradas a ponto de o planejador escolher o pior plano. Além disso, toda função filtra `coalesce(filial_id, 0) = any (lojas)`, uma expressão sem estatística: o Postgres chuta 0,5% por loja (36 negócios estimados onde há 2.386).

### O conserto (branch `fix/zapintel-core`; migrações `20261022001000` e `20261022001100`, aplicar DEPOIS dos drops da Etapa 0)

- **`20261022001000_zapintel_le_o_core.sql`:** três helpers SQL (`zapintel_principal`, `zapintel_mensagens`, `zapintel_negocios`) leem `negocios`, `mensagens`, `contatos` e `funil_etapas` direto, com a MESMA regra das views (principal = por contato e loja, o ativo mais novo), calculada uma vez em conjunto (DISTINCT ON) e casada por igualdade (`coalesce(filial_id, -1)`, que permite hash join; IS NOT DISTINCT FROM não permite). As 11 funções do ZapIntel passam a ler deles; nas buscas por um lead dentro de laço (fila, silêncio, modelo, largadas), onde a linha já é o principal, leem `mensagens` pelo contato e loja (índice `mensagens_contato_idx`). Ajustes só de plano: `SEQL` materializado e o bloco `venda` do conversa_calc agregando antes de juntar; `F` do atendimento embutido. Helpers fechados para anon/authenticated; dono `postgres`.
- **`20261022001100_zapintel_estatisticas.sql`:** estatística das expressões `coalesce(filial_id, 0)` (negocios e mensagens) e do `ativo` do negócio, e ANALYZE. O EXPLAIN não pediu índice: pediu estatística (36 negócios estimados → 2.386 reais). Lock SHARE UPDATE EXCLUSIVE, não bloqueia leitura nem escrita.
- **`supabase/funcoes/zapintel_*.sql`** das 11 funções foram apagados (eram a fonte de 15/10, com as views; reaplicar um deles traria a lentidão de volta). Os grants delas estão na `20261020000000_revoke_rpc.sql`.

**Resultado idêntico:** numa transação só na cópia `crm_zap_antes` (o `now()` fica parado, então as janelas "últimos N dias" não andam), as 15 chamadas rodaram com as funções de hoje, a migração foi aplicada ali mesmo, as 15 rodaram de novo, e rollback. **13 idênticas; 2 (atendimento, rede e loja 3) com os mesmos elementos em outra ordem** no `cobertura` — `jsonb_agg` sem ORDER BY, que a tela lê num Map por dia e hora. Além disso, linha a linha: `zapintel_mensagens(e)` = primeiro ramo de `lead_mensagens` e `zapintel_negocios(e)` = `leads` nas colunas usadas, para as duas empresas (0 diferenças; 80.839 mensagens e 2.528 negócios da JM). Script `scratchpad/zapcore/mesmo-instante.sh`.

**Tempos na cópia** (mediana de 3 rodadas, dono da JM; antes = 2ª rodada da medição do diagnóstico):

| RPC | Antes | Depois |
|---|---|---|
| zapintel_conversa_calc (30 dias) | 200,0 s | **2,75 s** |
| zapintel_insights (tudo) | 134,2 s | 0,34 s |
| zapintel_insights (30 dias) | 74,3 s | 0,51 s |
| zapintel_dashboard | 1,42 s | 0,50 s |
| zapintel_atendimento (30 dias) | 1,28 s | 0,42 s |
| zapintel_atendimento (loja 3) | 1,14 s | 0,35 s |
| zapintel_leads_com_conversa | 0,47 s | 0,56 s |
| zapintel_turnos (30 dias) | 0,48 s | 0,21 s |
| zapintel_analises_pendentes | 0,47 s | 0,27 s |
| zapintel_posvenda | 0,20 s | 0,43 s |
| zapintel_leads_lista | 0,27 s | 0,18 s |
| zapintel_dashboard_lista | 0,28 s | 0,16–0,17 s |
| zapintel_resumo | 0,31 s | 0,13 s |

**Acima de 1 s, só o `zapintel_conversa_calc` (2,75 s)**, e é trabalho real, não plano ruim: autoria por janela e regex de gíria sobre 16 mil mensagens (montar o `E` custa ~1,2 s). Ele não é chamado pela tela no dia a dia: o job `zapintel-conversa-aquecer` grava o cache (teto de 120 s, que estourava) e a tela lê o cache (`zapintel_conversa`). Quem ainda chama ao vivo é o botão de recalcular — na produção (3–5× mais lenta) deve ficar perto dos 8 s; acompanhar. `posvenda` e `leads_com_conversa` subiram alguns centésimos e ficam bem abaixo de 1 s; na produção, de 0,2–0,5 s para algo perto de 1–2 s no pior caso — conferir no pgss depois do deploy.

### O resumo do menu sob demanda (hooks/zapintel)

`zapintel_resumo` (o menu do ZapIntel: conversas, mensagens, leads por loja) era a RPC mais chamada do ZapIntel na produção (78 em 24 h, média 1,7 s) porque toda aba o refazia a cada aviso do canal — de mensagem, de ficha refeita e de venda —, até uma vez a cada 20 s. Agora: **só com aviso de mensagem, no máximo a cada 30 s por aba, nunca com a aba em segundo plano, e ao voltar para a aba só depois que o teto passou** (antes consultava na hora). As outras telas ao vivo seguem como estavam (20 s, todo aviso).

A regra saiu para `hooks/zapintel/ritmo.ts` e o hook a usa; `tests/zapintel-ritmo.test.ts` simula com ela 3 abas por 10 minutos (uma mensagem a cada 15 s, ~240/h; uma ficha refeita por minuto; a aba 3 escondida do minuto 2 ao 8): **antes 75 consultas (31 + 31 + 13), depois 50 (21 + 21 + 8)**, nenhuma com a aba escondida, nunca duas em menos de 30 s.

**Não medido no navegador:** a medição com 3 abas reais contra o Supabase local (Realtime de verdade) não coube na memória da máquina em 21/10 (Docker + next dev + 3 abas com 1,9 GB livres). Fica para quando houver folga; o número acima é da simulação da regra, não do navegador. Depois do deploy, o pgss da produção dá a prova real (chamadas de zapintel_resumo por hora com a loja aberta).

## 11. Noite de 21/10: Etapa 0 + ZapIntel em produção (18:24 → 21:30, loja fechada)

**Ponteiro:** `ec10dd5` = `deploy/noite-20261021` (`ef06a07`) com a `fix/zapintel-core` por cima (merge; gate verde). Push `eb9a485..ec10dd5` para a main às 19:01:25 (avanço direto, 27 commits, todos do Lucas); Vercel READY às 19:03:45 (`crm-saas-qaxmrwp0c`, build de ~2 min); `/api/saude` respondeu `versao: ec10dd5`.

### Seguro e migrações

| Hora | Passo | Resultado |
|---|---|---|
| 18:24 | foto de saúde (só Postgres) | 196 MB, deadlocks 0, IOwait 1,9% |
| 18:41 | dump do `public` (`dumps/2026-10-22-etapa0/public.dump`) | 22,4 MB, 18,3 s, leitura de verificação ok (1.972 itens); `funil-antes.txt` |
| 18:47 | 20261021003150 | sem efeito (impressão digital de privilégios idêntica) |
| 18:48 | 20261021003155 | **não era sem efeito:** tirou o privilégio `MAINTAIN` (PG17) de anon e authenticated em 25 tabelas — o padrão do Supabase dá, a migração faz `revoke all` e regrava só o que a produção listava. Decisão do Lucas: **fica removido** (ninguém da API precisa de VACUUM/ANALYZE/REINDEX); comentário da migração corrigido |
| 18:52 | 003200 (menu), 003300 (`v_orfaos_chat_midia`) | ok |
| 18:53 | 003400 (inteligência no core) | as 2 empresas em `empresa_modulos('inteligencia')`; o job `zapintel-conversa-aquecer` lê de lá |
| 18:55 | 003500 (posse no histórico) | 1.066 linhas de posse antes e depois; 503 `atribuicao` viraram a ação detalhada (500 `distribuir`, 3 `pegar`); as 691 de `lead_atribuicoes` com par; nenhuma função lê a tabela |
| 18:56 | 003600 (empresa no core) | dados já iguais (0 diferenças); leitura de `empresa_dados_contrato` aberta a membro; `zapintel_resumo` lê `preset_onboarding` |
| 18:57 | 003700 + 003710 (pelo operador, fora de transação, 1,0 s) | tabela vazia, RLS sem política; índice único válido |
| 19:01–19:03 | push + deploy | READY |
| 19:04–21:18 | smoke (a)–(p) | todos ok (abaixo) |
| 21:19–21:21 | 20261022000100, 000200, 000300, 000400 (drops) | ok; antes de cada um, nenhuma função, view ou job citava a tabela/coluna (a única citação de `segmento` é a chave do JSON do `zapintel_resumo`) |
| 21:27 | 20261022001000 (ZapIntel lê o core) | ok; **23/23 funções `zapintel_*` idênticas** à referência (md5 do corpo e da assinatura, referência tirada aplicando o arquivo na cópia com rollback) |
| 21:27 | 20261022001100 (estatísticas) | ok |

API conferida depois de cada migração (5 leituras anônimas → 401/42501 em ~0,1–0,5 s, `/auth/v1/health` 200): nenhum 5xx a noite toda. IOwait: máximo 2,3% nas migrações de sincronização e 9,5% nos drops. **Pico de 72% às 19:16** (amostra de 2 min), durante o smoke: coincidiu com 3 aberturas seguidas da tela de Leads com modal (quadro com 1.760 leads; a última abertura passou de 10 s); nenhum job acima de 1 s no período; voltou a 2,8% às 19:18. Vale medir a tela de Leads à parte.

**Armadilha da conferência por md5:** o psql do Windows lê o arquivo em modo texto e grava o corpo das funções com CRLF; o MCP grava com LF. A referência só bateu normalizando (`replace(prosrc, E'\r\n', E'\n')`). Mesmo efeito que pegou a troca de texto da 003500 no `supabase start`.

### Pós-deploy, antes dos drops

- `comparar-menu`: **15/15 iguais** (fotos legado × core da produção, conferidas por md5; a foto legada foi tirada depois da 003200, que não toca nenhuma das fontes dela).
- `zapintel_acesso`: **15 ok** depois das sincronizações e de novo depois dos drops e da 001000.
- `comparar-empresa` / `comparar-contrato`: os scripts precisam de JWT assinado (só existe na cópia) e o de contrato grava uma emissão nova. Em produção, o equivalente pelo banco: leitura legado × core com a RLS de verdade (`role authenticated` + claims) para dono, admin e vendedor da JM e dono da empresa 5 — **4/4 iguais**, cada um vê só a própria empresa, e o vendedor passou a ver representante e banco. E a 2ª via real no smoke (h): **byte a byte igual ao arquivado** (contrato 84, SHA-256).
- `check-views` ok; anon 0 / authenticated 22.

### As 25 checagens do script do corte: não servem mais em produção

Rodadas pelo Lucas às ~21:36 (`psql -X -v ON_ERROR_STOP=1 -f supabase/scripts/migrar_jm_para_core.sql`): passos 0 e 1 pulados como esperado, e a **checagem 1 "empresas" falhou** — compara com a foto do corte (`migracao.o('empresas')` = 3) e a produção tem 2, porque o tenant 3 foi apagado na limpeza de 20/10. A regra que ela protege está de pé (2 empresas, 2 linhas em `empresa_branding`, `empresa_menu` e `empresa_dados_contrato`). Mais adiante cairia também a 10 ("old_* intactas"): as quatro `old_*` saíram em 20/10. O `BEGIN` do script desfez tudo; `migracao.checagens` continua com as 29 linhas do corte. **O script é instrumento do corte: compara contagens de 20/10 e não acompanha as limpezas depois dele.** As "25 checagens ok" da preparação eram da cópia, que ainda tinha as `old_*` e o tenant 3. O que elas cobrem foi provado na noite por outros caminhos (menu 15/15, zapintel_acesso 15, legado × core 4/4, funil, 2ª via, views, 0/22). **Pendente (fora da noite):** separar as checagens que seguem valendo num script só de leitura, sem passos e sem comparar com a foto do corte.

### Smoke (Mogi Guaçu e Jaguariúna, dono da JM)

(a) sessão do dono já aberta no Edge do chrome-devtools · (b) lucro e margem "sem custo lançado" nas duas lojas; funil 448 (Mogi) e 605 (Jaguariúna) = banco (o 441 do roteiro era de outro momento); "Meus follow-ups" só aparece com tarefa aberta (o dono tinha 0 — some por desenho) · (c) as ferramentas fora do menu; Simular parcela e Check IMEI no ⌘K e dentro de Orçamentos e Estoque; **FIPE não aparece para a JM** — é opcional de veículos/imobiliária e o varejo nunca a liberou · (d) 6 endereços antigos → 308 · (e) "Ativar" da Agenda gravou `modulo_pedidos` nº 1 · (f) 20 telas sem saudação nem botão flutuante · (g) funil igual, menos o lead 6553 (WhatsApp, 18:51, depois da foto) · (h) recebida "Teste" 21:13:22; resposta pelo modal 21:17:49 → `entregue`; `/api/whatsapp/send` 200 em 2,5 s; 2ª via idêntica · (i) tarefa criada, listada e apagada nas duas lojas · (j) 0/22 · (k) entradas iguais e tema resolvido = tela (preset `clara` usa o azul do sistema; sem logo) · (l) mensagem saiu às 21:17:49 e o dashboard do ZapIntel recarregou no mesmo segundo (826 → 827 enviadas) · (m) 5 trocas de período, 0 requisições · (n) `/api/saude` 200 sem banco · (o) C2S 404 estático · (p) 2ª abertura da conversa (13 fotos) servida do cache do navegador: mesma hora e mesmo token assinado da 1ª.

### ZapIntel em produção — antes × depois (tempo da RPC no navegador, dono da JM)

| Tela / RPC | Antes (21/10, ~21:15, funções antigas) | Depois (21:28–21:30) |
|---|---|---|
| Insights, período todo (`zapintel_insights`) | passava de 8 s → "tente em instantes" (134 s na cópia) | **1,64 s** |
| Dashboard (`zapintel_dashboard`) | 6,3–7,9 s | **1,01 s** |
| Lista de leads (`zapintel_leads_lista`) | — | **0,47 s** |
| Atendimento (`zapintel_atendimento`) | — | **1,10 s** |
| Menu (`zapintel_resumo`) | 4,2–5,7 s | 0,28–1,06 s |
| Botão "recalcular" (`zapintel_conversa` → `conversa_calc`, 30 dias) | passava de 8 s (200 s na cópia) | **5,3 s** |

Nenhuma tela com "tente em instantes". O recalcular ficou entre o da cópia (2,75 s) e o teto de 8 s, como previsto; é o único que vale acompanhar.

### Fica anotado

- Pedido de teste nº 1 em `modulo_pedidos` (Agenda da JM): atender ou apagar pelo superadmin.
- O "Última mensagem há N min" do dashboard do ZapIntel não conta a conversa do Lucas (lead no funil interno "Time JM"), por desenho; os contadores de mensagens contam.
- A conferência do Supabase local (103/46/82) ficou para trás: produção agora tem 101 tabelas, 45 views, 86 funções, 195 MB.
- Foto de saúde final (21:38, `D:\Nexus-Copia\saude\pgdb-20261021-2138.json`): 195 MB, deadlocks 0, mensagens na última hora — canal 15: 1 recebida / 2 enviadas (os testes do smoke), 26: 1/0, 28: 2/0. Docker Desktop fechado.

## 12. 22/10: deploy de dia da `feat/modulos` e noite (view de não lidas + corrida de identidade)

### Parte 0 — máquina
- 15,8 GB de RAM; a máquina reiniciou às 05:54 e não havia sobra para encerrar. `%USERPROFILE%\.wslconfig` com `memory=4GB` e `processors=2`. Docker só sobe com o IDE fechado e desce ao fim de cada teste (às 19:00 estava desligado).

### Parte 1 — observação (só leitura; fotos em `D:\Nexus-Copia\saude`, base do dia `pgss-20261022-0600.json`)

| hora | banco | IOwait | ZapIntel | observação |
|---|---|---|---|---|
| 08:32 | 196 MB | máx 10,5% (07:33–08:32) | dashboard 10× 2,82 s | — |
| 10:52 | 197 MB | máx 18,0% às 10:25 | dashboard 6× 3,57 s desde 08:32 | painel: memória comprometida 1,72 GB de 1,4 GB ("Severe"), swap 653 MB |
| 11:29 | 197 MB | pico 17,3% às 11:18 (smoke abrindo `/leads`) | dashboard 4× 3,43 s | deploy de dia no ar desde 11:13, sem 5xx |
| 12:32 | 197 MB | 22,1% às 11:42 (consultas de duplicados em produção) | nenhuma chamada 11:29→12:32 | — |
| 18:20 | 199 MB | tarde 12:00–18:12: média 4,0%, mediana 2,6%, máx 23,0% às 16:44 (único ponto > 20%), 0 > 30% | dia: dashboard 20× 3,17 s (máx 7,95 s), resumo 13× 2,39 s, análises pendentes 17× 2,50 s | `xact_rollback` +5.300 entre 12:32 e 18:20 (manhã +1.000), origem não identificada |

- **Mensagens do dia:** WhatsApp Mogi (15) 517 recebidas / 711 enviadas (226 áudios); WhatsApp Jaguariúna (28) 153 / 132; Instagram Mogi (26) 21 / 27; Instagram Jaguariúna (25) 1 / 1. Deadlocks 0 o dia todo.
- **ZapIntel desde o deploy de 21/10 19:03** (contra `pgss-20261021-1650.json`, a última foto antes; inclui 16:50–19:03 de 21/10): dashboard 26× 3,56 s, resumo 24× 2,18 s (sob demanda: 06–08:32 4, 08:32–10:52 6, 10:52–11:29 3, tarde 0), análises pendentes 21× 2,52 s, leads com conversa 9× 3,43 s, conversa 2× 4,87 s, atendimento 2× 2,18 s, insights 1× 1,38 s, lead_perfil 469× ~0 s. **O dashboard passa de 3 s quando usado** (1ª abertura no smoke: 4,57 s; 2ª: 2,58 s).
- **Vercel:** CPU ativa das 12 h até 08h ≈ 66 s (21/10: 147 s). `GET /` 783 chamadas / 36 s = o monitor 10350616 do Sentry (SentryUptimeBot, a cada 60 s), desativado pelo Lucas às ~07:50; último `GET /` dele às 07:49:20. `/api/webhook/c2s` ausente. O CRM fica sem monitor de disponibilidade até a Etapa Plataforma (05).
- **v_leads_nao_lidas** (1.2): na cópia, 2,05 s → 76 ms; era o pico de 72% de IOwait de 21/10 19:16. Corrigida à noite (abaixo).

### Deploy de dia da `feat/modulos` (40bf3a4, push 11:09, READY 11:13, loja aberta, só aplicação)
- IOwait 3,2% antes; Docker desligado. Smoke (a)–(g) nas duas lojas, dono e vendedor (conta Meta Reviewer): menu em grupos e trilho; Configurações (vendedor só Perfil); 308 do `/admin` e `/canais?code=` → Integrações com o código; Central de Módulos (instalar e desinstalar Gestão de Leads como dono; vendedor sem botões, instalação pela API 403); painel; funil (`nexus/funil-depois-20261022-modulos.png`); 2ª via; tarefas nas duas lojas; mídia em cache; `/api/saude` 200; anon 0 / authenticated 22. WhatsApp: o "Teste" do Lucas chegou nas duas lojas e as três respostas (conversa nas duas lojas pela edge `webhook-leads?action=send` e `/api/whatsapp/send` 200) foram entregues. A raiz `/rest/v1/` passou a aceitar só `service_role`.

### Noite (seção "Noite de 22/10/2026" do 05)

| item | horário | resultado |
|---|---|---|
| 1. View de não lidas | 18:04–18:16 | merge `ef66933` com gate; aplicada 18:14; idêntica (1.278 leads, 13.921 não lidas, mesma assinatura); 52 ms no banco; `/leads` com o modal 3,1 s (quente) |
| 2. Corrida de identidade | 18:14–18:20 | merge `1939cc1` com gate; aplicada 18:20; 6 negócios fundidos, `contato_fusoes` 212 → 215; só `service_role` executa as 4 funções |
| 3. Edge `webhook-leads` | 18:20–18:49 | versão 67 (CLI, `--use-api`, `verify_jwt` desligado); Direct de teste 18:48: 1 contato, 1 mensagem, negócio existente reaproveitado; log: "Direct repetido ignorado (segunda entrega)" |
| 4. Conferências | 18:49–18:52 | (a) anon 0 / authenticated 22; (b) 6 fundidos + 3 fusões; (c) `webhook_mid_novo` só `service_role`; (d) sino × view divergem em 8 de 1.278 leads → item da Inbox única no 05 |
| 5. Volta | — | não foi necessária |
| 6. Leitura | 18:52–19:00 | tabela abaixo |

**Item 6 — conexões, memória, ZapIntel (só leitura):**

| o quê | valor |
|---|---|
| `max_connections` | 60 (3 reservadas ao superusuário) |
| em uso | 31 (22 de cliente, todas `idle`; 0 `idle in transaction`) |
| PostgREST (`authenticator`) | 11 conexões diretas (locais, sem pooler); a mais antiga ociosa há 55 dias (pool desde o último restart) |
| Realtime | 7 (cluster externo; replicação, assinaturas, RLS) |
| Pooler (`pgbouncer`) | 1 conexão de autenticação; nenhum cliente da aplicação entra por ele (o app fala com a API, não com o banco) |
| outros | Storage 1, `postgres_exporter` 1, `pg_net` 1, `supabase_admin` sem nome 1 (ociosa há 12 h), MCP 1 |
| memória (24 h; o painel não devolve 7 dias no plano gratuito — só a última hora) | RAM 408 MB; usada 179–269 MB (média 230); swap 602–766 MB (média 664, máx 22/10 13:53); comprometida 1.628–1.925 MB (média 1.711) para capacidade de 1,4 GB — acima o dia inteiro |

### Fica anotado
- `xact_rollback` subiu ~5.300 na tarde de 22/10 (cerca de 15 por minuto) sem causa identificada; não aparece no `pg_stat_statements` (que só conta o que termina). Investigar antes de culpar alguém.
- Memória comprometida acima da capacidade o dia inteiro, com ~660 MB de swap: o plano gratuito está no limite (ver o 05, Etapa Plataforma).
- ZapIntel acima de 3 s na primeira abertura do dashboard.
- Pedido de teste nº 1 em `modulo_pedidos` (Agenda da JM) ainda lá.

## 13. 22/10 à noite: /admin dá 404, token dos portais só no cabeçalho, C2S fora (`fd605f8`)

- **Deploy só de aplicação**, loja fechada: push 19:24, READY 19:28 (main `fd605f8`, sobre `15a62c4`). Gate verde (build com 191 páginas — a API de gestão do C2S saiu —, TSC, 171/171, verificador 539 ok com as 5 falhas antigas do ZapIntel).
- **(a)** Os 308 de `/admin/*` e dos duplicados da Etapa 0 (`/admin/relatorios`, `/admin/financeiro`, `?aba=integracoes`) saíram antes de 21/11 (decisão do Lucas): `/admin`, `/admin/configuracoes` e `/admin/relatorios` dão 404 logado, nas duas lojas. Ficam os 308 das ferramentas (`/simular-parcela` etc., até 21/11) e o `LEGADO_ADMIN` do proxy (`/canais`, retorno da Meta).
- **(b)** As rotas de portais (`/api/portais/{slug}/leads`) e do site (`/api/imob/{slug}/lead`) só aceitam `Authorization: Bearer`; `?token=` e o aviso `[token-na-url]` saíram. A tela de Integrações criava, a cada visita e para qualquer empresa, o token de portal e o de entrada do Contact2Sale, em texto — por isso a JM e a Preview tinham os dois sem nunca terem usado. O C2S saiu de vez (cartão, `app/api/admin/c2s`, `lib/c2s.ts`). Sem `empresa_segredos` (primeira migração da viagem), nenhuma empresa tem token de portal: as duas rotas respondem 401 com e sem `?token=`.
- **Apagado de `configuracoes_sistema`** (21:3x, depois do READY; as quatro sem alteração desde agosto, então estão no dump `dumps/2026-10-22-etapa0/public.dump` de 21/10 18:41 — é a volta):

  | chave | empresa | última alteração |
  |---|---|---|
  | `portal_leads` | 1 — JM Store Importados | 02/07/2026 17:31 |
  | `contact2sale` | 1 — JM Store Importados | 27/08/2026 10:28 |
  | `portal_leads` | 5 — Preview · Loja | 28/08/2026 10:27 |
  | `contact2sale` | 5 — Preview · Loja | 28/08/2026 10:27 |

  Abrir Integrações nas duas lojas depois disso não recriou nenhuma (0 linhas de token). Os eventos antigos do C2S em `integracao_eventos` ficam (histórico).
- **Smoke:** dono nas duas lojas (painel, Configurações, Integrações sem C2S, Relatórios); `/admin` 404; portal e site sem `Bearer` → 401; `/api/saude` 200; WhatsApp entrando depois do deploy (Jaguariúna 20:34, Mogi 21:05, respostas 21:09).
- **Volta:** Instant Rollback na Vercel para `15a62c4`; as quatro linhas, pelo dump de 21/10 (só elas, nunca restore completo).

### Depois da seção 13 (22/10, 21:5x)
- **Pedido de teste nº 1 (`modulo_pedidos`, JM, `/agenda`, smoke de 21/10 19:07) apagado** como o "Recusar" do superadmin faz, numa transação só, pelo MCP: registro 97 em `superadmin_logs` (`recusar_pedido_modulo`, empresa 1, módulo `/agenda`, 21:55:35, `via` = MCP a pedido do Lucas). `modulo_pedidos`: 0 pedidos, 0 pendentes.
- **Os 308 das ferramentas da Etapa 0 também saíram** (`/simular-parcela`, `/check-imei`, `/consulta-fipe` → 404); `/simular-parcela` e afins seguem só como identidade do módulo. Deploy só de aplicação, smoke curto (abaixo, no commit do deploy).
- **Rollbacks da tarde (+5.300 entre 12:32 e 18:20): causa NÃO identificada.** Por janela de foto: 06:00–08:32 +9 · 08:32–10:52 +972 · 10:52–12:32 +26 · 12:32–18:20 +5.300 · 18:20–21:50 +7 (parou à noite). Descartado, com número:
  - erro de comando: o log do Postgres registra erro de API (os 6 `42501` provocados às 18:13 aparecem), e as amostras de 15 min às 13:00, 14:00, 15:00, 16:30 e 17:30 têm 0–1 erro;
  - `ROLLBACK` explícito: +261 no `pg_stat_statements` no período (service_role 224, Auth 31, autenticador 6);
  - `realtime.authorize`: 0 chamadas no período; `pg_cron`: nenhuma execução desde as 06:00; transcrição de áudio: 21 gravadas à tarde;
  - tráfego da API: 14:00–14:15 tem ~200 requisições, todas 2xx (menos que os 15 rollbacks/min da média).
  O que acompanha a rajada é o volume de requisições da `service_role` sem consulta correspondente nas estatísticas (36,7/min de manhã, 15,7/min na janela calma, 21,8/min à tarde). Sem dano visível: nenhum erro, nenhuma perda de mensagem ou divergência ligada a ela. Próximo passo (só leitura): foto do `xact_rollback` a cada 5 min no expediente de 23/10; no primeiro salto, `pg_stat_activity` e o log de 15 min daquele intervalo.


## 14. 03/11: zero-segmento em produção (`1ea2281`, migração `20261029000100`), loja aberta

Decisão do Lucas: ir de dia, com a migração só de dados (sem DDL), IOwait abaixo de 20% antes de cada passo e parada acima de 30%.

- **Antes (só leitura):** `presets_onboarding` (7 linhas) e `empresa_menu` das duas empresas idênticos à cópia de 22/10 (md5); única diferença, `empresa_modulos` 1/`gestao_leads` desligado (sobra do smoke de 22/10). Ensaio no Supabase local (reset do repo até `20261023000200` + dados da cópia + a linha acima + a migração): duas passadas limpas e iguais (dono nas duas lojas, vendedores de Mogi e Jaguariúna). Menu "de antes" registrado na produção, como dono, nas duas lojas: 21 itens, Central com 16 botões, Configurações com 40 seções.
- **Gate na main local (`1ea2281`, fast-forward sobre `53cc73d`):** check (núcleo, avisos, views, segmento, tsc, edge), 190 testes, foto das 80 combinações (70 iguais + as 10 de preset inexistente iguais ao varejo), comparar-menu 15/15, build, 152/152, verificador 539/5 (as 5 antigas).
- **Migração** pelo MCP às 14:59 (IOwait 8,3% às 14:58; 21,9% às 14:54 adiou o passo): base gravada nas empresas 1 e 5 (34 habilitados), camadas `dono` e `superadmin` com o mesmo md5 de antes, nenhum preset com `hidden_hrefs`, nomes do cadastro gravados. API: anon segue com `42501`, Auth 200, `/api/saude` 200. Com o código velho ainda no ar, o menu de Jaguariúna saiu idêntico.
- **Push** 15:00 (IOwait 5,0%), **READY 15:03:45** (Production `1ea2281`).
- **Smoke com o Lucas (15:05–17:08):**
  - menu idêntico ao de antes nas duas lojas, item a item; Configurações (40 seções) e Central (16 botões) iguais;
  - card do lead aberto em Mogi (6703) e Jaguariúna (6987), escolhidos sem mensagem pendente (abrir marca como lida): nenhum painel de imóvel ou veículo;
  - `/register` numa janela isolada, preset varejo: empresa 6 com a mesma base de menu da JM, módulos de varejo, "Funil principal" com 5 etapas e 6 motivos de perda; depois apagada com `hard_delete_empresa` como o superadmin (log `excluir_empresa_lgpd` 17:02) e o usuário do auth apagado na mesma transação — sem sobra em menu, módulos, funil, motivos, branding, filiais e `usuarios`;
  - ZapIntel ao vivo (2.823 conversas, última mensagem "agora"); tarefa criada e apagada;
  - WhatsApp: "teste zs" do Lucas recebido nas duas lojas (17:05); resposta pelo CRM em Mogi 17:06:53 (lida 17:07:02) e Jaguariúna 17:07:42 (entregue 17:07:45); `/api/saude` 200.
- **IOwait depois:** pico de 25,7% (17:06) e 31,4% (17:08) durante o smoke, de volta a 17,4% (17:09) e 3,1% (17:11) sem nenhuma ação; antes do deploy a tarde já tinha picos isolados (23,9% às 14:04, 21,9% às 14:54).
- **Sentry:** nada novo desde o deploy. As três ocorrências da tarde vieram do trabalho de antes: `POST /api/filial/selecionar` com corpo `null` (chamada errada minha, ~14:50, 500 sem alterar nada) e duas do servidor local do ensaio, que reporta ao Sentry pelo `.env.local` (`/para/[segmento]` de um build velho e "stream closed early" ao derrubá-lo).
- **Volta (não usada):** Instant Rollback para `53cc73d` + `supabase/scripts/volta/volta-presets-completos.sql`.
- **Fica anotado:**
  - card de lead sem responsável mostra "alteração não salva" ao abrir (preenche com quem abriu; desde `cb22e59`, 07/08);
  - topo do `/dashboard` diz "Visão geral", e o menu tem outro "Visão geral" (já era assim);
  - ~~`/api/filial/selecionar` responde 500 com corpo `null`~~ — **400 em produção desde 17:38** (`210eb81`, deploy só de app, IOwait 2,8%): corpo vazio, `null` ou sem `filialId` → 400, troca normal 200;
  - ~~o servidor local do ensaio manda erro para o Sentry da produção~~ — **resolvido na máquina**: `NEXT_PUBLIC_SENTRY_DSN=` vazio no `.env.local` e no `.env.development.local` (a variável vence o DSN do código; a Vercel não lê esses arquivos);
  - `ops.volta_filial_20261020` entra no DROP da próxima noite (`20261104000100`, branch `db/proxima-noite`).

## 15. 03/11 à noite: card do lead lendo o core (`4eb5098`), deploy só de app

Loja fechada, IOwait 0,2% no push (19:30); `main` = `210eb81` + 5 commits da `feat/card-do-lead`. Gate na `main` local: check, 197 testes, foto 80 (70 + inexistente = varejo), menu 15/15, build, 152/152, verificador 539/5. Push 19:3x, **READY 19:33:46**.

- **O que entrou:** o card busca o próprio lead em `negocios` + `contatos` + `conversas` + `campos_personalizados` (`GET/PATCH /api/leads/[id]/card`, `lib/card-do-lead.ts`), sem a view `leads`; a conversa lê `mensagens` direto, 200 mais recentes e "ver anteriores"; o formulário nasce igual ao banco (nada "alterado" ao abrir) e responsável vazio fica vazio até alguém escolher (responder segue assumindo); campos personalizados de módulo ligado no card, no tipo que o banco valida; "também em <loja>" (link para dono/admin, texto para vendedor); fundir contatos (classe 2) e **desfazer pela fusão registrada** — a fusão guarda a foto em `contato_fusoes.movido._desfazer` e o desfazer recria o contato e as conversas com os mesmos ids (`lib/fusao-contatos.ts`); `/api/leads/mover`, `/atribuir` e `/match/lead/[id]` passaram a `negocios`/`contatos`. Resolve o primeiro item anotado na seção 14 (card sem responsável abrindo como alterado).
- **Smoke com o Lucas (19:35–19:52):**
  - histórico longo (lead 3996, 208 mensagens): abriu com 200 e "Ver mensagens anteriores"; o clique trouxe as 8 restantes; ~75 KB por abertura (card 839 B);
  - card sem responsável (6699): "Sem responsável", sem "alteração não salva";
  - contatos de teste A/B (criados e apagados depois): campo personalizado gravou e limpou; data `17/05/1990` → 400 sem gravar; mover etapa e voltar; **fundir (registro 273) → desfazer → md5 dos dois contatos, negócios, conversas e identidades idêntico ao antes**; segundo desfazer 409;
  - "também em Jaguariúna" (4685) é link para o 6000 no dono; o texto para vendedor ficou provado no local (4/4), sem login de vendedor na produção;
  - tarefa criada e apagada; `/api/saude` 200;
  - WhatsApp: "test card" do Lucas chegou nas duas lojas (19:49); resposta pelo card em Mogi 19:50:35 e Jaguariúna 19:50:58, Meta aceitou ("enviada") e o Lucas confirmou as duas no celular; a mensagem recebida ficou lida ao abrir o card.
- **IOwait:** pico 19,7% às 19:35 (deploy), 8,1% às 19:51. **Sentry:** nada na última hora.
- **Volta (não usada):** Instant Rollback para `210eb81` (só app; nenhuma migração).
- **Fica anotado:** a página `/leads` ainda carrega a lista inteira do quadro pela view `leads` (é a próxima frente, `feat/quadro-core`); `from('leads')` caiu de 107 leituras em 58 arquivos para 93 em 52; fusões anteriores a 03/11 não têm foto e não se desfazem.

## 16. 03/11 à noite → 04/11 de manhã: quadro no core, viagem 1, DROP da volta_filial e o defeito do contato de outra loja

Ordem do prompt da noite (seção "Noite de 03/11/2026" do 05). Loja fechada, IOwait entre 0,0% e 12,5% na janela toda (nada acima de 20%), Docker desligado. Gates na `main` local: 197 testes e verificador 539/5 no item 1, 547/5 depois da viagem, menu 15/15, build. No conserto de 04/11: 201 testes, 547/5, build.

- **Item 1, 20h45:** 131 linhas de `ops.volta_filial_20261020` em `dumps/2026-11-03-noite/` (md5 `32f27e0c…`); `20261104000100` aplicada (versão `20261103234508`).
- **Item 2, 20h49:** `20261104000200_quadro_core`, 4 funções INVOKER. Anon 0 / authenticated 26 (as 22 de antes mais as 4).
- **Item 3, 20h56:** `20261024000100` por `apply_migration`, mais a `000110` em dois `execute_sql` soltos (drop do índice antigo e create do `modulo_pedidos_pendente`, ambos CONCURRENTLY). `empresa_segredos` não é lida por anon nem por authenticated (API anon 42501).
- **Item 4, push 20h59:** `682444f..73e2404`, READY 20h59min48s.

### Smoke (dono nas duas lojas; vendedor de Mogi pelo banco e Meta Reviewer pela tela)

| item | Mogi Guaçu | Jaguariúna |
|---|---|---|
| (a) /leads abaixo de 300 KB | documento 64 KB + quadro | documento 11 KB, `quadro_pagina` 4 KB comprimido (16 KB bruto) |
| (b) topo e colunas = banco | 2.027 em aberto / 1.161 aguardando / esteira 1.919 | 809 / 464 / esteira 762 |
| (c) carregar mais | Novo 150 + 555 = 705, Perdido 150 + 9 = 159, Convertido 79/79; 0 repetidos | Novo 200 + 591 = 791; 0 repetidos |
| (d) esteira | 1.919 / 1.112 = `quadro_contagens` | 762 / 439 |
| (e) mover + perda com justificativa | — | **falhou na 1ª vez, passou depois do conserto**: lead 3548 do Lucas, iPhone 18 às 06h28min20s, Perdido às 06h28min32s, motivo Preço, "Justificativa da perda (04/11/2026): Teste" nas observações do contato 2552 às 06h28min33s |
| (f) WhatsApp aparece sem recarregar | — | mensagem às 06h28min08s; cartão 3548 com "1 · agora" às 06h28min11s; aguardando 465 → 466 às 06h28min12s; página sem reload |
| (g) card pelo quadro + anteriores | lead 970: as mais antigas vieram por cima, 0 repetidas, o botão some no fim | — |
| (h) vendedor abre lead da outra loja | RLS: o vendedor de Mogi vê 0 negócios de Jaguariúna | Meta Reviewer (vendedor, só Mogi) em `/leads?lead=6452`: "O lead #6452 não está na loja selecionada no topo — ou foi arquivado." |
| (i) Central | Imóveis "Em preparação"; pedido #2 da empresa 5 recusado pelo Lucas às 06h03min38s: `status = recusado`, `recusado_por` Lucas, log `recusar_pedido_modulo` | — |
| (j) ZapIntel, tarefa, saúde | ZapIntel ao vivo (2.828 conversas); tarefa criada e apagada (0 no banco); `/api/saude` 200 | — |
| (k) funções | anon 0 / authenticated 26 | — |

### Os dois achados do smoke

**(b) Dado: não lidas gravadas na loja errada.**
- **Sintoma:** em Mogi, o aguardando dava 1.162 na view antiga e 1.161 no quadro.
- **Causa:** em toda a JM, 4 conversas tinham mensagens não lidas gravadas na outra loja, uma sobra do sync de outubro. Eram 3 conversas de Jaguariúna com 46 mensagens marcadas como Mogi (leads 2468, 970 e 2059) e 1 de Mogi com 18 marcadas como Jaguariúna. O quadro conta pela conversa, e a RLS esconde a conversa da outra loja. A view antiga contava pela mensagem.
- **Decisão do Lucas:** corrigir o dado.
- **Correção, 21h05 (IOwait 4,3%):**
  - dump em `dumps/2026-11-03-noite/mensagens_filial_20261103.json` (md5 do banco `3ecffe37…`), volta em `restaurar-mensagens_filial_20261103.sql`;
  - UPDATE de `filial_id` igual à loja da conversa, com trava (a mensagem só muda se ainda estiver na loja antiga e se a conversa estiver na loja nova): 64 linhas, 46 para Jaguariúna e 18 para Mogi;
  - resultado: 0 não lidas fora da loja. Quadro e view antiga batem em todos os funis, com 0 não lidas diferentes nos dois lados: Mogi 2.038 leads e 1.169 aguardando, Jaguariúna 870 leads e 519 aguardando.
- **Fica para uma noite futura:** **310 mensagens já lidas** nessas mesmas 4 conversas continuam com a loja trocada. Não mudam nenhuma contagem. A correção é a mesma regra (loja da conversa), com dump antes (decisão do Lucas, 04/11).

**(e) Defeito nascido em `682444f` (card do lead, 03/11, 19h33): edição do contato descartada em silêncio quando o contato é de outra loja.**
- **Sintoma (06h05):** o lead 3548 (Jaguariúna) foi para Perdido com motivo, mas a justificativa não foi gravada, e a tela disse "Lead movido".
- **Causa:**
  - O contato 2552 é de Mogi e tem negócio em Jaguariúna.
  - `contatos_select` deixa ver o contato pelo negócio ou pela conversa numa loja visível, mas `contatos_update` só deixava editar pela loja do próprio contato.
  - Enquanto as rotas gravavam pela view `leads`, o gatilho SECURITY DEFINER passava por cima da RLS. O card e o `/api/leads/mover` passaram a gravar em `contatos` direto em `682444f`, e o UPDATE barrado virou 0 linhas sem erro.
  - Afetava a justificativa da perda e a edição de nome, telefone, Instagram, observações e campos do contato no card. Em 04/11 havia 74 negócios abertos em loja diferente da do contato.
  - O Instant Rollback não resolvia, porque `682444f` já tinha o defeito.
- **Conserto (decisão do Lucas), commit `4cacea6`:**
  - migração `20261104000300_contatos_update_como_select`: o USING do UPDATE ficou igual ao do SELECT, e o WITH CHECK continua só na empresa. Aplicada às 06h22, com IOwait de 4,1%;
  - volta em `dumps/2026-11-04-manha/volta-contatos_update.sql`;
  - código: `lib/linhas-afetadas.ts`. O mover grava a justificativa antes do negócio e confere as linhas dos dois UPDATE; o card confere contato e negócio. UPDATE de 0 linhas responde 403 com o motivo. O quadro mostra o motivo ao desfazer o card, e a conversão do card confere as duas respostas;
  - teste `tests/linhas-afetadas.test.ts`.
- **Conferência no banco, numa transação desfeita:**
  - o dono em Jaguariúna atualiza o 2552 (1 linha);
  - o vendedor de Mogi continua com 0 negócios de Jaguariúna;
  - o vendedor de Mogi edita exatamente os 59 contatos de cadastro em Jaguariúna que já via (os que têm negócio ou conversa em Mogi).
- **Deploy:** push 06h23, **READY 06h25min43s** (Production `4cacea6`). Conferido pelo status do GitHub, porque o MCP da Vercel tinha perdido a autorização; o Lucas reconectou depois.
- **Varredura para a lista:** `docs/reconstrucao-nexus/lista-update-sem-contagem-20261104.txt`, com 134 UPDATE/DELETE/upsert pelo cliente do usuário, em 70 arquivos, que não conferem linhas. Pelo catálogo, só o `contatos` tinha o SELECT mais largo que o UPDATE. As outras 33 tabelas com política diferente separam por papel. `contatos_delete` continua estreito, mas nenhuma tela apaga contato pelo cliente do usuário.

### Depois

- **Foto de saúde final, 06h30:**
  - `D:\Nexus-Copia\saude\pgdb-20261104-0630.json` e `pgss-20261104-0630.json`, com 1.583 entradas;
  - banco com 212 MB; na última hora, 2 mensagens recebidas, as do teste;
  - IOwait da última hora: média 1,8%, mediana 0,5%, máximo 12,5% (06h03), nada acima de 20%.
- **Tempo do quadro:**
  - no banco (Mogi, dono, 3 rodadas): `quadro_contagens` 79, 58 e 59 ms; `quadro_pagina` 69, 67 e 67 ms;
  - na tela (Jaguariúna): ~1,5 s na primeira abertura depois do deploy e ~220 ms na seguinte;
  - as médias de 0,7 a 1,3 s do pgss misturam as minhas conferências (100.000 por etapa, todos os funis).
- **Sentry:** nenhum issue nas últimas 12 h.
- **Volta (não usada):** Instant Rollback para `682444f` + `volta-quadro-core.sql` + `volta-viagem-1.sql` + restaurar a `volta_filial` do `dumps/`; do conserto de 04/11, `volta-contatos_update.sql`.
- **Fica anotado:**
  - **pedido recusado some da tela** (as três listas filtram `pendente`; o texto de `/superadmin/pedidos` ainda diz "apaga"). Falta a seção de recusados;
  - **as 310 mensagens lidas com a loja trocada** (noite futura, com dump);
  - **a moldura ainda lê a view `leads` 3 vezes por abertura** (sino, notification-provider, limite-banner). Saem com a Inbox única;
  - o MCP da Vercel perde a autorização de escopo de vez em quando. Nesse caso, conferir o deploy pelo GitHub (`gh api …/commits/<sha>/status`);
  - **a primeira abertura do quadro depois de um deploy (~1,5 s)** vale reconferir na próxima abertura da loja.

## 17. 04/11 de manhã: pedido recusado aparece (`50fd6b4`), deploy só de app

Modo construção (prompt do Lucas de 04/11): deploy de app a qualquer hora com IOwait abaixo de 20%, smoke com o Lucas e volta por Instant Rollback. DDL ou migração, só depois das 18h.

- **O que subiu:**
  - `/superadmin/pedidos` ganhou o cartão "Recusados" (os 50 mais recentes), com módulo, empresa, quem pediu, quem recusou e quando;
  - o texto da página e do diálogo diz que o pedido fica como recusado e que a loja pode pedir de novo;
  - a Central decide pelo último pedido de cada módulo (`pedidosERecusas`, em `lib/modulos-central.ts`). Se ele foi recusado, mostra "Seu pedido foi recusado em dd/mm" e o botão vira "Pedir de novo". Um pedido novo esconde a recusa;
  - teste `tests/pedidos-recusados.test.ts`.
- **Gate:** check, 204 testes, menu 15/15, verificador 547/5, build. IOwait 1,7% às 07h16. Push às 07h18, **READY 07h18min49s**, conferido pelo status do GitHub (o MCP da Vercel segue sem escopo). API: anon 42501, auth 200, saúde 200.
- **Smoke às 07h20–07h28:** o Lucas entrou com a conta de superadmin numa aba isolada do chrome-devtools, e eu conduzi.
  - `/superadmin/pedidos`: "Em aberto (0)" e "Recusados (1)" (Imóveis, Preview · Loja, recusado pelo Lucas às 06h03).
  - Entrei pelo Laboratório na empresa 5 e abri `/modulos`: Imóveis "Em preparação" e "Seu pedido foi recusado em 04/11.", sem botão.
  - ZapIntel → **Pedir**: pedido #3 pendente e "Pedido enviado".
  - Recusar em `/superadmin/pedidos`: o diálogo mostrou o texto novo e o pedido foi para "Recusados (2)".
  - De volta à Central: "Seu pedido foi recusado em 04/11. Você pode pedir de novo." e **Pedir de novo**. O clique gerou o #4 e "Pedido enviado", e a recusa sumiu.
  - Limpeza: o #4 foi recusado. No banco ficaram 0 pendentes e #2, #3 e #4 `recusado` com data e autor, com 3 linhas `recusar_pedido_modulo` no log.
  - A Central da JM (dono) segue igual: sem recusas e as 8 telas "Em preparação".
- **Grep das views** (critério do 05): `leads` com 92 leituras em 51 arquivos e `lead_mensagens` com 24 em 10 arquivos (8 na Edge `webhook-leads`, 5 em `lib/storage/retencao.ts`, 3 no assistente, 2 no card, e 1 em cada um dos outros 6). Nenhuma zerou, então não há migração de drop.
- **Para as 18h:** nada deste deploy.
- **Volta (não usada):** Instant Rollback para `b518f17`.

## 18. 04/11 de dia: Inbox única (`3e3b47d`), deploy só de app, loja aberta

Modo construção: o ok do Lucas veio às 11h20, e o push esperou o IOwait cair abaixo de 20%. Ele estava em 29,4% às 11h23 e em 21% às 11h24, e às 11h28 chegou a 6,0%.

- **Gate na `main` local:** check, 211 testes, menu 15/15, verificador 552/5 e build. No local, 4 usuários e 3 abas deram tudo ok.
- **Deploy:** push `3243508..3e3b47d` às 11h28, **READY às 11h32min10s**, conferido pelo status do GitHub e pelo deployment Production `3e3b47d`. API: anon 42501, auth 200, saúde 200.
- **Smoke das 11h33 às 11h50.** Conduzi pelo chrome-devtools logado como dono da JM, e o Lucas ficou com o celular.
  - `/comunicacao` em Mogi: a lista, os filtros (canal, não lidas, aguardando) e a busca funcionaram.
    - A busca por nome, telefone e @instagram trouxe só as conversas da loja atual: das 7 conversas do Lucas, as 4 de Mogi; as 3 de Jaguariúna ficaram fora.
  - **Sino = banco** (`select count(*) from conversas where nao_lidas > 0` pela RLS do dono): Mogi 1.247 = 1.247 no começo e 1.251 = 1.251 depois das mensagens; Jaguariúna 542 = 542.
  - **Mensagens reais do Lucas:**
    - O WhatsApp (11h41min08s, conversa 222) e o Direct (11h41min22s, conversa 1941) entraram em Mogi e subiram sozinhos para o topo, sem recarregar. O título foi a 1.251.
    - Abrir cada conversa a deixou lida: `nao_lidas` 0, e o título desceu.
  - **Respostas pela Inbox:**
    - WhatsApp às 11h42min24s e Instagram às 11h43min22s, as duas com status da Meta. **O Lucas confirmou as duas no celular.**
    - A resposta sai com a assinatura da loja ("JM - JM STORE IMPORTADOS:"), como no card.
  - **Nota interna:** `eventos` 290 (`conversa.nota`, conversa 1941, loja 3, autor = dono). Ela fica para o smoke de editar e apagar das 18h.
  - **Tarefa:** criada pela conversa (1409, negócio 6410, contato 693, loja 3) e apagada em `/tarefas`; no banco ficaram 0.
  - **Abrir card** a partir da conversa: o card do lead abriu com a conversa.
  - **Vendedor (Meta Reviewer, pela RLS):** só a loja 3. Das conversas do Lucas, 0 de Jaguariúna e 2 de Mogi.
  - **`/leads`:** igual a antes e sem ler a view `leads`.
  - Troquei a loja para Jaguariúna para conferir e voltei para Mogi; as duas trocas deram 200.
- **Tempos na produção:**
  - **Primeiras aberturas, logo depois do deploy e com o IOwait em pico:**
    - primeira página de conversas: de 0,4 s a 6 s;
    - "carregar mais": 7,2 s;
    - "aguardando": 9,7 s;
    - quadro do `/leads`: ~3 s em `quadro_contagens` + `quadro_pagina`.
  - **Com o cache quente:**
    - primeira página: 194–218 ms;
    - "carregar mais": 174–233 ms;
    - "não lidas": 72 ms;
    - "aguardando": 192–304 ms por requisição, em duas requisições seguidas;
    - busca: 150–610 ms;
    - quadro: 200/290 ms.
  - **No banco (`explain analyze` da primeira página pela RLS do dono):** 339 ms de execução e 90 ms de planejamento, tudo em cache (`shared hit`). Quase todo o tempo é a RLS do `contatos`, aplicada nas 2.519 conversas visíveis antes do `limit`.
  - **Decisão anterior do Lucas:** coluna calculada só acima de 300 ms. Só o "aguardando" encosta nisso, com o cache quente. Fica anotado; nada a fazer hoje.
- **IOwait:**
  - 30,2–30,5% às 11h32–11h34, no deploy e nas primeiras aberturas. Ficou um pouco acima do limite de parada de 30%, num ponto só, e o smoke seguiu.
  - Depois: 17,1% às 11h37, 2,8% às 11h43, 24,6% às 11h46 e 16,0% às 11h48.
- **Sentry:** nenhum problema na última hora.
- **Grep das views:** `leads` com 86 leituras em 47 arquivos (eram 92 em 51) e `lead_mensagens` com 23 em 9 (eram 24 em 10; 8 delas na Edge `webhook-leads`). Nenhuma zerou.
- **Ficaram no banco, de teste:**
  - as mensagens "teste inbox" e as duas "Resposta do teste da Inbox (…) — pode ignorar";
  - a nota 290.
- **Para as 18h:** `feat/inbox-notas` (migração `20261104000400`) e as 310 mensagens lidas com loja trocada. Ver o 05, seção "04/11/2026 de dia".
- **Volta (não usada):** Instant Rollback para `3243508`.

## 19. 04/11 à tarde: lotes 1 e 2, as 1.341 mensagens, Edge v68 e notas (loja aberta, "fazemos tudo agora")

O Lucas pediu cinco itens, um por vez, com a API conferida entre cada um: anon 42501, auth 200 e saúde 200 deram certo nas seis conferências. A migração das notas só entraria com IOwait abaixo de 10%. Os quatro itens de produção entraram, e o quinto é este fechamento.

**Antes de começar:** os lotes 1 e 2 estavam empilhados em cima das notas e da Edge, e o merge levaria as notas antes da migração. Foram reempilhados direto sobre a `main`, o que gerou `7f7cee4` e `525ff57`. O conflito no `verificar-auditoria.sh` foi resolvido à mão. Depois a pilha virou main → lotes → Edge → notas, com o gate completo verde em cada passo.

### Item 1. Lotes 1 e 2 (`525ff57`, só app)
- **Gate:** check, 211 testes, menu 15/15, verificador 561/5, build. IOwait 6,1% às 13h40. Push às 13h54, **READY às 13h57min29s**.
- **Smoke às 13h58–14h06:**
  - **Tarefa:** a 1410 foi criada em `/tarefas`, concluída pela tela (no banco, concluída e com data) e excluída com confirmação (0 no banco, sumiu da tela).
  - **PDV:** abriu, e a aba Encomenda mostrou as 4 encomendas reais em aberto, que não foram tocadas.
  - **Encomenda de teste:** venda 140 e pedido 103, de R$ 1,00, com o cliente "Matheus CLIENTE".
    - **Marcar:** "Pedido feito" mostrou "Pedido registrado", e o pedido 103 ficou marcado com o dono como autor.
    - **Desmarcar:** pelo banco, já que a tela não tem botão para isso.
    - **Caso novo do lote 2:** com a tela aberta, marquei por trás e cliquei. Apareceu "Esta encomenda já estava marcada como pedida" e a data do primeiro pedido (14h05) ficou.
    - **Limpeza:** apaguei a venda 140 e o pedido 103, com a confirmação do Lucas no MCP.
- **Sentry:** nada na última hora.

### Item 2. Mensagens com loja trocada (só dados)
- **Levantamento na produção:** **1.341** mensagens com a loja diferente da conversa.
  - 310 são das 4 conversas de 03/11 e 1.031 vêm de outras 45. São 49 conversas no total.
  - Todas lidas (0 não lidas), e todas as conversas têm loja.
  - O número bateu com o esperado (310 + 1.031).
- **Dump às 14h07:** `dumps/2026-11-04-noite/mensagens_filial_20261104.json`, 1.341 linhas, md5 do banco `21eb30da…`.
  - A ida (`ida-…sql`) e a volta (`restaurar-…sql`) foram geradas do próprio dump, com trava por id e loja de antes.
  - São 1.052 mensagens de Mogi para Jaguariúna e 289 de Jaguariúna para Mogi.
- **IOwait:** 41–42% às 14h06–14h07, durante o dump e as fotos (leituras minhas), e 7,0% às 14h11. O UPDATE esperou passar.
- **Uma transação só, com leitura repetível, às 14h13min07s.** A loja estava aberta, então duas fotos separadas não seriam comparáveis.
  - A ordem foi: foto antes nas 4 visões, UPDATE, foto depois e conferência.
  - A conferência faria a transação abortar se algo não batesse: 1.341 alinhadas, 0 fora da loja e 0 visões diferentes.
  - A loja ativa do dono voltou ao valor de antes (Mogi).

| visão (pela RLS) | sino | não lidas | quadro + esteira (md5) | mensagens visíveis nas 49 |
|---|---|---|---|---|
| dono em Mogi | 1.258 = 1.258 | 15.440 = 15.440 | `50c8dc4a…` = | 3.361 → 2.598 |
| dono em Jaguariúna | 549 = 549 | 4.238 = 4.238 | `78e14003…` = | 542 → 1.305 |
| vend-mogi (Luis Felipe) | 1.258 = 1.258 | 15.440 = 15.440 | `50c8dc4a…` = | 3.361 → 2.598 |
| vend-jag (Vanessa) | 549 = 549 | 4.238 = 4.238 | `78e14003…` = | 542 → 1.305 |

- **Depois do commit:** 0 mensagens fora da loja no banco inteiro. Uma amostra de 6 ids bate com a loja da conversa.
- **A única mudança, e é a que se queria:** o histórico dessas 49 conversas agora aparece na loja da conversa.
- **Observação:** a Rayssa, a "vend-jag" do local, está inativa na produção e não vê nada. Usei a Vanessa Amorim Volpato, vendedora ativa de Jaguariúna.
- **Ressalva da conferência:** usei o `updated_at` desta transação junto com "0 fora da loja" no lugar da lista de ids escrita à mão. Somados, os dois provam o mesmo resultado.

### Item 3. Edge `webhook-leads` v68 (`7d50e56` + `51c50aa`)
- **O conserto:** `bancoIndisponivel()` em `reenvio.ts`, com teste Deno.
  - 502/503/504, PGRST000–003, Postgres caindo e falha de rede contam como banco fora.
  - Violação e valor inválido continuam sendo dado ruim: 200 e log.
  - Viram `ErroDeBanco` (500): a gravação da mensagem recebida, do anúncio, do eco e do histórico, e a busca ou criação do lead antes dela. O catch do eco repassa o erro.
  - O envio pela tela não muda.
- **Pacote grande:** a primeira versão do conserto ainda perdia mensagens no teste (15 de 40).
  - **Causa:** o hash de 24 h era gravado antes de processar, e o "esquecer" também falha com o banco fora.
  - **Agora:** antes de processar entra uma trava de 60 s (`webhook_mid_novo`, a mesma tabela, que expira sozinha), e o hash de 24 h só é gravado no fim.
  - **Reentrega durante o processamento:** recebe **503 com `Retry-After: 60`**, não 200. Um 200 encerraria as tentativas da Meta.
  - Não precisou de migração.
- **Teste local** (proxy que derruba o banco depois de K gravações; `D:\Nexus-Copia\inbox\ferramentas\noite-0411\fora-meio.mjs`):
  - **Grande, 40 mensagens, queda na 15ª:** 500 em 7,5 s; a reentrega imediata recebeu 503; depois da trava, **40 de 40**, 0 duplicadas; o terceiro envio deu 200 em 7 ms.
  - **Pequeno, 30 mensagens, queda na 10ª:** 500 e depois **30 de 30**.
  - **5 Directs, queda no 2º:** 500 e depois **5 de 5**. Os mids foram esquecidos.
  - **Reentrega durante um processamento normal:** 503 e 40 de 40.
  - **Os 25 cenários de antes:** todos ok. O único "41" era o filtro do próprio teste, que pegava também a mensagem `hist`.
  - **Antes do conserto:** 200 em ~105 s, com 5 de 5 perdidas.
- **Gate:** check, 211 testes, menu 15/15, verificador 568/5 (+4 checagens), build.
- **Deploy:**
  - **App:** push às 14h28, **READY às 14h31min02s**.
  - **Edge:** pela CLI a partir do worktree em `51c50aa`. A CLI pediu `--yes`, que entrou com o pedido explícito do Lucas. **v68 ativa às 14h31min43s**, com `verify_jwt` desligado. As sondas sem credencial respondem 403.
- **Smoke com o Lucas:**
  - **WhatsApp:** chegou às 14h34min23s (conversa 222). A resposta pela Inbox saiu às 14h35min27s, ficou **entregue** às 14h35min30s e **lida** às 14h36min15s. O status passa pelo caminho novo, direto em `mensagens`.
  - **Direct:** chegou às 14h34min47s (conversa 1941), marcado como resposta a um anúncio; a Edge gravou o cartão do anúncio junto. A resposta saiu às 14h35min45s. O Lucas confirmou as duas no celular.
  - **Ecos das vendedoras:** continuaram entrando nas duas lojas.
  - **Log da Edge (14h31–14h44, filtrado):** 0 erro, 0 falha, 0 órfão, 0 503.
- **Achado:** a resposta do Direct ficou em "enviada", e a das 11h43, ainda na v67, também. Nos últimos 30 dias, as 1.493 respostas de Instagram ficaram todas em "enviada". Os eventos de entrega e leitura do Instagram não chegam à Edge, provavelmente por assinatura no app da Meta. Não é regressão da v68. A leitura pela identidade ficou provada só no local.
- **Volta (não usada):** republicar a v67 de `D:\Nexus-Copia\inbox\ferramentas\noite-0411\volta-edge-v67\`, idêntica ao commit `7593932`.

### Item 4. Notas editáveis pelo autor (`b189647` · `20261104000400`)
- **Gate na pilha nova:** 215 testes, verificador 568/5, build.
- **Antes de aplicar:**
  - a `main` local já estava em `b189647`;
  - a migração era idêntica ao arquivo (só CRLF de diferença);
  - as políticas da produção eram iguais às da volta.
- **IOwait 6,1% às 14h41.** A migração foi aplicada pelo MCP às 14h49min49s (versão `20261104174949`), depois de uma confirmação que expirou e foi pedida de novo. A API ficou ok logo em seguida.
- **RLS na produção, em transação desfeita:** o vendedor de Mogi vê a nota 290, mas editar dá 0 linhas e apagar dá 0 linhas.
- **Deploy:** push às 14h50min20s, **READY às 14h52min42s**.
- **Smoke às 14h53:**
  - a nota 290 mostra "Editar" e "Apagar" para o dono;
  - editar gravou no banco (texto novo e `editada_em` às 14h53min13s), e a bolha mostra "· editada";
  - apagar pediu confirmação ("Não dá para desfazer"), a nota sumiu da tela e no banco ficou 0;
  - uma nota nova (291) foi gravada com o INSERT novo, que exige o autor, e apagada; ficaram 0 notas;
  - os outros 264 eventos continuam intactos.
- **Sentry:** nada na última hora.

### Grep das views (critério do 05, sobre a `main` `b189647`)
- `from('leads')`: 85 leituras em 47 arquivos (eram 86 em 47).
- `from('lead_mensagens')`: 15 em 8 arquivos (eram 23 em 9). **A Edge zerou.** Ficam 5 em `lib/storage/retencao.ts`, 3 no assistente, 2 no `lead-modal` e 1 em cada um destes: `cliente-modal-imob`, `api/imob/[slug]/lead`, `api/portais/[slug]/leads`, `lib/esteira.ts` e `lib/zapintel/conversas.ts`.

Nenhuma das duas views zerou, então não há migração de drop.

### Ficaram no banco, de teste
- As mensagens "teste edge" e as duas "Resposta do teste da Edge v68 (…) — pode ignorar". Elas se somam às "teste inbox" da manhã.

## 20. 04/11 às 15h: o "visto" do Instagram vira "lida" (`86cb640`, Edge v69)

- **Leitura na Meta**, com o token do app e o da conta, sem imprimir nenhum:
  - **App, objeto `instagram`:** só `messages` e `messaging_postbacks`. O objeto `page` já tinha `message_deliveries` e `message_reads`.
  - **Contas** @jmstore_importados (canal 26, Mogi) e @jmstore_jaguariuna (canal 25): `["messages"]`.
- **Assinado** (autorizado): o app ficou com `messages`, `messaging_postbacks` e `messaging_seen` (`success`), e as duas contas com `messages` e `messaging_seen` (`success`), conferido em nova leitura.
- **Edge:** o `messaging_seen` manda `read.mid`, e o código só entendia `watermark`.
  - O conserto busca a hora da mensagem do `mid` e marca "lida" nas enviadas até ela, pelo contato da identidade e só neste canal.
  - **No local** (`visto-mid.mjs`), 6/6: até a vista fica lida; a posterior continua enviada; o WhatsApp do mesmo contato continua enviado; `mid` desconhecido não muda nada; `watermark` funciona. Os 25 cenários da Edge também passaram.
- **Gate:** 215 testes, verificador 570/5, build. IOwait 14% às 15h20.
- **Deploy:**
  - o push às 15h25 foi barrado primeiro pelo modo automático e refeito no modo manual;
  - Edge **v69 às 15h26min45s**;
  - app **READY às 15h28min41s**;
  - API ok.
- **Smoke com o Lucas:**
  - mandei "Teste do visto no Instagram (v69)" às 15h27min31s, e ela ficou "enviada";
  - o Lucas leu no Direct, e às **15h28min40s** ela virou **"lida"**;
  - as respostas anteriores da conversa 1941, presas em "enviada" desde outubro, também viraram "lida", porque o visto vale até a mensagem vista.
- **Regra registrada:** o Instagram não manda "entregue". O máximo é enviada → lida.

## 21. 04/11 às 15h51: lote 3 (`4e7c0b5`, só app, deploy de dia)

- **O que entrou:**
  - cartão de anúncio na `/comunicacao`, igual ao do card do lead;
  - mais 5 UPDATE/DELETE que conferem as linhas: automação ligar/desligar e remover, motivo de perda, e status e exclusão da ficha de F&I;
  - pagamento do PDV que não grava agora desfaz a venda.
- **Lista dos 134:** 19 FEITO e 17 FICA. Os 9 upserts de Configurações e do card ficam, porque o upsert barrado pela RLS dá erro: `new row violates row-level security policy`, testado no local como vendedor.
- **e2e no local** (`D:\Nexus-Copia\inbox\ferramentas\noite-0411\pdv-e2e.mjs` e `lote3-e2e.mjs`):
  - **PDV 14/14:**
    - venda da peça 53 (R$ 1.995) com a cotação #982337 (R$ 500): total R$ 1.495; a cotação ficou usada e com `venda_id` igual à venda; pagamentos `dinheiro 1495 + troca 500`; peça vendida;
    - pagamentos recusados (grant tirado só no local): "Erro ao finalizar · Os pagamentos não foram gravados"; nenhuma venda ficou para a peça 52, a peça voltou a "disponível" e não houve aviso de sobra;
    - pagamentos e delete da venda recusados: "A tentativa não foi desfeita por inteiro · Ficou: venda #123";
    - o banco local foi devolvido com a mesma quantidade de vendas.
  - **Lote 3, 4/4:** o cartão de anúncio aparece sem JSON e sem "Abrir arquivo"; desativar uma automação apagada por trás avisa "Nada foi gravado"; a desativação normal grava.
- **Gate:** 215 testes, verificador 576/5, build.
- **Deploy:** IOwait 10% às 15h51; push às 15h51min21s; **READY às 15h53min49s**; API ok.
- **Smoke:**
  - o anúncio de 14h34 (AD 040, campanha 120248598866190765) apareceu como cartão com imagem na conversa 1941;
  - a tela de automações (`/automacoes`) e o PDV abriram;
  - Sentry: nada na última hora.
- **Volta (não usada):** Instant Rollback para `1838510`.

## 22. 04/11 às 17h35: Automatize no funil (`68db6d0` + `40d2164`, Edge v70, migrações e pg_cron)

- **O que entrou:**
  - no quadro `/leads`, o botão "Automatize" mostra embaixo de cada etapa as automações de "entrou na etapa" e as cadências que começam nela, com "na fila" e "hoje";
  - o dono/admin cria pela etapa: esperar 0 a 30 dias e então criar tarefa, avisar o gestor, passar o negócio para alguém da equipe ou enviar modelo aprovado;
  - o dono/admin liga, desliga e pausa todas;
  - o vendedor vê e não edita.
- **Travas do envio** (Edge, caminho de serviço `send_template_automacao`):
  - só modelo `aprovado` e só com a automação ligada;
  - 1 envio do mesmo modelo por contato a cada 7 dias;
  - 50 por hora por empresa, com o excedente na fila;
  - horário de atendimento (fora dele, agenda para o próximo);
  - opt-out e bloqueado não recebem;
  - cada envio fica com `origem = 'automacao'`.
- **Tempos:**

  | Hora | O quê |
  |---|---|
  | 17h34 | IOwait 2,63% |
  | 17h35 | migração `automatize` |
  | 17h36 | `pg_net` |
  | 17h37 | Edge v70 ACTIVE |
  | 17h40min54s | READY de `68db6d0` |
  | 17h41 | segredo do Vault conferido: 200 na rota, sem exibir |
  | 17h42 | job `automacoes-hora` às `17 * * * *` |
  | 17h54 | IOwait 11% |
  | 17h56min36s | READY de `40d2164` (correção do slug) |
  | 17h58–18h05 | smoke |

- **Achado e correção (`40d2164`):** a automação casava com a etapa só pelo slug, e o slug só é único dentro de um funil. Uma etapa de mesmo nome em outro funil dispararia a automação errada e apareceria embaixo das duas.
  - Agora vale o `etapa_id`, com o slug de reserva para as automações antigas.
  - O e2e `automatize-slug-e2e.mjs` (6/6) prova os dois lados: a etapa homônima não dispara e a certa dispara.
- **Smoke** (funil de teste com o negócio 7077 do contato do Lucas):
  - as 3 automações foram criadas pela tela e gravadas com `etapa_id = 61`;
  - ao mover, nasceu a tarefa "TESTE AUTO na hora: Lucas Ramponi" (origem automação), o responsável virou Matheus Rosa e a de 1 dia ficou agendada para 05/11 às 17h59;
  - cron à mão (`net.http_get` com o segredo do Vault): `executadas 1`, `restam 0`, 6,5 s; a segunda tarefa foi para Matheus Rosa e a linha em `eventos` diz `{"executadas":1,"ficaram_para_a_proxima":0}`;
  - pausar: entrar de novo não criou nada. Retomar: a tela voltou para "Pausar todas";
  - Vanessa (RLS): vê 3; UPDATE e DELETE afetam 0; INSERT dá `new row violates row-level security policy`.
- **Limpeza conferida:** 3 funis (como antes), 0 automações, 0 execuções, 5 negócios do contato 2552 (os de antes) e 0 tarefas de teste.
- **Primeira rodada automática:** às 18h17min00s, `cron.job_run_details` deu runid 41 `succeeded`, e `net._http_response` id 3 deu 200 `{"executadas":0,"rodadas":0,"restam":0,"ms":578}`, com a fila vazia. Sem linha em `eventos`, como previsto.
- **Pendente:** o smoke de envio, quando a Meta aprovar o `retorno_atendimento`.
- **Volta (não usada):**
  - app: Instant Rollback para `68db6d0` ou `aa0fd45`;
  - Edge: republicar a v69, de `aa0fd45`;
  - banco: unschedule, depois `volta-automatize.sql`, depois `drop extension pg_net`.
- **Grep das views:** `leads` 85/47 e `lead_mensagens` 15/8.

## 23. 04/11 à noite: fase final das views, lotes 1 e 2 (15 caem; `43911d1`, `c9b2372`, `ebd95b7`)

- **Inventário de partida:** 45 views no `public`. 41 são de compatibilidade: as 37 de módulo, mais `canais_conectados`, `clientes`, `lead_mensagens` e `leads`. As outras 4 não são: `core_v_planos` e `v_empresas_plano`, ambas com 0 leitores; `v_leads_nao_lidas`; e `storage_orfaos`, que lê `leads` e `lead_mensagens`.
  - Contando `from()` e embed, eram **562 leituras**.
  - As 37 de módulo são `select *` da tabela: mesmas colunas, sem filtro nem gatilho, e as tabelas têm os grants de escrita do authenticated. Trocar o nome basta.
- **Tempos:**

  | hora | o quê |
  |---|---|
  | 18h43 | IOwait 0,47%; push `43911d1` |
  | 18h45min57s | READY do lote 1 |
  | 19h17 | o pedido de aprovação do `apply_migration` expirou: o Lucas não estava na tela |
  | 19h26 | IOwait 1,68%; push `c9b2372` |
  | 19h29min24s | READY do lote 2 |
  | 19h37 | IOwait 0,48% |
  | 19h38min21s | migração do lote 1; API ok duas vezes |
  | ~19h39 | push `ebd95b7` (correção da fusão no arquivo da migração) |
  | 19h41min15s | migração do lote 2; API ok duas vezes; 30 views; funções anon 0 / authenticated 26 |
  | 19h42–19h45 | smoke com o Lucas |

- **e2e local**, com o app em `:3010` e as views já derrubadas no banco local:
  - **lote 1, 18/18:**
    - transferir grava as 2 linhas em `estoque_movimentacoes`, e o Histórico as mostra com o produto pelo embed;
    - editar e remover unidade; salvar com a unidade fora da vista avisa "Nada foi gravado";
    - catálogo com subcategoria; registro de IMEI; webhook com referência desconhecida responde `naoEncontrada`.
  - **lote 2, 27/27:**
    - preço de troca: criar e atualizar; cotação com o número dado pelo gatilho; apagar a cotação, e apagar de novo dá 404;
    - 8 telas com 200; `/api/taxas`; o embed `troca_cotacoes:avaliacao_cotacoes` do painel de orçamento, pelo PostgREST com o JWT do dono;
    - financeiro: editar, editar fora da vista, remover, marcar pago, e marcar pago fora da vista avisando.
- **Furo pego antes do drop:** a `fundir_clientes` (fusão de `/clientes`, chamada por `fundir-leads-modal`) fazia UPDATE em `cobrancas` e em mais 10 views.
  - O `pg_depend` não enxerga corpo de função, então o drop do lote 2 passaria e a fusão quebraria na hora de rodar.
  - A migração ganhou um `DO` que troca as 11 pelas tabelas (19 ocorrências) e aborta se sobrar alguma.
  - No local, a função era igual à da produção (md5 `77671c6a…`) e a fusão com venda e cobrança passou, numa transação desfeita.
- **Smoke na produção, com o Lucas:**
  - `/financeiro`, aba Cobranças: Mogi mostra 2 (Venda #38 e Venda #35, como no banco) e Jaguariúna mostra 0, que é o certo;
  - `/orcamentos/cotacao` abre nas duas lojas, e `/orcamentos/precos` dá 200;
  - fusão de teste com 4207 (principal) e 4208 (secundário, com e-mail e uma cobrança de teste):
    - a rota respondeu 200;
    - a cobrança passou para o 4207 e o 4208 saiu;
    - o e-mail foi herdado e a observação registra a fusão;
  - limpeza: a cobrança 5 e o cliente 4207 foram apagados (0 contatos de teste) e a loja do dono voltou para Mogi.
  - Antes do drop, as telas de estoque, catálogo e IMEI também deram 200; o catálogo mostrou a subcategoria "Cabo" pelo embed novo. Na produção estão vazias `estoque_movimentacoes`, `estoque_imei_consultas`, `financeiro_webhook_eventos`, as consultas da FIPE, `estoque_veiculo_dados`, os lançamentos e as cotações.
- **Achado (pré-existente; o Lucas decidiu corrigir no lote 3):** transferir estoque com Mogi ou Jaguariúna escolhida no topo responde 400 com `new row violates row-level security policy for table "estoque_unidades"`.
  - Causa: o UPDATE leva `filial_id` para uma loja fora de `filiais_visiveis()`.
  - Só funciona em "Rede". A política da produção é a mesma do local.
- **Anotado para o lote que mexer em `troca/cotacoes`:** salvar uma cotação existente (`b.id`) usa `.maybeSingle()` e responde ok mesmo com 0 linhas.
- **Grep das views:** caíram 15 e restam 26, com 493 leituras. No critério antigo, `leads` segue com 85/47 e `lead_mensagens` com 15/8.

## 24. 04/11 às 20h: lote 3 das views e a transferência com loja escolhida (`74518b8`, `e73fad5`)

- **Tempos:**

  | hora | o quê |
  |---|---|
  | 20h05 | IOwait 1,2%; push `74518b8` |
  | 20h07min32s | READY |
  | 20h08 | smoke da transferência na produção |
  | 20h10 | IOwait 4,16% |
  | 20h11min16s | migração `20261105000500`; API ok duas vezes; 20 views no `public` |
  | ~20h20 | push `e73fad5`, com IOwait 1,72% medido logo depois |

- **e2e local (40/40):**
  - transferência Mogi → Jaguariúna com Mogi escolhida e Jaguariúna → Mogi com Jaguariúna escolhida: as duas chegam como `pendente`, com as 2 linhas de histórico certas;
  - unidade fora da vista dá 404; destino em outra empresa dá 404; vendedor dá 403 e não vê o botão (o dono vê 6);
  - 9 telas com 200;
  - propostas: criar, editar, apagar, e editar ou apagar de novo dá 404;
  - documento de contrato: criar, renomear, listar, apagar, e renomear o apagado dá 404;
  - compras lista o pedido e o receber grava;
  - OS: a lista mostra, a página pública abre pelo token, marcar pronto fora da vista avisa e não cria tarefa, e o marcar pronto normal grava e cria a tarefa;
  - REST com o JWT do dono nas tabelas do painel do card.
- **Contrato:** `comparar-contrato.mts` reemitiu os contratos 108, 107 e 106 como dono e como vendedor. Rodou uma vez com as views e o código da HEAD e outra sem as views e com o código novo: 12 de 12 HTMLs idênticos. As emissões extras foram apagadas do local.
- **Smoke na produção:**
  - as 10 telas deram 200 antes e depois do drop, e `/api/contrato-documentos` trouxe "Compra e Venda";
  - transferência com a unidade 53 (iPhone 12 Pro). Pela sessão do dono, cada passo deu 200:
    1. loja Mogi, transferir para Jaguariúna;
    2. loja Jaguariúna, confirmar chegada;
    3. transferir de volta para Mogi;
    4. loja Mogi, confirmar chegada.
  - o Histórico de Mogi mostrou "Enviado p/ outra loja" e "Veio de outra loja" com o produto;
  - limpeza: apagadas as 4 linhas de histórico do teste, e o `recebido_em/por` voltou a nulo. A unidade 53 ficou como antes (Mogi, disponível) e o dono, em Mogi.
- **Dois leitores pelo nome em texto, achados ao tirar as views dos tipos e varrer os nomes entre aspas:**
  - **exportação LGPD do superadmin** (`app/api/superadmin/empresas/[id]/exportar`): a lista fixa de tabelas tinha `cobrancas`, `lancamentos_financeiros` e `comissoes`, e o erro de cada leitura era ignorado. O ZIP saiu com esses CSVs vazios desde o drop de cada uma. Agora lê as tabelas do core e falha com 500 dizendo qual tabela;
  - **desfazer da encomenda no PDV** (`encomenda-form.tsx`): `from(tabela)` com `'pedidos_compra'`. Só rodaria quando o lançamento da encomenda falhasse no meio, das 20h11 até `e73fad5`.
- **Grep das views:** caíram 25 de 41 e restam 16, com 419 leituras. No critério antigo, `leads` segue com 85/47 e `lead_mensagens` com 15/8.

## 25. 04/11 às 20h55: lote 4 (estoque), varredura retroativa e exportação LGPD conferida (`f18ea63`)

- **Regra permanente registrada:** "Como nasce um módulo", no 05 e na memória.
- **Varredura retroativa das 25 views já derrubadas:** nada sobrando em código nem no banco da produção. As únicas ocorrências no banco são texto de propósito: a chave da trava `'troca_cotacoes:'` e os endereços em `migracao.modulo_do_href`.
- **Exportação LGPD da JM**, pelo superadmin do Lucas na aba isolada (200, 905 KB):

  | CSV | linhas no ZIP | linhas no banco |
  |---|---:|---:|
  | usuários | 14 | 14 |
  | clientes | 102 | 102 |
  | vendas | 92 | 92 |
  | produtos | 35 | 35 |
  | tarefas | 68 | 68 |
  | cobranças | 2 | 2 |
  | lançamentos | 0 | 0 |
  | comissões | 0 | 0 |
  | **leads** | **1.000** | **3.120** |
  | **mensagens** | **1.000** | **102.589** |

  Leads e mensagens param no teto de 1.000 linhas do PostgREST; sempre foi assim (defeito antigo). A decisão do Lucas fica pendente.
- **Lote 4:**
  - **Tempos:** push às ~20h50 (IOwait 0,56%), READY às 20h52min36s, IOwait de 8,10% às 20h55, migração às 20h55min28s, API ok duas vezes.
  - **Views:** 13 no `public`; funções anon 0 / authenticated 26.
  - **e2e local 26/26:**
    - 10 telas com 200;
    - o estoque e o PDV mostram o produto pelo embed;
    - editar produto;
    - salvar categoria fora da vista avisa;
    - criar preço sugerido;
    - avaliação inexistente dá 404 (PATCH e DELETE);
    - transferir com Mogi escolhida;
    - 5 selects de embed pelo PostgREST com o JWT do dono.
- **Smoke nas duas lojas:** 9 telas com 200 antes e depois do drop. Mogi: estoque 67, PDV 46. Jaguariúna: estoque 89, PDV 30.
- **Observação:** o `/zapintel/posvenda` levou 500 por timeout na primeira chamada depois do DDL. Passou na segunda e mede 774 ms.
- **Grep das views:** caíram 32 das 41 e restam 9. No critério antigo, `leads` segue com 85/47 e `lead_mensagens` com 15/8.

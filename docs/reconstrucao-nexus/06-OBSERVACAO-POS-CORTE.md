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

## 26. 05/11 de manhã: dependências entre módulos, check-modulos e lote 5 das views (`38e778a`, `22113a9`)

- **Deploy:** push às ~07h24 com IOwait de 3,2%; READY às 07h25min50s. API ok.
- **Central (JM, produção):** Estoque mostra "Usado por PDV, Assistência: desinstale antes", com o botão desligado. Ninguém clicou em Desinstalar.
- **Lote 5:** migração `20261105000700` às 07h43 (IOwait 2,06%; o IOwait chegou a 14% durante o smoke, e a aplicação esperou baixar). A primeira confirmação do `apply_migration` expirou em 2 minutos; a segunda passou. Views no `public`: 12. Funções que leem `vendas`: 0.
- **Números iguais antes e depois do drop** nas duas lojas (tabela no 05, "Lote 5").
- **Check-modulos:** 42 exceções na partida (4 fora, 38 sem trava).
- **Grep das views:** caíram 33 das 41 e restam 8.

## 27. 05/11 às 08h14: lote 6 das views (imob) e a foto de produto (`17d59ab`)

- **Deploy:** push com IOwait de 3,3% (média da hora); READY às 08h10min13s. API ok.
- **Migração `20261105000800`** às 08h14 (IOwait 1,61%), confirmada pelo Lucas na primeira tentativa. Views no `public`: 8. `propagar_filial_do_lead`: 0.
- **Lotes aplicados até aqui**, pelo `schema_migrations`: `drop_views_lote1` a `drop_views_lote6` (`20261104223821`, `…224115`, `…231116`, `…235528`, `20261105104323`, `…111438`).
- **Foto de produto:** quebrada pelo lote 4 (bucket com nome de tabela), corrigida e testada com um envio real, depois limpa (detalhe no 05, "Lote 6").
- **Grep das views:** caíram 37 das 41 e restam 4.

## 28. 05/11 às 09h10: lote 7 das views (canais), Edge v71 e smoke real (`9b0968a`)

- **Ordem:** app às 08h53 (IOwait 0,68%) → Edge v71 às 08h57 (o primeiro deploy foi barrado pelo modo automático; o Lucas trocou para o manual) → smoke com WhatsApp e Instagram reais → migração às 09h10 (IOwait 6,27%).
- **Smoke:** 4 recebidas e 4 respondidas nas duas lojas, todas no canal certo, com o id da Meta, e as 4 respostas em "lida" (detalhe no 05, "Lote 7").
- **Depois do drop:** mensagens entrando normalmente; API ok.
- **Views no `public`:** 7 (`clientes`, `lead_mensagens`, `leads`, `storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos`, `v_empresas_plano`).
- **Grep das views:** caíram 38 das 41 e restam 3.

## 29. 05/11 às 10h20: lote 8 das views (clientes) e o #418 (`2f7faa9`, `05cb255`)

- **Ordem:** migração A (só dados: campos do cliente e cópia da marca para `dados`) às 10h12, IOwait 2,85% → push às 10h12min23s, READY 10h16min46s → smoke nas duas lojas → migração B (drop) às 10h20min50s, IOwait 3,98%. Aprovação do Lucas no chat nas duas.
- **Depois do drop:** API ok; mensagens entrando (9 nos 5 minutos seguintes); Mogi 71 e Jaguariúna 42 clientes; telas 200.
- **Views no `public`:** 6 (`lead_mensagens`, `leads`, `storage_orfaos`, `v_leads_nao_lidas`, `core_v_planos`, `v_empresas_plano`).
- **Grep das views:** caíram 39 das 41 e restam 2. Detalhe no 05, "Lote 8".

## 30. 05/11 de 11h10 a 13h30: último lote das views (leads e lead_mensagens), Edge v72, LGPD completa (`7eece14`, `de17682`)

- **Ordem:** Edge v72 às 11h10 → migração A às 12h38min51s (IOwait abaixo de 10% por 12 min seguidos; o Lucas pediu 10 porque a coluna gerada reescreve `negocios`) → push às 12h40, READY 12h43min39s → smoke → teste do Lucas com WhatsApp e Instagram nas duas lojas (13h17–13h20) → migração B às 13h30min35s (IOwait 8,4%, logo depois de um pico). Aprovação do Lucas no chat nas duas migrações.
- **Depois do drop:** API ok (anon 42501, auth 200, `/api/saude` 200; funções anon 0 / auth 26); mensagens entrando sem negócio duplicado; 20 telas com 200 nas duas lojas; exportação LGPD = banco.
- **Views no `public`:** 1 (`storage_orfaos`, não é de compatibilidade). No banco inteiro, 4: essa e três do Supabase (`extensions.pg_stat_statements`, `extensions.pg_stat_statements_info`, `vault.decrypted_secrets`).
- **Grep das views:** caíram as 41 de compatibilidade. Zero leituras de `leads`/`lead_mensagens` no app, na Edge e nos scripts (sobram 13 textos que são chave de menu, rótulo ou rota `/leads`).
- **IOwait com picos** de 20–33% a cada 8–10 min desde 11h11 (entre eles, 2–7%). Duas fotos canônicas do `pg_stat_statements` (12h46 e 13h21, gravadas em arquivo pela `supabase db query --remote --read-only`): as consultas escreveram 4,9 MB de WAL e leram ~1,6 MB no intervalo — não explicam. O que mais escreveu: apagar arquivo do Storage (2,1 MB, 89 chamadas) e `mensagem_registrar` (1,5 MB, 115). Autovacuum só em tabelas pequenas. Arquivamento do WAL a cada ~2 min (`archive_timeout`), sem casar com os picos. **Causa em aberto**; não é do lote.
- **Detalhe:** 05, "Último lote".

## 31. 05/11 de 13h50 a 15h30: o cliente que volta — um card por contato por loja (`9257158`, `1ed9946`)

- **14h18–14h50, v73 (decisão do Lucas, depois revista):** ganho antigo ou perdido abria um negócio NOVO. Em produção criou 1 duplicado (o do Lucas, 7108, no smoke); a Edge voltou ao código da v72 (publicado como v74) e o 7108 foi apagado (nada pendurado).
- **22 ganhos sem `ganho_em`** (arrasto no quadro desde 20/10: `/api/leads/mover` gravava só o status) corrigidos com `ganho_em = entrou_etapa_em` (foto e volta em `dumps/2026-11-05-ganho_em/`). Mover e a mudança em lote do funil passaram a gravar a data; e2e local.
- **Regra final (decisão do Matheus): UM card por contato por loja.** Migração `20261105001400_retorno_cliente_um_card` às 15h14min35s (versão `20261105181435`, IOwait 5,9% depois do pico das 15h03): `negocio_historico.detalhe` + `core_negocio_do_canal` — aberto em qualquer funil (inclusive Time JM) recebe sem mover; ganho há até N dias (`configuracoes_sistema.retorno_cliente.pos_venda_dias`, padrão 30, card em Configurações › SLA) recebe; senão o MESMO negócio volta à 1ª etapa do seu funil, com o fechamento guardado em `detalhe`; sem negócio, cria. Edge **v75** (~15h15) manda toda recebida por identidade.
- **Relatórios** (`lib/fechamentos.ts`): perdas, funil do painel, conversão e imob contam o fechamento atual + os reabertos. A conversão lia só 1.000 negócios (teto do PostgREST) — corrigido. `scripts/provar-fechamentos.mts` (local): 5 números iguais antes e depois de reabrir.
- **Smoke com o Lucas (15h28):** a 1ª mensagem reabriu o próprio 3598 (Time JM, etapa 53, histórico com o ganho de 26/09), a 2ª entrou no mesmo, 0 card novo. 3598 devolvido como estava (só o `updated_at` não volta) e o histórico do teste apagado. **Clientes reais reabertos desde a publicação: 0** (até 15h29).
- **Vercel não recebeu o push de `1ed9946`** (nenhum deploy registrado); deploy de produção disparado pela API (`dpl_JCrTewa83…`).
- **Teste local:** a porta 54322 do banco local estava presa por uma conexão do Edge do Lucas (Cloudflare); o banco local subiu na 54332 só para a rodada (`config.toml` devolvido ao original).

## 32. 05/11 de 16h25 a 17h05: CPF só quando muda, lotes das gravações sem conferência e a trava (`422bf80` → `6f6dda5`)

- **Modelo `retorno_atendimento` na Meta (16h00, Graph API pelo token do canal, sem exibir token):** WABA de Jaguariúna `2080511762855117` = **PENDING** (UTILITY, pt_BR); WABA de Mogi `1052104950804382` = **0 modelos** (o modelo foi criado só na de Jaguariúna). `modelos_mensagem` id 1 segue `pendente`. Smoke de envio do Automatize **não feito** (só depois de aprovado; e Mogi precisa do modelo na WABA dela).
- **CPF (`422bf80`, READY 16h3x):** `atualizarCliente` só confere o documento quando os dígitos mudam; a ficha mostra "CPF incompleto" no campo e no aviso de salvo. Cadastro novo e CPF alterado incompletos/inválidos continuam recusados. e2e local 14/14. Produção: ficha da Luana (Mogi, 10 dígitos) abre com o aviso (fechada sem salvar).
- **Gravações sem conferência:** 4 lotes por área, cada um com deploy e smoke (IOwait 5–7%): A `da42b0e` (funil, cadências, distribuição, agenda, chat, metas, ausência; e2e 33/33; READY 16h49), B `1895dcd` (catálogo, histórico, KDS, termo; READY 16h52), C `d8ab4e4` (imóveis, chaves, preferências; READY 16h55), D `83f66f3` (superadmin e Stripe; READY 17h01). e2e B–D 12/12. Smoke em produção: rotas com id inexistente respondem 404 "Nada foi gravado" (antes 200); telas 200.
- **Achado no lote D:** `authenticated` só tem UPDATE na coluna `nome` de `empresas`. As ações do superadmin (plano, status, trial) davam 500 "permission denied" e o `stripe_customer_id` do checkout nunca era gravado (erro descartado: cada checkout criava outro cliente na Stripe). Agora gravam pelo cliente de serviço depois da checagem de quem chama.
- **Trava (`6f6dda5`, READY 17h03):** `scripts/check-gravacao.mjs` no `build` e no `check`. Antes dos lotes: 71 gravações sem conferência (de 142 com o cliente da sessão); depois: 0 fora da lista. Exceções em `scripts/gravacao-excecoes.json`: 43 chamadas / 39 chaves com motivo (upsert que a RLS barra com erro; cliente de serviço passado por parâmetro; gravação de fundo que a tela não confirma). A lista só encolhe. Substitui `lista-update-sem-contagem-20261104.txt`.

## 33. 06/11 de 12h40 a 13h25: busca por contato e loja; fusão junta os negócios (`70f2c89`, `61afaff`)

- **Busca (⌘K) e listas de lead** (`70f2c89`, READY 12h58, IOwait 0,75%): `umPorContatoELoja` (lib/leads.ts, a regra do quadro) deixa um resultado por pessoa e loja, com os ícones dos canais e, na Rede, a loja. Vale também na lista de leads da tarefa/agenda e na busca por nome do assistente. PDV, contrato, garantia e fusão já listavam o contato. Smoke: "Osvaldo" em Mogi = 1 resultado (WhatsApp + Instagram); em Jaguariúna, nenhum (não tem negócio lá). `caf0535`: o verificador procurava o texto antigo do `build` (595 → 593); voltou a 596/5.
- **Fusão junta os negócios** (`61afaff`, READY 13h23, IOwait 3,8%): lib/juntar-negocios.ts — por loja e funil fica o mais avançado (empate, o mais recente); o outro sai do funil com as 21 ligações movidas (cadência repetida sai, automação agendada é pulada, ficha da IA fica). Evento `negocio.juntado` com a foto; desfazer a fusão desfaz a junção. e2e local 21/21; achou e corrigiu: `zapintel_venda_lead` sem `id` (chave `venda_id`) e falha no meio sem volta (agora lê tudo antes e volta sozinha).
- **Casos antigos em produção (leitura, 13h)**: 2 contatos, os dois de fusão — 837 Osvaldo Junior (Mogi: #885 e #512, os dois "Em contato") e 38 Byanca Chami (Jaguariúna: #2607 "Convertido"/ganho e #6259 "Novo"/aberto de 19/10). Regra revista pelo Lucas em 06/11: aberto fica, fechado vai para o histórico (seção seguinte).

## 34. 06/11 às 13h40: fusão com aberto e fechado; os dois casos antigos (`c22db4b`)

- **Regra (Lucas, 06/11):** aberto × fechado → fica o aberto; o fechado vai para `negocio_historico` (ação `fechamento_juntado`, com status, `ganho_em`/`perdido_em`, motivo e valor — como a reabertura do cliente que volta) e continua contando nos relatórios (`lib/fechamentos.ts`, `ACOES_DE_FECHAMENTO`). Dois abertos → o mais avançado; dois fechados → o mais recente. `c22db4b` READY 13h41; e2e local 13/13 (ganhos 82 = 82 = 82).
- **Casos antigos (13h42, dump antes):** `juntar-negocios-existentes.mts --aplicar` nos contatos 837 e 38 — eventos 296 (#512 → #885, Mogi) e 297 (#2607 → #6259, Jaguariúna; o ganho foi para o histórico do #6259). Ganhos antes = depois = 82 (Mogi 79, Jaguariúna 3); perdas 164 = 164. O script era de uso único e saiu do repositório em 09/11 (seção 36).

## 35. 09/11 às 07h53: o quadro sobe pela última mensagem do cliente (`9f557e2`)

- **Antes:** a resposta do vendedor jogava o lead para o topo, acima de quem tinha acabado de escrever, e o cartão nem mostrava horário.
- **Agora:** a coluna ordena (e o "carregar mais" pagina) pela última mensagem RECEBIDA do contato na loja; sem mensagem do cliente, pela criação do negócio. O cartão mostra "cliente há X" (com a cor do SLA quando espera resposta) e "· você respondeu há Y".
- **Ordem:** migração `20261106000100_quadro_ordem_cliente` às 07h53 (IOwait 0,22%; só `quadro_base.momento` e a ordem de `quadro_pagina`; volta em `supabase/scripts/volta/volta-quadro-ordem-cliente.sql`) → push `9f557e2` → READY 07h56. Aprovação do Lucas no chat.
- **Smoke em produção:** nas duas lojas, 0 cartão fora de ordem em todas as colunas (Mogi 14, Jaguariúna 5) e 0 repetido depois de "carregar mais" (Mogi 474 → 734, Jaguariúna 70 → 170); textos nos dois formatos; sem erro de console. API ok (anon 42501, auth 200, `/api/saude` 200). e2e local: `tests/e2e/quadro-cliente-e2e.mjs`.

## 36. 09/11: faxina (dump único, ferramentas no repositório, branches)

- **Dump único** de produção às 08h34 (IOwait 7%): `dumps/2026-11-09-unico/nexus-2026-11-09.7z`, cifrado (AES-256, nomes cifrados), senha só com o Lucas; SHA256 ao lado. Conteúdo: estrutura e dados de `public`/`migracao`/`ops`/`supabase_migrations`, estrutura de `auth`/`storage`, dados de `auth.users`/`auth.identities` e de `storage` (só metadados), `cron.job`, papéis sem senha. Ferramenta: `tools/banco/dump-unico.ps1` (armadilha paga: `7z t -p` testa com senha vazia sem perguntar; o teste vai sem `-p`).
- **Prova de restauração** no Supabase local (`tools/banco/montar-local.sh`: `supabase db reset` com as 62 migrações + dados do dump): 102 de 103 tabelas iguais à produção (`mensagens` +8 = chegaram depois das 08h34), `auth.users` 16 = 16, `storage.objects` 2.667 (+3 depois). O `db reset` completo funciona: o patch local do pg_cron não faz mais falta.
- **Saiu:** todos os outros dumps e backups, a cópia do banco de 19/10, prints com dado real (Playwright, reconstrução Kommo/Nexus, House Brokers), 18 imagens Docker antigas (disco virtual 25,1 → 11,3 GB), lixo do Temp (venv antigo do Whisper, exportações LGPD de teste), 62 branches locais e 14 remotas, 11 scripts de uso único ou sem função, a `lista-update-sem-contagem`, os 6 relatórios de etapa (viraram `RESUMO-RECONSTRUCAO.md`).
- **Entrou no repositório:** `tools/` (gate, api, deploy da Edge por worktree temporária, dump e montagem do local, rebuild, fotos de saúde/IOwait) e `tests/e2e/` (31 e2e locais; e-mails dos usuários de teste em `usuarios.local.json`, fora do git).
- **Ficou de propósito:** a branch `audit/crm-fora-zapintel` — o commit `58d7d3f` tem trancas que a main não tem, entre elas o sequestro de canal (conectar WhatsApp/Página com o id de outro tenant troca o dono do canal pelo upsert `tipo,external_id`).
- **Banco (item 6, aprovação do Lucas no chat; um comando por vez, IOwait abaixo de 10%, API conferida entre eles):** `pg_stat_statements_reset()` às 10h14min27s (2.592 entradas); migração `20261109000100_realtime_sem_pedidos` (a publicação ficou `acessos, contatos, conversas, mensagens, mensagens_internas, negocios`); `20261109000200_drop_uuid_ossp`; `vacuum full` em `historico_bruto` (66 MB → 152 kB, 148 linhas) e em `integracao_eventos` (1,8 MB → 40 kB). Banco: 149 MB. Mensagens entrando entre os comandos.
- **Correção de diagnóstico (05/11):** `acessos` NÃO é tabela sem uso na publicação — a tela Equipe assina `postgres_changes` nela para a presença ao vivo (só busca a foto inicial; o resto vem do realtime). Fica. `pedidos` só tem o KDS (em preparação): ativar o KDS exige pôr de volta (`realtime` no manifesto; 05, "Como nasce um módulo").
- **Modelo `retorno_atendimento` em Mogi:** criado pela Graph API às ~09h25 na WABA `1052104950804382` (mesmo corpo e exemplos do de Jaguariúna, pela `criarModelo` do app; id `1133021199655838`), PENDING. Jaguariúna: APPROVED.

## 37. 09/11 de 14h00 a 15h20: trancas entre empresas (porte do `58d7d3f` e do `eaa1460`), varredura de únicos e fim da `audit/crm-fora-zapintel`

- **Pedido do Lucas:** portar as correções da branch `audit/crm-fora-zapintel` (auditoria de 16/10) para o core v1, com teste no local, gate, e2e e deploy; migrações uma por vez, IOwait abaixo de 10% e API conferida entre elas, com aprovação dele no chat. Depois apagar a branch.
- **Sequestro de canal (o motivo de a branch ter ficado):** conectar WhatsApp ou Página com o id de um canal de OUTRA empresa fazia o upsert `tipo,external_id` (cliente de serviço) trocar o `empresa_id` e o token, e as mensagens dos clientes dela passavam a cair no tenant que conectou. Agora as rotas `canais/whatsapp` e `canais/meta` recusam com 409 antes de gravar (na meta, antes de assinar o webhook da Página), e o gatilho `canais_empresa_fixa` barra qualquer mudança de `empresa_id` em `canais`, até pelo cliente de serviço. Desconectar continua sendo apagar a linha.
- **O resto do `58d7d3f`** (commit `9ee073b`): equipe sem conceder papel do próprio nível e sem ficar sem dono; exportação recortada para quem não tem "ver de outros" e CSV sem fórmula; perda só com motivo da empresa, etapa inexistente no funil = 400, sair da perda limpa motivo e data; distribuição só atribui negócio sem dono (claim atômico na `negocio_atribuir`); orçamento aprovado e cotação de troca usada não mudam; tabela de troca só dono/admin; imobiliária com valor validado e corretor da equipe; impersonação só do próprio site; funil padrão não zera; excluir funil conta a empresa inteira; limite com lixo = 400; meta só para a equipe. Descartados: o "amanhã em Brasília" do cron (o job saiu, `c641555`) e a automação que lança (a main já lança).
- **Ficha do cliente da imobiliária** (`8b38cbd`): o botão "Perdido" da faixa de etapas só devolvia erro depois da trava da perda; agora abre o mesmo "Por que perdeu este lead?" do quadro. e2e local `tests/e2e/perda-imob-e2e.mjs` 10/10.
- **Varredura de recursos únicos entre empresas** (19 índices únicos sem `empresa_id`; `7e7971e`): Instagram confere os DOIS ids da conta (`external_id` e `ig_user_id`) — antes uma segunda empresa podia gravar a mesma conta pelo outro id e derrubar a busca do webhook da primeira; `financeiro_taxas` passa a ser única POR EMPRESA (a taxa "crédito Visa 3x" da JM impedia qualquer outra empresa de cadastrar a mesma); `financeiro_cobrancas (provider, provider_ref)` única (o webhook de pagamento usa `.single()`, e uma cobrança alheia com o mesmo ref fazia a confirmação virar "não encontrada"). Já estavam seguros: slug da empresa (`authenticated` só atualiza `nome`), tokens públicos (aleatórios), identidade de contato (por empresa), `mensagens.external_id` (id da Meta, `do nothing`). Domínio próprio não existe.
- **Banco local antes da produção:** as três migrações em ida, volta e ida, todas as linhas OK (`tests/banco/prova-canais-distribuir.sql`, `tests/banco/prova-unicos-por-empresa.sql`); o erro do gatilho chega pelo PostgREST como `P0001 "Este canal já está conectado em outra empresa."` e as rotas o tratam como 409. Produção conferida antes (só leitura): `negocio_atribuir` idêntica à local (md5), 0 duplicados nas chaves novas.
- **Migrações (aprovação do Lucas no chat):** `20261109000300_canais_empresa_fixa` às 14h00min31s (IOwait 1,77%; versão `20261109170031`), `20261109000400_distribuir_so_sem_dono` às 14h01min08s (2,61%; `170108`), `20261109000500_unicos_por_empresa` às 14h01min45s (3,47%; `170145`). API conferida depois de cada uma (anon 42501, auth 200, `/api/saude` 200). Voltas em `supabase/scripts/volta/`.
- **Deploy 1:** push `4acc200..a3e2d87`, READY às 14h05 (rollback: `dpl_2oETe2nS2DdfNXXFhY8h7KxotBD5`, `4acc200`). Gate no repositório principal: check, 270 testes, verificador 596/5, build. Ajuste do gate (`a3e2d87`): `.claude/**` fora do ESLint e do tsc — com uma worktree dentro de `.claude/worktrees`, o check contava cada aviso duas vezes.
- **Smoke 1:** gatilho em produção numa transação desfeita (canal 15): update de token passa, update de `empresa_id` barrado; nenhum resto gravado. Os 5 canais recebendo (WhatsApp Mogi e Jaguariúna o dia todo; mensagens do Lucas às 14h17 nos dois Instagram e às 14h20 no Messenger) e enviando pelo CRM sem erro (WhatsApp Jaguariúna 5 entregues; Instagram Mogi às 14h26min46s e Messenger às 14h27min12s, pela conta Meta Reviewer). A conversa do Instagram de Jaguariúna não abre para o vendedor de Mogi (isolamento por loja); o envio por esse canal pelo CRM ficou sem prova nesta rodada. Perda com motivo no lead 2930 (do Lucas, funil principal): sem motivo 400, motivo alheio 400, com motivo "Preço" 200 às 14h06min37s, de volta a "Novo" com motivo e data limpos. Exportar como vendedor: 403 em leads, clientes e vendas (na JM o vendedor não exporta; permissão mantida desligada por decisão do Lucas).
- **Porte do `eaa1460`** (`a3805af`, sem a parte do C2S, que saiu do produto): reativação só com cadência da própria empresa (o job inscreve pelo cliente de serviço; com o id de uma cadência alheia as inscrições iam para o outro tenant) — trava na rota (404) e na execução; `formatarData` com timestamp no fuso da loja e data pura em UTC; Stripe não conta update recusado como atualizado e o cron `sync-stripe` devolve os erros; `ponte-vendas` isola a falha por empresa; `recharts` sai (sem import). **`4faa818`** (`3a5cea4`): a prévia do ZapIntel usa `lib/mesma-origem`. Testes: `tests/reativacao-tenant.test.ts` e `tests/datas.test.ts` (5 de 13 falham no código anterior); e2e local `tests/e2e/reativacao-tenant-e2e.mjs` 4/4. Na produção nenhuma empresa tem reativação configurada: nada é afetado hoje.
- **Deploy 2:** gate 283 testes, verificador 599/5 (+3 regras: datas no fuso, cadência da empresa, update do Stripe), build; IOwait 9,70% (pico de 52,55% às 15h02, sem operação nossa em produção naquela hora); push `a3e2d87..3a5cea4`, em produção às 15h12min36s. Smoke: API ok, sem erro de runtime na Vercel desde as 14h, telas do vendedor 200 (dashboard, leads, comunicação, tarefas, clientes).
- **Branches:** `fix/porte-trancas-58d7d3f`, `fix/porte-eaa1460` e `audit/crm-fora-zapintel` apagadas (a última também no GitHub; último commit `4faa818`). Saíram sem porte: `abbf5f9` (início do lote 3, fuso, não validado) e `454079b` (docs dos lotes 1 e 2).
- **Fuso depois do `formatarData` (insumo da entrega própria do fuso por empresa):** ainda há cerca de 40 pontos com data ou hora errada. Graves e visíveis o dia todo: o painel da imobiliária mostra a hora das visitas +3h (`dashboard-imob.tsx`, componente de servidor) e a janela "hoje" começa às 21h; o KPI "Hoje" do painel principal (`lib/painel/metricas.ts`, `setHours(0)` no servidor) soma as vendas de ontem das 21h às 24h e zera às 21h, e "Mês"/"Ano" começam às 21h do último dia; a página pública de agendamento monta os horários em UTC no SSR. Médios: CSV financeiro com `data_venc` um dia antes (`relatorios-view.tsx`); baixa de pagamento depois das 21h grava "amanhã" (`payments/webhook`); bordas de mês em 8 telas de gestão (executivo, financeiro, metas, ranking/`lib/ranking.ts`, visão geral, relatórios imob). Cosméticos: tarefas, agenda e chat com hora +3h no primeiro paint (#418). Achado à parte, que não é fuso: o agendamento público compara os horários ocupados do banco (`…+00:00`) com `toISOString()` (`….000Z`), que nunca batem; horário ocupado aparece livre e só o POST barra (409).

## 38. 09/11 de 17h28 a 17h45: fuso por empresa — uma biblioteca de datas, o banco no fuso da empresa e o agendamento público (`5c7aa66`, `037619d`, `480f3b4`, `1373f0b`)

- **Pedido do Lucas:** fuso por empresa (padrão Brasília, na configuração que já existe), uma biblioteca única de datas usada pelo app inteiro (os ~40 pontos da seção 37, a começar pelos graves), funções do banco no fuso da empresa com teste nas viradas, agendamento público reconhecendo o ocupado, trava no build, teste de antes e depois com números; migração e deploy com aprovação, smoke com ele. Regra permanente no 05, "Datas e fuso horário".
- **O que entrou:** `lib/datas.ts` (agora, dia/mês no fuso, início e fim de dia/semana/mês/ano, períodos, limites, `instanteLocal`, formatação, comparação de instantes); o fuso em `configuracoes_sistema` chave `fuso` (`lib/fuso-empresa.ts`, `useFuso`, `/api/empresa/fuso`, cartão em Configurações → Horário); ~270 usos de data trocados em ~95 arquivos (3 agentes + a sessão), muito além dos 40 da lista, porque a trava achou todos; `scripts/check-datas.mjs` no check e no build com **zero exceções**.
- **Banco (migração `20261110000100_fuso_empresa`, versão `20261109203226`, 17h32min26s, IOwait 7,49%):** `empresa_fuso(p_empresa)` (lê a mesma chave, valida o fuso no Postgres, cai em Brasília); as 5 funções do ZapIntel trocam os 18 `'America/Sao_Paulo'` fixos pelo fuso da empresa (plpgsql: lido logo depois de `zapintel_escopo`; `zapintel_turnos`: CTE materializada); `refresh_status_atrasados` usa o dia da loja (era `current_date` UTC). Corpos copiados da produção (md5 conferido). No local, na mesma transação (mesmo `now()`), as 5 funções devolveram o MESMO JSON antes e depois para a JM; viradas 20h59/21h01/23h59/00h01 e 30/11→01/12, empresa em Manaus, fuso inválido e atrasados ok; ida, volta e ida. Volta: `supabase/scripts/volta/volta-fuso-empresa.sql`. API conferida depois (anon 42501, auth 200, `/api/saude` 200).
- **Agendamento público:** os ocupados eram comparados pelo TEXTO (`…+00:00` do banco × `….000Z` da tela) e nunca batiam — horário marcado aparecia livre, só o POST barrava (409). Agora dias e horários no fuso da empresa (`lib/agendar-slots.ts`), ocupado pelo instante, "agora" do servidor passado à tela e a API só aceita horário oferecido. e2e local 7/7 (marca 16h30, o próximo cliente vê 16h30 ocupado, 409, 400, sem #418). Em produção a Agenda está "em preparação": nenhuma empresa usa.
- **Antes × depois (números, `tests/e2e/fuso-antes-depois.mts`; dados reais da cópia + vendas e lançamentos de teste apagados no fim):** KPI Hoje 07/11 às 21h30: 0 → 2 vendas / R$ 11.140; 06/11 às 9h: R$ 1.000 da venda de ontem às 22h30 → 0; mês em 30/11 às 21h01: "dezembro, 0 vendas" → novembro, 14 vendas / R$ 68.693; 01/12 às 00h01: venda de 30/11 22h40 contada em dezembro → 0; CSV financeiro: 3 de 3 vencimentos com um dia a menos → 0.
- **Gate:** check (com `check:datas`), 315 testes, verificador 600/5 (12 regras antigas apontadas para os trechos novos, +1 "build reprova data fora da lib/datas"), build. e2e locais: `fuso-telas` 30/30 (24 telas sem #418 com o navegador em Tóquio; troca para Manaus e volta), `agendar-publico`, `perda-imob`, `reativacao-tenant`, `quadro-cliente`.
- **Deploy:** push `94f020f..1373f0b`, no ar às 17h36min42s. Rollback: `dpl_HdkvXqLkzEVthVoAzdvJn72rSETN` (`94f020f`); deploy novo `dpl_53EFaY1oSmds45VUuSCgb1y1v9UL` — e a volta do banco acima, se for preciso.
- **Smoke com o Lucas (dono, Rede):**
  - KPI do painel igual ao de antes do deploy (antes das 21h os dois códigos concordam): Mês R$ 76.243,00 / 13 vendas; Hoje R$ 9.350,00 / 1 venda — conferidos no banco pela meia-noite de Brasília.
  - **2ª via do contrato 116 (venda 150): idêntica byte a byte** — 22.281 bytes, SHA-256 `7a896d47…2c2880`, antes e depois (HTML entregue à janela de impressão, interceptado).
  - **Histórico de vendas: as 20 linhas mais recentes iguais** às de antes do deploy (a tabela mostra só a data; 0 diferenças).
  - **Tarefa de teste pela tela, vencimento hoje às 23h:** gravada `2026-11-10 02:00 UTC` = 09/11 23h00 da loja (pelo dia UTC seria 10/11); a lista mostra "09/11, 23:00" em "A fazer"; apagada pela tela (0 no banco).
  - **CSV financeiro:** lançamento de teste criado pela tela (vencimento padrão 09/11, o dia da loja), CSV gerado sem baixar: `09/11/2026` (o código antigo dava 08/11), arquivo `financeiro_2026-11-09.csv`; lançamento removido pela tela (0 no banco). A produção não tinha lançamentos.
  - Configurações → Horário: cartão com Brasília e "Agora na loja: 17:39"; o fuso da JM não foi trocado na produção (troca e volta testadas no local).
  - **Painel da imobiliária: não conferido em produção** — nenhuma empresa tem o módulo Imóveis (em preparação). Conferido só no código (componente de servidor com `formatarHora`/`inicioDoDia` no fuso).
  - **ZapIntel:** o 1º carregamento depois da migração deu 500 em `zapintel_dashboard` E em `zapintel_resumo` (~9 s, o teto de 8 s do PostgREST) — cache frio depois de trocar as funções; a `zapintel_resumo` não foi tocada pela migração. Medido no banco: resumo 6,4 s (fria), dashboard 2,3 s fria / 0,85 s quente; recarregando: 200 em 7,9 s, depois 2,1 s e 2,9 s (dashboard) e 0,5–0,6 s (resumo). O pg_stat_statements de hoje antes da migração já mostrava 1,4–6,3 s. Sem erro de runtime na Vercel desde 17h30.
- **Mudanças que a equipe nota:** campos de data e hora (tarefa, ação do lead, agenda) gravam no relógio da LOJA (antes, no do computador); a fila do dia e o "Iniciar o dia" vão de meia-noite a meia-noite da loja; "atrasado" do financeiro só vira depois da meia-noite da loja.

## 39. 09/11 de 20h05 a 21h17: desempenho do ZapIntel — sem disco temporário, sem funil por lead, tempo esgotado vira evento (`0bf21ea`, `abe95ee`)

- **Pedido do Lucas (depois do diagnóstico das 18h22):** (1) `work_mem` de 16 MB só nas funções do ZapIntel, por `ALTER FUNCTION ... SET`, nunca no banco todo; (2) a CTE materializada relida ~40 vezes vira agregações calculadas uma vez, e `zapintel_funil_interno` por lead vira junção; (3) insights e pós-venda medidas uma vez na produção; (4) cada chamada do ZapIntel que estoura o tempo vira linha em `eventos` (função, empresa, duração), sem log. Teste local antes e depois, migração com IOwait < 10% e aprovação, deploy, smoke nas cinco telas, foto Q2 depois de 1 hora.
- **Item 3, medido na produção (leitura):** insights 8.352 ms (acima dos 8 s do `authenticated`: estourava SEMPRE e por isso nunca aparecia no pg_stat_statements); pós-venda 702 ms (só ninguém tinha aberto). As duas entraram na correção.
- **O que mudou no banco (migração `20261110000200_zapintel_desempenho`):** 10 funções reescritas a partir dos corpos da produção (md5 conferido antes): dashboard (`XA`: as ~25 subconsultas numa passada; `XL`: por loja), insights (`XA` + `NOV`: as "conversas novas" saem da `M`, sem as duas varreduras de todas as mensagens), resumo (`CA`/`CF`), e o anti-join `not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno)` no lugar de `zapintel_funil_interno(l.funil_id)` em 13 pontos (dashboard, dashboard_lista, leads_lista, resumo, analises_pendentes, insights ×3, posvenda, atendimento, turnos, conversa_calc). `work_mem = 16MB` em 10 funções de entrada (as auxiliares `sql` seguem inlináveis). Volta: `supabase/scripts/volta/volta-zapintel-desempenho.sql`.
- **Local, antes × depois (cópia da produção, JM, `work_mem` 2 MB antes):** dashboard 542→466 ms e 78→0 MB de temporário; insights 526→201 ms, 26→0 MB; analises_pendentes 280→216 ms, 51→0 MB; atendimento 489→398 ms, 43→0 MB; leads_lista 184→147 ms, 29→0 MB; dashboard_lista 167→135 ms, 22→0 MB; posvenda 415→390 ms, 16→0 MB; resumo 109→78 ms, 14→0 MB. **29/29 chamadas idênticas** antes e depois na mesma transação (mesmo `now()`; rede, Mogi, Jaguariúna, filtros, ordens, páginas). Ida, volta e ida: a volta restaura as 23 funções com md5 igual ao da produção (o primeiro rascunho da volta esquecia o `reset work_mem` da `zapintel_leads_com_conversa`; o md5 pegou).
- **Item 4 (`lib/zapintel/tempo-esgotado.ts`):** quando uma RPC do ZapIntel volta 57014, a tela grava em `eventos` (`tipo = 'zapintel.tempo_esgotado'`, `entidade = 'rpc'`, `dados = {funcao, duracao_ms, filial, dias, tentativa}`) direto pelo navegador; a RLS `eventos_insert` só deixa gravar na empresa de quem está na tela (provado no local: membro da JM grava, empresa 2 é recusada; superadmin sem impersonar não grava e a tela segue). Ligado em `useRpcAoVivo` (as duas buscas), `useDashboardAoVivo.lista`, `zapintel_conversa` do Atendimento e, no segundo deploy, na rota de servidor `/zapintel/api/perfil/pendentes` (service role). Teste: `tests/zapintel-tempo-esgotado.test.ts` e o caso de timeout de `tests/zapintel-estabilidade.test.ts`. Contar: `select dados->>'funcao', count(*) from eventos where tipo = 'zapintel.tempo_esgotado' and em > now() - interval '1 day' group by 1`.
- **Migração em produção (20h05–20h08, IOwait 0,04–0,05% antes, máximo 4,6% durante):** o arquivo tem 77 KB e não cabe numa chamada do MCP; foi aplicado em **três partes** com o texto exato da `main`, quebradas entre funções (`zapintel_desempenho_parte1` cabeçalho + dashboard/insights/resumo; `parte2` dashboard_lista/leads_lista/analises_pendentes; `parte3` posvenda/atendimento/turnos/conversa_calc + os 10 `ALTER`), API conferida entre elas (anon 42501, auth 200, `/api/saude` 200). Conferência: os 10 corpos com `md5(prosrc)` igual ao do arquivo; as outras 12 funções do ZapIntel com o md5 de antes; `work_mem=16MB` em exatamente 10; nenhuma chamada a `zapintel_funil_interno` restante.
- **Deploy:** `b7321b0..0bf21ea` às 20h08 (no ar 20h10); `0bf21ea..abe95ee` às 20h36 (no ar 20h39; IOwait 21,8% às 20h32 fez esperar até voltar a 2–4%). Gate nos dois: check, 320 testes, verificador 600/5, build.
- **Smoke (dono, Rede):** cinco telas abertas, todas 200 depois da primeira carga. A primeira carga depois da migração estourou (dashboard 9,6 s; insights 10,9 s e resumo 10,5 s juntos) e a 2ª tentativa da própria tela passou (dashboard 1,7 s; insights 7,3 s) — os três estouros viraram eventos. Depois: insights 1,45 s (era 8,35 s e estourava sempre), leads_lista 0,58 s, atendimento 1,09 s, conversa 0,19 s, resumo 0,27–1,0 s, posvenda 4,9–5,4 s junto com o resumo (1,6–1,7 s sozinha). Chamadas uma a uma do navegador: posvenda 1,6 s, resumo 0,5 s, insights 0,54 s, dashboard 1,2 s. No banco, direto: insights 0,32–0,40 s, resumo 0,16–0,27 s, dashboard 0,77–1,08 s, posvenda 0,64–1,2 s. JIT está desligado no servidor (não é ele).
- **Foto Q2 de 1 hora (`pgss-20261109-2022.json` → `pgss-20261109-2117.json`, comparada com a de 18h22, que acumula 10h14–18h22):**
  - **Temporário por chamada:** dashboard 54,0 → **0** MB; analises_pendentes 25,3 → **0**; resumo 5,0 → **0**. Disco temporário do ZapIntel zerado.
  - **Média por chamada:** dashboard 3.293 ms (35 chamadas) → 4.791 ms (7); resumo 1.935 ms (29) → 4.081 ms (11); analises_pendentes 2.358 → 547 ms (1); posvenda 5.176 ms (1). Leituras de disco por chamada: 0 antes e depois.
  - **Eventos `zapintel.tempo_esgotado`:** 5 — três na primeira carga do smoke (20h12) e dois do dashboard às 20h45 (11,0 s) e 21h03 (9,4 s).
  - **CORREÇÃO (21h30, pelos logs da API, janela ≤ 15 min filtrada):** as chamadas de 20h41 a 21h03 — os dois estouros incluídos — vieram TODAS de um só usuário e uma só sessão: a aba de smoke deixada aberta no navegador do app (conta do Lucas), refazendo dashboard + resumo a cada aviso. **Não foi uso da loja**, e a média "depois" é quase só dessa aba, à noite. Padrão nos logs: chamada que chega minutos depois da anterior é lenta (dashboard 6–11 s, resumo 5–6 s); 10–20 s depois da anterior, rápida (dashboard 1,4 s, resumo 0,7 s). Teste às 21h28 (só leitura, aba sem o ZapIntel): resumo 0,86 s depois de 30 s parado × 0,32 s na sequência; dashboard + resumo juntos 2,5 + 0,8 s depois de 35 s parado × 1,4 + 0,6 s na sequência — conexão fria pesa, mas não explica sozinha os 6–11 s depois de minutos parado.
  - **Leitura:** o que a migração prometia (disco temporário e a insights estourando) está resolvido. O comportamento do dashboard com a loja aberta ainda não foi medido: medição de concorrência pedida pelo Lucas para 10/11 às 11h (pico de ~295 mensagens/h), só leitura.

## 40. 10/11: o painel do ZapIntel estourando, a causa (memória, não CPU), a troca para a Small e o cache que NÃO subiu

- **O sintoma (smoke de 10/11 13h54):** só ABRIR o painel disparava dashboard, resumo e pendentes ao mesmo tempo;
  com o banco lento, os três passavam dos 8 s juntos (9 `tempo_esgotado` em 16 s). 14h25–14h43: ~70 estouros de
  30 a 146 s em todas as telas; 164 entre 12h e 15h55.
- **A causa:** memória. Nano com 408 MB de RAM e `shared_buffers` de 224 MB: swap de 673–919 MB (até 206% da RAM),
  commit 1,8 GB para 1,4 GB de capacidade, IOwait 13–89%. A mesma consulta, com as mesmas 56.546 páginas "em
  cache" (que estavam no swap), levou 2,4 s, depois 31,2 s, depois mais de 60 s. CPU pura (`generate_series`)
  105 ms, onde se esperava ~20. Notas: `cache-painel-e-cpu.md` (pasta de notas da sessão hopeful-carson).
- **A decisão:** o Lucas trocou para Pro + Small (07; ~36 min fora do ar). Depois: swap 0, IOwait 0,2–3,6%, dashboard
  848 ms a frio e 788 ms a quente, resumo 163 ms, zero estouro. **O cache do painel não subiu** ("não sobe", Lucas,
  10/11). A branch `feat/zapintel-cache-painel` (`b9ae358`, nunca foi ao GitHub) foi apagada; o código inteiro está
  em `anexos/cache-painel-20261110.patch`. **Se os estouros voltarem**, refazer a partir daqui.

### O que a solução faz (para refazer)

1. **Banco (migração `20261110000400_zapintel_cache_painel`, no patch; volta em
   `supabase/scripts/volta/volta-zapintel-cache-painel.sql`).** Sem tabela nem coluna nova: reusa
   `zapintel_conversa_cache` (`empresa_id`, `chave`, `dados`, `gerado_em`; já fechada para anon e authenticated),
   com chaves que começam por `painel:` (as de "Como a loja conversa" são `<dias>:<lojas>` e não se cruzam).
   - `zapintel_dashboard`, `zapintel_resumo` e `zapintel_analises_pendentes` são **renomeadas** para `*_calc` (corpo,
     ACL e `SET work_mem` intactos; execução tirada de todo mundo). Funções **novas com o mesmo nome e assinatura**
     chamam primeiro `zapintel_escopo` (a trava de acesso continua antes de tudo) e depois
     `zapintel_cache_painel(empresa, chave, sql_do_calculo, 60 s)`.
   - Chaves: `painel:dashboard:<versão>:<lojas>`, `painel:resumo:<lojas>`, `painel:pendentes:<versão>` (lojas =
     `zapintel_cache_lojas(array)`, ordenadas e sem repetição).
   - `zapintel_cache_painel`: guardado com menos de 60 s → devolve (select pela chave primária). Senão
     `pg_try_advisory_xact_lock` por empresa+chave: **um cálculo por vez por chave**; quem chega enquanto outro
     calcula recebe o guardado anterior (ou espera, se não houver). Cálculo cortado pelo `statement_timeout`
     (57014) com guardado → devolve o guardado com `atrasado: true` e grava `eventos` `zapintel.calculo_cortado`
     (`chave`, `guardado_em`, `duracao_ms`). Sem guardado (primeira vez da chave), o erro sobe como antes.
   - `zapintel_analises_pendentes_expirar(p_empresa)` (só service_role): a rota `/zapintel/api/perfil/pendentes?atualizar=1`
     expira a chave depois de um lote do robô.
   - **Ordem do deploy:** migração primeiro (os wrappers funcionam com o app antigo), depois o app.
2. **App.** `hooks/zapintel/fila.ts`: uma consulta do ZapIntel por vez na aba, prioridade tela (0) < menu (1) <
   robô (2), começando na volta seguinte do laço (a ordem não depende de quem montou primeiro). `useRpcAoVivo`
   ganhou `prioridade`; o resumo do menu ficou `soVisivel`; o robô espera `quandoVisivel()`. O painel mostra
   "números de X atrás (banco lento)" quando `atrasado`.
3. **Testes:** `tests/zapintel-fila.test.ts` (5), o caso de expirar em `tests/zapintel-estabilidade.test.ts`, a
   lista da seção 6 de `supabase/testes/zapintel_acesso.sql`, e o e2e `tests/e2e/painel-frio-lento.mjs` (Docker,
   Supabase local, CPU do banco estrangulada com `docker update --cpus`).

### Os números do teste (local, cópia da produção, empresa 1, 10/11)

| Cenário | Resultado |
|---|---|
| Calibração | dashboard 925 ms com CPU livre; 2.757 ms com `--cpus 0.25` |
| A — como era (as três juntas, 8 s, `--cpus 0.25`) | dashboard 4.640 ms, resumo 2.025 ms, pendentes 3.816 ms, em paralelo |
| B — abertura a frio com o cache e a fila | dashboard sai em 0,8–3,9 s → resumo 3,9–4,5 s → pendentes 4,5–6,1 s (contado do início da página), uma por vez, todas 200, **0 `tempo_esgotado`**; reabrir: 66 ms |
| C — duas sessões abrindo juntas | o mesmo `geradoEm` nas duas: **um cálculo só** |
| D — `--cpus 0.08` (o cálculo leva 8.117 ms, passa dos 8 s) | abre com os números guardados e "banco lento", **0 `tempo_esgotado`**, 1 `calculo_cortado` |
| Gate | `npm test` 337/337; check e eslint ok; verificador 600/5 (as 5 de sempre, iguais na `main`) |

### Pendências se for refeito

- **A chave de visibilidade.** A chave é empresa + lojas + versão e **não leva quem pede**. Hoje está certo: o
  `zapintel_escopo` só deixa passar dono, admin e superadmin, os três enxergam todas as lojas, e os `*_calc` não
  olham `auth.uid()` (conferido em 10/11 na produção). **Se o ZapIntel abrir para gerente ou vendedor com alcance
  menor** (só a loja dele, só os leads dele), a chave tem de ganhar essa dimensão (por exemplo, o
  `zapintel_escopo` devolver um "recorte de visibilidade" que entra na chave). Sem isso, um gerente veria o número
  calculado para o dono, e vice-versa.
- **A primeira vez de uma chave** ainda pode estourar num banco muito lento (não há guardado para devolver).
- O patch foi feito sobre a `main` `a19ab58`; refazer com `git apply --3way` e conferir os corpos dos `*_calc`
  contra a produção (md5) antes de aplicar, porque a migração renomeia o que estiver lá.

### Small × Micro: fica na Small (decisão do Lucas, 11/11 ~14h, antecipada)

A regra era: pico de uso real abaixo de ~650 MB e swap perto de zero → voltar para a Micro (1 GB) numa noite com
a loja fechada; acima disso, ficar na Small. As medições vieram do painel Observability → Database, minuto a minuto,
uma leitura por hora com a loja aberta (`tools/saude/memoria-cpu-recente.js`, rodado no Chrome do Lucas, porque o
navegador do app dá "Unable to load data"). Os números:

| janela | usada máx (hora) | usada méd | swap máx | IOwait méd / máx |
|---|---|---|---|---|
| 10/11 17:14–18:14 | 493 MB (17:35) | 424 | 0 | 0,1% / 0,2% |
| 10/11 18:03–19:03 | 461 MB (18:58) | 416 | 0 | 0,1% / 0,2% |
| 10/11 19:03–20:03 | 432 MB (19:06) | 402 | 0 | 0,0% / 0,1% |
| 10/11 20:17–21:16 | 548 MB (20:55) | 387 | 0 | 0,0% / 0,1% |
| 11/11 08:02–09:02 | 435 MB (08:14) | 421 | 0 | 0,1% / 0,1% |
| 11/11 09:03–10:02 | 588 MB (09:52)¹ | 440 | 0,06 MB | 0,1% / 0,8% |
| 11/11 10:03–11:02 | 492 MB (10:17) | 441 | 0,06 MB | 0,1% / 0,2% |
| 11/11 11:03–12:02 | 572 MB (11:43) | 463 | 0,06 MB | 0,1% / 0,2% |
| 11/11 12:03–13:02 | 503 MB (12:25) | 467 | 0,06 MB | 0,1% / 0,2% |
| 11/11 13:03–14:02 | **606 MB (13:35)** | 471 | 0,06 MB | 0,1% / 0,2% |

¹ Essa hora inclui as consultas do levantamento do buraco de mensagens (09:15–09:50). Às 13:35 não rodei nada.

Nas mesmas horas:
- **Cache:** máximo entre 1.198 e 1.239 MB.
- **Commit:** máximo entre 1,7 e 2,0 GB, com capacidade de 2,79 GB.
- **Eventos:** zero `zapintel.tempo_esgotado` e zero `zapintel.calculo_cortado` de 10/11 16:33 até 11/11 14h.
- **Fora da medição:** a noite das 21:16 às 08:02, porque as leituras eram só das 8h às 20h.

**Por que não cabe na Micro:**
- O "Used" do painel **não inclui o `shared_buffers`**, que fica contado em Cache. Na Micro o `shared_buffers`
  seria ~256 MB.
- O pico de 606 MB com mais ~256 MB dá **~860 MB de 1 GB**. Sobrariam ~150 MB para o cache de disco, e a média
  sobe ao longo do dia (em 11/11, de 421 MB às 8h para 471 MB às 13h).
- Foi exatamente esse aperto que levou a Nano ao swap e ao IOwait de 13–89% em 10/11.

**Custo de ficar na Small:** US$ 0,0206/h, ~US$ 14,83 no ciclo de 10/11 a 10/12. São US$ 4,83 além do crédito de
computação de US$ 10, o que dá **~US$ 29,83 no mês com o Pro** (o painel projetou US$ 29,42). A Micro custaria
US$ 25,00.

**Reavaliar a Micro só se:**
- o uso real cair de forma sustentada (pico abaixo de ~400 MB numa semana inteira); ou
- o custo pesar mais que a folga.
- Nos dois casos, a troca segue a regra do 05: loja fechada, até 40 min fora do ar.

### O buraco de mensagens da troca (15:57–16:33)

A Edge não gravou nada nesses 36 min. O levantamento do lado do banco foi feito em 11/11 de manhã; a lista completa
está em `buraco-15h57-mensagens.md`, na pasta de notas da sessão hopeful-carson.

- **Esperado no buraco:** ~45–80 mensagens recebidas, pelo ritmo de 10/11 das 15h às 15h57 e pelo de 03/11.
  - WhatsApp Mogi: ~19–48.
  - WhatsApp Jaguariúna: ~25–30.
  - Instagram: até 5.
- **Reentrega da Meta:** houve, pelo menos em parte, no **WhatsApp Mogi**.
  - 11 avisos de status (entregue/lida) com hora da Meta dentro do buraco foram gravados depois que o banco
    voltou, o primeiro às 16:37. Isso só pode vir de reentrega.
  - A Edge teve ~60 entregas 200 entre 16:34 e 16:37, contra ~7 por minuto no normal.
  - O WA Mogi recebeu 134 mensagens entre 16:30 e 17:30, contra 72 em 03/11.
- **No WhatsApp Jaguariúna, nenhum sinal de reentrega:** 20 recebidas contra 39 em 03/11, e nenhum status do buraco.
- **O banco não prova o que a Meta nunca reentregou.** A mensagem ao vivo é gravada com a hora da gravação; só o
  histórico de sincronização usa a hora da Meta.
- **Lista para conferir nos celulares (coexistência): 35 conversas.**
  - Mogi tem 30: 2 em que o cliente falou por último, 1 em que a loja falou por último antes do buraco, 4 já
    retomadas e 23 follow-ups em massa.
  - Jaguariúna tem 5: 3 em que o cliente falou por último, 1 em que a loja falou por último e 1 já retomada.
  - Instagram e Messenger não têm nenhuma.
- **Pendente:** o resultado da conferência nos celulares, que o Lucas traz numa sessão futura. Anotar aqui.

## 41. 10/11: o Assistente numa execução só e a trava do dashboard (`5b88e41`, `732585a`, `09d7d3c`, `a19ab58`) — smoke da noite passou

- **Pedido do Lucas:** (1) status das conversas numa execução só, com o filtro do `leads_buscar` dentro do SQL, e o porquê dos 3,8 s; (2) `buscarTudo` em fila quando a fonte é função, lendo só as páginas que existem; (3) cache de 60 s por empresa no Assistente para status, fichas e equipe; (4) a trava do dashboard. Meta: no máximo 4 consultas em fila por pergunta, nenhum tempo esgotado, respostas idênticas antes e depois. Condições da aprovação: empresa e loja vêm da sessão no servidor, nunca do corpo; teste de isolamento no local; a função antiga na lista de morte do 05.
- **Por que a antiga levava 3,8 s:** `assistente_status_conversas` juntava as 112.698 mensagens aos negócios ANTES de agregar (59.311 páginas por índice em ordem aleatória × 4.717 da tabela), estimativa de 368 × 112.688 linhas, ordenação em disco; e o `buscarTudo` paginava em ondas de 8 — 9 execuções por pergunta.
- **Banco (migração `20261110000300_assistente_uma_execucao`, aplicada ~13h50 com IOwait 3,5%):** `assistente_status_leads` (definer, só `service_role`; agrega as mensagens primeiro, junta depois; filtros loja, esperando, ativo, parado e classificação no SQL como pré-filtro conservador, a regra exata segue no JS; devolve jsonb, sem o teto de 1.000 linhas do PostgREST) e `assistente_leads_visiveis` (invoker, `authenticated` + `service_role`, sem anon: a RLS de quem pergunta decide). Na produção: nova = antiga nos 3.167 leads ativos, 0 diferenças; 77–160 ms com o banco calmo (Jaguariúna), ~413 ms a rede. Volta: `supabase/scripts/volta/volta-assistente-uma-execucao.sql` (voltar o app antes).
- **App:** `lib/assistente/cache.ts` (60 s por chave, uma leitura só para pedidos simultâneos, erro não fica guardado); `leads_buscar`, `leads_numeros`, `analises_pendentes` e a busca por texto EM FILA; `buscarTudo(consulta, { funcao: true })` em fila (ponte, pendentes, Assistente) e, em tabela com `count` na primeira página, lê só as páginas que existem (vendas). Teste-trava: nenhum `buscarTudo` sobre `.rpc(` sem `{ funcao: true }`. Trava do dashboard em `hooks/zapintel/ritmo.ts` (só mensagens, 60 s, folga de 0–5 s, só com a aba visível, partilhada entre abas por BroadcastChannel).
- **Provas no local (cópia de 09/11, login do Eduardo):** `tests/e2e/assistente-antes-depois.mts` → **34/34 saídas idênticas**; `leads_buscar` de 21 consultas (até 14 juntas) para **4 em fila**; as 5 de 10/11 em sequência com o cache: 4, 3, 2, 3, 3; com texto, 8–9 em fila. `tests/e2e/trava-dashboard-abas.mjs` (3 abas, 4 min): aba escondida 0 consultas, recálculos com 61 s entre eles (antes ~28), nunca dois juntos. `tests/e2e/assistente-isolamento.mts` → **17/17**: status recusada (42501) para usuário e anon; `leads_visiveis` com empresa ou loja de outra empresa = 0; loja de outra empresa pelo nome = "não encontrada"; empresa trocada no servidor = 0. Gate: check, testes, verificador 600/5, build.
- **Deploy:** `a19ab58` READY 13h52 (`dpl_4aQcFvZoXDW9SuNFSkP1pRgjWnRc`).
- **Smoke das 13h54: NÃO passou** e as perguntas não foram feitas — só abrir o painel estourou 9 vezes (dashboard, resumo e pendentes de 8,9 a 10,3 s, juntos). Era o banco sem memória (seção 40), não o Assistente.
- **Smoke da noite (20h50–20h53, já na Small, loja fechada):** o painel de observabilidade da Supabase não carregava os gráficos ("Unable to load data", duas tentativas, 20h30 e 20h38); **com a palavra do Lucas**, valeu a leitura das 19h03–20h03 (IOwait médio 0,0%, máximo 0,1%; swap 0; nenhum estouro). Conta do Lucas impersonando a JM, painel aberto ("toda a rede"), 5 perguntas seguidas ao Assistente: leads de Jaguariúna em aberto; quem está esperando resposta; leads com conversa nos últimos 7 dias em aberto; leads novos do mês por origem; quentes parados há mais de 3 dias. As 5 responderam em 10–15 s cada. **0 `zapintel.tempo_esgotado` e 0 `calculo_cortado`** desde 20h50. Saída da empresa (`impersonando_empresa_id` nulo) e aba fechada.
- **Visto no smoke (não é do pacote, fica anotado):**
  - **O Assistente segue a loja do CRM, não o seletor do ZapIntel.** O painel estava em "toda a rede", mas `filiais_visiveis()` devolve a `filial_atual()` do dono/admin/suporte — para a conta do Lucas, Mogi Guaçu. As 5 respostas vieram só de Mogi, e a de Jaguariúna disse "essa loja não aparece no seu escopo". É a regra da RLS (igual no resto do CRM), mas confunde quem está olhando o ZapIntel na rede.
  - **"Esperando resposta" do Assistente ≠ o do painel:** 547 em Mogi (sem corte de tempo, desde agosto) contra 91 no painel (janela recente). O modelo não aplica janela se ninguém pede.
  - Na 1ª resposta o modelo citou "2.238 leads" sem ter consultado e se corrigiu sozinho na 2ª.
- **Pendente:** `assistente_status_conversas` está na lista de morte do 05 (critério "nenhum leitor no código e no banco"; no código já são 0) — conferir `pg_proc`/views/`cron.job` e o pg_stat_statements sem chamadas desde o deploy, e derrubar na próxima migração, com aprovação.

## 42. 10/11: módulo Transmissão (em produção desde 10/11 21h; resultado do smoke de 11/11 no fim da seção)

Um modelo **aprovado** da Meta para uma lista de contatos de **uma loja**, pelo WhatsApp **dela**. Nasce como módulo
(`transmissao`, grupo Comunicação, item opcional no menu, vitrine, tile na Central), desligado em todas as empresas.

### Como funciona

- **Lista por filtro** (`lib/transmissao/filtro.ts` + `transmissao_publico` no banco): funil, etapa, situação
  (aberto/ganho/perdido), origem do contato, "sem mensagem há mais de N dias" (ou nunca conversou), "com mensagem
  nos últimos N dias". Um contato por linha (o negócio mais recente que casa). **É o embrião do módulo Públicos**:
  a função é a que ele herda.
- **Prévia antes de enviar** (`transmissao_previa`): quantos recebem e quantos ficam fora, por motivo (opt-out,
  bloqueado, sem telefone, mesmo modelo há menos de 7 dias), com 5 nomes de exemplo (só o final do número).
- **Disparar** congela a lista (`transmissao_montar`: aptos `pendente`, os de fora `pulada` com o motivo; lista sem
  nenhum apto é recusada) e começa já (`after()`, primeiro lote logo depois da resposta) ou **agenda** (dia + hora da
  loja). Loja sem WhatsApp conectado não dispara.
- **Travas do Automatize, repetidas:** só modelo aprovado (rota, banco e Edge); opt-out e bloqueado fora (na
  montagem e de novo na hora do envio); horário de atendimento da loja no fuso da empresa; **teto por hora por
  empresa** (configurações `transmissao` → `teto_hora`, padrão 50, 1–1000, somando todas as transmissões); fila que
  não descarta; **1 envio do mesmo modelo por contato a cada 7 dias, contando Automatize e Transmissão juntos** (o
  Automatize passou a olhar `transmissao_envios` também); **pausar / retomar / encerrar** (encerrar marca o que não
  saiu como "não enviado").
- **Fila:** sem job novo. O `automacoes-hora` do pg_cron (minuto 17) chama `/api/cron/automacoes`, que agora roda
  também `processarTransmissoes` com o tempo que sobra até ~55 s (o `net.http_get` espera 60 s). Reserva por
  `FOR UPDATE SKIP LOCKED` (`transmissao_reservar`, só service_role): disparo e cron juntos não mandam duas vezes.
  Agendada começa na primeira rodada depois do horário (precisão de 1 h).
- **Envio:** caminho de serviço novo na Edge, irmão do `send_template_automacao`: `?action=send_template_transmissao`
  (só a chave de serviço; confere envio reservado, transmissão `enviando` — pausar barra o que estiver em voo —, modelo
  da transmissão aprovado, contato sem opt-out/bloqueio; número e negócio vêm do banco, não do corpo). **Não cai no
  WhatsApp de outra loja** (o `canalDaLoja` cai, para a transmissão é recusado). Mensagem gravada com `origem =
  'transmissao'`. Erro 4xx da Meta = falha; rede/5xx = nova tentativa (até 3); "Meta não respondeu" = falha sem
  reenviar (pode ter chegado).
- **Acompanhamento:** enviadas, entregues, lidas (de `mensagens.status_entrega`, que o webhook de status já mantém),
  responderam e falhas, por transmissão (`transmissao_numeros`, com a RLS de quem pede) e por contato
  (`/api/transmissao/[id]`). A tela relê a cada 20 s só enquanto envia e só com a aba à vista.
- **Respondeu → card:** gatilho `mensagens_transmissao_resposta` (AFTER INSERT em `mensagens`, só `recebida`): a
  primeira resposta em até 7 dias marca o envio e põe `dados._transmissao` ({id, nome, respondeu_em}) no card do
  contato na loja + `negocio_historico` `respondeu_transmissao`. O card mostra "origem: transmissão · <nome>"
  (link para o acompanhamento). **A `origem` do contato NÃO muda**: ela é o canal por onde a tela responde.
- **Quem pode:** dono e admin criam, veem a prévia e disparam (rota + RLS + funções definer conferindo
  `is_empresa_admin`); vendedor vê as transmissões e o acompanhamento **da loja dele**, sem botões.

### O que entra (migração `20261111000100_transmissao`, volta `supabase/scripts/volta/volta-transmissao.sql`)

`transmissoes`, `transmissao_envios` (RLS por empresa + loja visível; envios só service_role grava), funções
`transmissao_publico`, `transmissao_loja_ok`, `transmissao_origens`, `transmissao_numeros` (invoker),
`transmissao_previa`, `transmissao_montar`, `transmissao_reservar`, `transmissao_resposta` + gatilho em `mensagens`.
**DDL em `mensagens` (o gatilho)**: tabela quente — com a loja fechada e o gate de IOwait. Custo do gatilho por
mensagem recebida: uma leitura por índice parcial (`transmissao_envios_resposta_idx`).

### Provas (local, 10/11)

- `npm test`: 340/340 (8 novos em `tests/transmissao-filtro.test.ts`); travas do build ok.
- `tests/e2e/transmissao-e2e.mjs` (**65/65**): empresa, lojas, usuários, contatos e modelo DE TESTE criados no banco
  local e apagados no fim; Edge no deno; Graph falsa que só aceita 5519900…. Cobre vitrine desligado → Central
  instala → API; prévia (5 aptos, 4 fora pelos 4 motivos, incluindo o modelo mandado pelo Automatize há 3 dias);
  tela do dono do filtro ao disparo; teto 3 (3 saem, 2 esperam, o cron da hora seguinte manda o resto e conclui;
  rodar de novo não manda); entregue/lida pelo webhook de status; resposta → envio marcado, card com a origem, quem
  não recebeu e escreveu não ganha marca; 7 dias na transmissão seguinte; pausar (cron não manda, Edge recusa em voo
  com 409), retomar; fora do horário (nada sai, a tela diz quando volta); encerrar; Loja B sem WhatsApp (409); lista
  vazia (400); agendar; vendedor vê e não dispara (API 403, RLS 0 linhas, montar e reservar negados); vendedor da
  outra loja não vê; Edge sem chave de serviço ou com a anônima = 401; **todos os 9 envios para número de teste**.

### Pendências e decisões

- **Etiqueta: o CRM não tem.** Nem tabela, nem campo, nem no `dados` (conferido no esquema em 10/11). O filtro saiu
  sem ela. Decisão do Lucas: criar etiqueta no core (tabela + tela no card) ou deixar para Públicos.
- Produção: migração (loja fechada, IOwait < 20%) → Edge `webhook-leads` com o código desta branch → push do app.
  Ordem no 05, "Transmissão".
- Smoke em produção só com o número do Lucas e um modelo aprovado de teste.
- A Meta cobra por conversa de modelo de marketing e mede a qualidade do número: começar com lista pequena.

### Produção e smoke (10–11/11)

- **10/11 ~21h:** migração `20261111000100_transmissao`, Edge e app (`ac8d441`) no ar.
- **Smoke 1 (11/11 ~06h, Mogi): todo envio voltou 401 da Edge.** A Edge comparava a chave de serviço por igualdade
  de texto com a `SUPABASE_SERVICE_ROLE_KEY` que o Supabase injeta; a da Vercel é válida mas **não é a mesma
  string**. Troca (decisão do Lucas): segredo próprio `EDGE_INTERNAL_SECRET` (Vercel Production + segredos da
  Edge, sem exibir), cabeçalho `x-edge-internal-secret`, comparação em tempo constante sobre o SHA-256; vale para
  `send_template_transmissao` e `send_template_automacao`; o caminho pela chave de serviço saiu (`a23ff5b`).
- **RLS de `modelos_mensagem`** só aceitava membro da empresa: superadmin em impersonação via "nenhum modelo
  aprovado". Migração `20261111000200_modelos_mensagem_rls_empresa` (aplicada 11/11 ~06h22): segue `get_empresa_id()`.
- **Modelo é aprovado por WABA, não por empresa.** A JM tem uma WABA por loja; o `retorno_atendimento` estava
  aprovado só em Jaguariúna. Migração `20261111000300_modelos_por_waba` (`modelos_mensagem_wabas`, status por
  número; `modelos_mensagem.status` vira resumo); a sincronização grava o status de cada número; Transmissão e
  Automatize só oferecem e só enviam o que está aprovado no número da loja (rota, `transmissao_montar`, motor e Edge).
  **Aplicada 11/11 ~10h19 (IOwait 0,15%, pelo endpoint Prometheus do projeto).** Sincronização logo em seguida
  (função nova, daqui): `retorno_atendimento` **aprovado nas duas WABAs** — Mogi saiu de pendente durante a manhã
  (meta_id `1133021199655838`); Jaguariúna `974790525693669`. A Graph (`message_templates`) confirma os dois APPROVED.
- **Smoke 2 (11/11, Jaguariúna, cron das 09h17): a Meta ACEITOU e 8 s depois devolveu `failed` 131042 — "a conta
  da Meta está sem forma de pagamento".** Modelo abre conversa paga; mensagem de sessão segue normal (5 mil+ de
  Jaguariúna em 30 dias, nenhuma falha de pagamento). O acompanhamento contou certo (1 enviada, 1 falha).
  **Graph API (`health_status`, 11/11):** as **duas** WABAs (Mogi `1052104950804382` e Jaguariúna
  `2080511762855117`) estão `BLOCKED` com **141006** (erro na forma de pagamento); a empresa (Business) está
  `LIMITED` com **141010** (verificação do negócio não feita). `primary_funding_id` só é lido por BSP.
- **Correções do smoke 2:**
  - `failed` da Meta depois de aceitar → o item da fila vira **falha** (`transmissao_envios` e
    `automacao_execucoes`), com o motivo "A Meta recusou depois de aceitar: …": devolve a vaga do teto por hora e
    não conta na regra de 7 dias (as duas só olham `enviada`/`executada`). A Edge faz no webhook de status
    (`falhaDepoisDeAceita`); o app confere de novo depois de gravar `enviada` (`lib/canais/falha-meta.ts`) para o
    caso de o status chegar primeiro.
  - **Aviso por loja** "Conta da Meta de <loja> sem forma de pagamento" na Transmissão (topo, mensagem do
    formulário e acompanhamento) e no Automatize (barra, quando alguma automação manda modelo, e no criar).
    Fonte: `health_status` da Graph, guardado 10 min em `configuracoes_sistema` (`whatsapp_saude`), mais a recusa
    por pagamento numa mensagem do número depois da última leitura boa (`lib/canais/saude-whatsapp.ts`).
- **PENDENTE até a primeira transmissão real depois do pagamento:** entregue, lida e respondida em produção (e a
  "origem: transmissão" no card, que só grava na resposta). Cobertos no e2e local; em produção, não vistos.
- **Corrigido em seguida (pedido urgente do Lucas, 11/11 ~10h40):**
  - **erro de conta no próprio envio não marca mais o canal.** A recusa síncrona 131042 fazia
    `marcarErroNoCanal(…, "erro")`: o canal saía de `canalDaLoja` (exige `status = 'ativo'`) e a loja parava de
    mandar até mensagem comum de atendimento. Agora (`ERRO_DE_CONTA` na Edge: 131042, 141006) o envio falha com
    `codigo: "sem_pagamento"` e motivo claro, a WABA é anotada "sem pagamento" no cache de saúde (o aviso por loja
    aparece na hora) e o canal fica `ativo`. O canal só é marcado quando a falha impede todo envio: token
    inválido (190 → `expirado`) e número desconectado (`account_update` → `desconectado`).
    **Produção em 11/11 ~10h45: os 5 canais da JM `ativo`, nenhum com `ultimo_erro`** (o canal não guarda
    histórico de marcações anteriores);
  - **modelo manual (Comunicação e card do lead) confere o número:** `GET /api/modelos?negocio=` devolve só o
    aprovado na WABA que envia pela loja do negócio (mesma regra do `canalDaLoja`) e o aviso de pagamento dessa
    WABA, mostrado antes de enviar; a Edge recusa com `codigo: "modelo_fora_do_numero"` (409).
- **Achados para propor (não mexidos):**
  - o gatilho de resposta escolhe o card por ordem diferente de `core_negocio_do_canal`;
  - `transmissao_publico` não filtra `negocios.ativo`;
  - verificação do negócio (141010) limita o volume de conversas iniciadas pela empresa.

## 43. 11/11: o recorte do Assistente, "esperando resposta" numa definição só e número com fundamento (branch `fix/assistente-escopo`)

- **Pedido do Lucas (depois do smoke de 10/11, seção 41):** (1) o Assistente usa o recorte da tela do ZapIntel (loja ou rede), validado no servidor contra as lojas que o usuário pode ver; loja fora do alcance é dita; toda resposta abre com o recorte usado; (2) uma definição só de "esperando resposta", numa função, usada pelo painel, pelo Assistente, pelo filtro da Comunicação e pelo quadro; (3) número só de consulta, e depois a checagem de fundamento.
- **Levantamento das 4 contas (antes):** painel do ZapIntel = última recebida > última enviada nas últimas 72 h, por negócio principal (contato + loja, canais juntos), candidatos (`unqualified`) à parte; Assistente = a mesma comparação SEM janela (desde agosto — os 547 de Mogi); Comunicação = por conversa (contato + canal), sem janela; quadro = selo do cartão recebida > enviada, mas o contador do topo contava NÃO LIDAS. Em todas, envio que falhou contava como resposta.
- **Decisão do Lucas:** a regra do painel vira a padrão (canais da loja juntos, 72 h, candidatos à parte); envio que falhou (`status_entrega` `falhou`/`falha_envio`) não conta como resposta; o topo do quadro passa a contar "esperando resposta" (as não lidas ficam no selo de cada cartão).
- **Banco (migração `20261111000400_esperando_resposta`; era 0200, renumerada duas vezes porque 0200 e 0300 são da Transmissão):** `esperando_resposta(p_empresa, p_lojas, p_agora)` (sql, stable, definer, só `service_role`) → `(negocio_id, contato_id, filial_id, desde, a_parte)`; `esperando_resposta_visiveis()` (definer, `authenticated` + `service_role`, empresa e lojas da sessão: `get_empresa_id()` + `filiais_visiveis()`). Passam a usá-la: `zapintel_dashboard`, `zapintel_dashboard_lista`, `zapintel_leads_lista` (coluna `esperando_ja`; `work_mem = 16MB` reaplicado), `assistente_status_leads` (esperando e desde) e `quadro_contagens`. Volta: `supabase/scripts/volta/volta-esperando-resposta.sql` (corpos de 20261110000200, 20261110000300 e 20261104000200; voltar o app antes).
- **App:**
  - **recorte:** `lib/assistente/recorte.ts` — no ZapIntel o corpo só diz qual loja a tela mostra; `zapintel_escopo` com a SESSÃO decide (dono/admin/suporte; loja de outra empresa = 403, lixo = 400); no CRM segue a RLS. As ferramentas devolvem o recorte; loja fora do alcance responde "fora do seu alcance". A 1ª linha de toda resposta é `**<recorte> · <período>**`.
  - **número só de consulta + fundamento:** `lib/assistente/numeros.ts` e o laço em `chat-dados.ts`. Sem consulta, o texto com número fica seguro até a 1ª ferramenta; com consulta, todo número de contagem, valor ou percentual da resposta final tem de estar nos resultados das ferramentas daquela resposta, ou ser soma direta de dois, ou — liberado pelo Lucas em 11/11 — percentual da divisão de duas QUANTIDADES (inteiro ou uma casa; id, telefone e número solto de texto não entram na divisão). Faltou: a resposta sai da tela (evento `troca`) e o modelo é mandado corrigir uma vez; insistiu, o número vira "[número não consultado]".
  - **esperando:** `lib/esperando.ts`; Comunicação (filtro "aguardando" e selo pelo mapa da função, relido 2 s depois de mensagem nova), quadro (cartão pelo contexto + contador "esperando resposta"), Assistente (`esperando_loja`).
- **Provas no local (cópia de 09/11 08h39, montada às 11/11 ~12h; login do Eduardo, admin da JM, `filial_atual` = Jaguariúna):**
  - `tests/e2e/esperando-antes-depois.mts` — antes × depois por tela: painel (rede 18, Mogi 16, Jaguariúna 2, lista do card 18, lista de leads 18) **igual**; Assistente (rede) **971 → 18**; Comunicação **471 → 2**; topo do quadro **541 → 2** (as duas em Jaguariúna, a loja do Eduardo = painel de Jaguariúna). Função única = painel da rede. A cópia tem 2 dias, então a janela de 72 h deixa pouco; com o relógio na hora do dump (`p_agora` = 09/11 08h39): Mogi 74 (+1 candidato), Jaguariúna 16.
  - `tests/e2e/assistente-recorte.mts` **11/11**: rede, Jaguariúna, loja de outra empresa no corpo → 403, loja inválida → 400, CRM pela RLS, `leads_buscar` na rede traz as duas lojas, tela em Mogi só Mogi; vendedor de Mogi no ZapIntel → 403, troca de loja no corpo → 403, pede Jaguariúna no CRM → "fora do seu alcance".
  - `tests/e2e/assistente-isolamento.mts` **17/17**; as duas funções novas: `esperando_resposta` recusada (42501) para usuário e anon, `esperando_resposta_visiveis` recusada para anon e só com lojas da JM para o Eduardo.
  - `tests/e2e/assistente-5-perguntas.mts` com o modelo de verdade, tela em "toda a rede": as 5 do smoke + uma de contagem sem dado. Todas abrem com o recorte, **0 números sem fundamento, 0 correções**, 4–12 s; "esperando resposta" = 18 (16 Mogi + 2 Jaguariúna, igual ao painel); a sem dado ("telefone fixo no sábado") respondeu que não tem a ferramenta, sem número.
  - Unitários: `tests/assistente-numero-de-consulta.test.ts` 16 (contagem, falsos positivos, laço com cliente falso, fundamento, o caso 2.238, percentual por divisão).
- **Produção antes da migração (11/11 ~12h30):** os 5 corpos que a 0400 refaz (`zapintel_dashboard`, `_lista`, `zapintel_leads_lista`, `assistente_status_leads`, `quadro_contagens`) = md5 do repositório; `esperando_resposta*` não existem; última migração aplicada = `modelos_por_waba`.
- **Migração em produção:** `20261111000400_esperando_resposta` aplicada pelo MCP às ~13h43 (IOwait 0,16%), texto do arquivo da main. Conferido: `esperando_resposta` só `service_role`; `esperando_resposta_visiveis` `authenticated` + `service_role`, sem anon; as 3 do ZapIntel com `work_mem=16MB`. Na produção a função leva **20 ms** (tudo em cache, 10.309 páginas): 84 esperando (Mogi 59, Jaguariúna 25) e 5 à parte.
- **Deploy:** push da main `08e503c` READY 13h49 (`dpl_Cuct5yLVdZnPs99Si4ydp1FNGQQD`). **Falha de procedimento:** a leitura de IOwait de 20 s encadeada com o push voltou sem valor ("?" — os contadores do endpoint só andam a cada ~1 min) e o push saiu assim mesmo; as leituras válidas em volta: 0,16% (13h42) e 0,08% (13h46–13h47). Daqui em diante, leitura de 65 s separada do push.
- **Smoke ~13h50–13h55 (conta do Lucas, proprietário da JM, loja do CRM = Mogi Guaçu; aba isolada fechada no fim):**
  - painel do ZapIntel na rede **88** (Mogi 63 + Jaguariúna 25, +5 à parte); em Mogi **63** (+2);
  - Assistente pela rota: rede → abre com "**Rede JM · agora**" e diz **88**; Jaguariúna → "**Jaguariúna · agora**", **25**; loja de outra empresa no corpo → **403** "Essa loja está fora do seu alcance."; pelo widget, com a tela em Mogi → "**Mogi Guaçu · agora**", **63**; 0 correções;
  - Comunicação "aguardando" (Mogi): **63** conversas; topo do quadro (funil principal, Mogi): **63 esperando resposta**;
  - 0 `zapintel.tempo_esgotado` e 0 `calculo_cortado` desde 13h40.
- **Depois do deploy (pedido do Lucas): filtro "Aguardando há mais de 72 h" na Comunicação** (`?filtro=aguardando_72h`) — quem saiu da janela não some de vista. Mesma regra fora da janela: canais da loja juntos, envio que falhou não conta (a coluna `ultima_enviada_at` é gravada mesmo com falha; o app confere os envios dos contatos que têm envio falho); entra a conversa do canal em que o cliente falou por último, com "sem resposta há N d". Conta no app, sem migração: lê as conversas da sessão só com as colunas de data (até ~3,7 mil na rede, só ao abrir o filtro); se pesar, vira função no banco. O topo do quadro continua só com as 72 h. Teste da regra pura em `tests/inbox.test.ts`.
  - **Smoke em produção (11/11, ~14h10, app `93f190f`):** Comunicação de Mogi em "Aguardando há mais de 72 h" = **532** conversas, contadas página a página (14 páginas, nenhuma repetida); a mesma regra direto no banco = **532**. Bate.

## 44. 11/11: etiquetas no core (branch `feat/etiquetas`, migração `20261111000500_etiquetas`)

- **Pedido do Lucas (11/11):** etiquetas por empresa (nome e cor, sem nome repetido), várias por contato; dono/admin criam, renomeiam e apagam, vendedor aplica e tira; aplicar no card e em lote no quadro; selo no cartão do quadro e na lista da Comunicação; filtro contém / não contém no quadro, na Comunicação, na busca e na Transmissão; gatilho "recebeu etiqueta" no Automatize; histórico de quem aplicou/tirou no histórico do negócio. Resolve a pendência da seção 42 (a Transmissão saiu sem filtro de etiqueta porque o CRM não tinha etiqueta).
- **Desenho:** a etiqueta é da empresa (`etiquetas`: nome único sem caixa nem espaço nas pontas — índice `lower(btrim(nome))`; cor `cinza|azul|verde|ambar|vermelho`, as 5 da paleta Precisão); o contato guarda as suas em `contatos.etiqueta_ids bigint[]` (índice GIN). Uma fonte só, lida igual pelas quatro telas: "contém" = `&&` (tem ALGUMA das escolhidas), "não contém" = `not &&` (não tem NENHUMA). Sem tabela de ligação de propósito: a fusão de contatos remapeia toda FK para `contatos` pelo catálogo, e a lista no contato não precisa de remapeamento (a fusão soma as listas).
- **Quem pode:** RLS de `etiquetas` — todos da empresa leem, só `is_empresa_admin` escreve. Aplicar/tirar = alterar o contato (RLS de `contatos`: o vendedor alcança os da loja dele). `etiquetas_aplicar(negócios[], etiqueta, aplicar)` é invoker: a RLS de `negocios` decide o que a pessoa alcança; devolve os negócios cujo contato mudou (para o Automatize) e quantos ela alcançou.
- **Gatilhos (só disparam quando `etiqueta_ids` muda — cláusula WHEN; o webhook que cria/atualiza contato não paga nada):** validar (só etiqueta da própria empresa, sem repetição, em ordem — vale para update direto também) e histórico (`negocio_historico` `etiqueta_aplicada`/`etiqueta_tirada`, `detalhe` com id, nome e cor do momento e o motivo quando não foi à mão: "etiqueta apagada", "fusão de contatos"; nos negócios ativos do contato, ou no mais recente). Apagar a etiqueta tira dela de todos os contatos (com histórico) e apaga as automações dela (FK em cascata).
- **Automatize:** `automacoes.gatilho` ganha `recebeu_etiqueta` + `etiqueta_id`. A rota de aplicar chama `executarRecebeuEtiqueta` para os negócios que mudaram: mesma fila (`automacao_execucoes`) e mesmas travas (horário, teto 50/h, 7 dias por modelo, opt-out, bloqueado, modelo aprovado na loja, "pausar todas"). Já tinha a etiqueta: não dispara. Etiqueta saiu antes da espera: o cron pula ("a etiqueta saiu do contato").
- **Quadro:** `quadro_leads`/`quadro_pagina`/`quadro_contagens` com `p_etiquetas_com`/`p_etiquetas_sem` (padrão nulo; DROP + CREATE — assinatura nova); o cartão recebe `etiqueta_ids`. O app só manda os parâmetros com filtro ligado. Custo no local (dono, Mogi): página 120–145 ms com ou sem filtro; contagens 390–450 ms.
- **Telas:** Configurações → Etiquetas (dono/admin); card do lead (painel Etiquetas + "Histórico do negócio" com todas as ações: etapa, responsável, etiqueta, reabertura, transmissão); quadro (botão Etiquetas, selo no cartão, "Selecionar" → Etiquetar / Tirar etiqueta); Comunicação (`?et=`/`?etn=`, selo na lista); busca ⌘K (linha de selos; só com etiqueta, sem texto, lista os leads dela); Transmissão (`etiquetas_com`/`etiquetas_sem` no filtro e na descrição); Automatize (faixa "Quando recebe etiqueta").
- **Na mesma migração:** drop da `assistente_status_conversas` (lista de morte do 05). Conferido em 11/11 14h26: 0 leitores no código; nenhuma função, view ou job do cron a cita; 0 chamadas no pg_stat_statements desde o restart de 10/11 16h33 (foto `tools/saude/fotos/pgss-20261111-1426.json`). E `core_fundir_contatos` soma as etiquetas dos dois contatos.
- **Produção antes (11/11 ~16h):** md5(prosrc) de `quadro_leads`, `quadro_pagina`, `quadro_contagens`, `transmissao_publico` = repositório (LF) e `core_fundir_contatos` = repositório (CRLF, como foi aplicada em 20/10).
- **Provas no local (cópia de 09/11 + 0400):** migração ida → volta → ida limpas; tipos regenerados do banco local (o `types/database.gerado.ts` da produção estava atrasado: faltavam `negocio_historico.detalhe` e as funções do Assistente); tsc, lint (teto de avisos), 370 unitários (`tests/etiquetas.test.ts` novo); `tests/e2e/etiquetas-e2e.mjs` **57/57** (dono; vendedor de Mogi e de Jaguariúna — o de Jaguariúna está INATIVO na cópia e o teste o ativa só durante a rodada): nome repetido e cor fora da paleta recusados no banco, vendedor 403 e RLS 0 linhas; card e lote pela tela com selo e histórico; vendedor de uma loja não alcança o lead da outra; filtro no quadro (= SQL), na Comunicação (inclusive com "aguardando"), na busca e na Transmissão; automação na hora + agendada, sem disparo repetido, pulada quando a etiqueta sai, nada com "pausar todas"; renomear guarda o nome do momento no histórico; etiqueta de outra empresa recusada; fusão soma; apagar limpa contatos e automações; vendedor não abre Configurações → Etiquetas.
- **Volta:** app antes (revert), depois `supabase/scripts/volta/volta-etiquetas.sql` (apaga etiquetas aplicadas; o histórico fica; recria a `assistente_status_conversas`).
- **Migração em produção:** `20261111000500_etiquetas` aplicada pelo MCP às **17h20** de 11/11 (IOwait 0,05% na leitura de 65 s das 17h19), texto do arquivo da main (`16379e5`), sem `\r`. Conferido: os 9 corpos (`quadro_leads`, `quadro_pagina`, `quadro_contagens`, `transmissao_publico`, `core_fundir_contatos`, `etiquetas_aplicar` e os 3 gatilhos) = md5 do banco local; `etiquetas_aplicar` e as 3 do quadro com EXECUTE só para `authenticated`/`service_role` (sem `anon`); `transmissao_publico` só `service_role`; `etiquetas` com RLS e as 2 políticas; os 4 gatilhos; `assistente_status_conversas` não existe. O quadro do app antigo seguiu respondendo (dono, Mogi: 455 cartões, 2.259 no total; "não contém" de etiqueta inexistente = 2.259).
- **Deploy:** push da main `fea2018` às 17h23 (IOwait 0,13% às 17h23), READY (`dpl_H6VxVfyySVU16cdPxjsdSCESWord`).
- **Vendedor de Jaguariúna (pedido do Lucas: vendedor ativo de produção, sem ativar inativo):** a Vanessa (ativa em Jaguariúna). Como o Claude não entra com senha de ninguém, conferido pelo banco na SESSÃO dela (`request.jwt.claims` com o `sub` dela, papel `authenticated`), numa transação desfeita no fim: sessão = empresa 1, lojas {6}; aplicou no lead #7386 de Jaguariúna (alcançou 1, contato mudou, histórico "etiqueta_aplicada por" ela); no lead de Mogi alcançou 0; criar etiqueta barrado pela RLS; renomear = 0 linhas. Depois do rollback: 0 etiquetas, 0 histórico, contato intacto. (A Rayssa, vendedora de teste do e2e, está inativa também em produção.)
- **Smoke com o Lucas (~17h28–17h35, conta dele, proprietário da JM, loja Mogi; aba fechada no fim):** criou "TESTE smoke etiqueta" (verde) em Configurações → Etiquetas; aplicou no card do próprio lead (#3598) — selo no painel e "Etiqueta aplicada: TESTE smoke etiqueta · JM Store · 11/11, 17:30" no histórico do negócio (a etiqueta é do contato: o #3548 de Jaguariúna, mesmo contato, ganhou a mesma linha); lote no quadro com 2 leads de TESTE criados para isso (#7390, #7391) — "2 contatos mudaram" e o selo nos cartões; filtro do quadro no funil principal: contém = os 2 de teste ("2 em aberto"; o #3598 está no funil Time JM), não contém = 2.259 (2.261 − 2); Comunicação: contém = as 2 conversas do Lucas em Mogi (222 e 923 — no banco, as 3 do contato: 222 e 923 em Mogi, 2055 em Jaguariúna), com o selo na lista; não contém = 40 na 1ª página, sem as dele. Apagar pela tela: a etiqueta saiu dos 4 negócios com "tirada (etiqueta apagada)" no histórico. Limpeza: leads e contatos de teste apagados, as 4 linhas de histórico do teste nos negócios do Lucas apagadas; 0 etiquetas, 0 histórico de etiqueta, nenhuma execução de automação; sem impersonação.
- **Achado no smoke, corrigido em seguida (`components/modules/leads/etiquetas-panel.tsx`):** o "Histórico do negócio" dizia "Responsável alterado → o sistema" quando o lead voltava para a esteira (responsável nulo). Agora diz "→ esteira (sem dono)"; "o sistema" fica só para quem fez a ação sem usuário.
- **Próxima migração livre:** 20261111000600.

## 45. 12/11: módulo Públicos (branch `feat/publicos`, migração `20261111000600_publicos` — NÃO aplicada)

- **Pedido do Lucas (12/11):** listas salvas por regra, que se atualizam sozinhas, usando os filtros da Transmissão e as etiquetas, para a Transmissão e o Automatize. Aprovado com as recomendações: **público por loja**; no Automatize **só "entrou no público"** (sem "saiu"). Três detalhes dele: (1) Públicos não depende de outro módulo, mas o "usar público salvo" da Transmissão e o gatilho do Automatize só existem com Públicos ligado; (2) a contagem diz de quando é ("atualizado há X min") e editar o filtro reconta na hora, sem disparar o gatilho para quem já estava e passou a valer pela regra nova; (3) a rodada de hora em hora reconta só os públicos com gatilho ligado ou transmissão agendada.
- **Desenho:** módulo `publicos` (manifesto, grupo Comunicação, sem `requer`; menu opcional; vitrine; trava no servidor por `exigirModuloLigado` e, para o opcional dentro de outro módulo e para o cron, `moduloEstaLigado`). Tabelas `publicos` (loja, nome único na loja, filtro, `total`, `calculado_em`; a loja lê, dono/admin grava — a RLS da Transmissão) e `publicos_membros` (quem está e desde quando; só a chave de serviço). Manual = público "com etiqueta X".
- **Uma regra só:** `publicos_resolver` é o filtro resolvido, e `transmissao_publico` passou a chamá-la. **Mudança de comportamento na Transmissão (proposta e aprovada junto):** negócio inativo (`negocios.ativo = false`, 158 em produção em 12/11) não entra mais na lista.
- **A conta:** `publicos_recalcular(público, disparar)` refaz membros e total (FOR UPDATE no público: duas contas não se atropelam). Sem disparo = ponto de partida: criar, editar o filtro e ligar o PRIMEIRO gatilho do público. Com disparo = devolve quem entrou desde a última conta: a rodada de hora em hora (job `automacoes-hora`, sem job novo; antes da fila do Automatize, para que quem entrou rode na mesma rodada) e o botão "Atualizar" da tela.
- **Automatize:** `automacoes.gatilho` ganha `entrou_no_publico` + `publico_id` (FK em cascata, como a etiqueta: apagar o público apaga as automações dele — a tela diz quantas). Quem entrou ganha uma execução agendada por automação ligada (em lote, mesma fila e mesmas travas); entrar de novo substitui a que esperava. Na execução: módulo desligado = pulada ("módulo Públicos desligado"); saiu do público antes da espera = pulada ("saiu do público").
- **Transmissão:** "Usar público salvo" (só públicos da loja escolhida); a transmissão grava `publico_id` e uma cópia do filtro. Disparar agora usa a regra do público naquele momento; **agendada** refaz a lista pelo público na hora de começar (`transmissao_remontar`, ainda 'agendada', sem nada enviado; com o módulo desligado vale a lista do agendamento). Apagar público com transmissão agendada é recusado.
- **Tela `/publicos`:** lista com loja, regra em português, total e "atualizado agora / há X min / h / dias", "· de hora em hora" quando tem gatilho ou agendada; dono/admin criam, editam (prévia da contagem ao lado), atualizam e apagam; o vendedor vê os da loja dele. O filtro ("Quem entra") é o mesmo componente da Transmissão (`components/modules/publicos/filtro-campos.tsx`, saído da tela da Transmissão sem mudar o que aparece).
- **Provas no local (cópia de 09/11 + 0400 + 0500):** migração ida → volta → ida limpas (depois da volta, `transmissao_publico` = corpo da 0500, nada de `publicos*`, gatilhos de volta aos 3); tipos regenerados do banco local (só o que é de Públicos); `npm run check` inteiro verde (núcleo, avisos 40/40, views, segmento, módulos 27, gravação, datas, tsc, deno); **372** unitários (`tests/publicos.test.ts` novo); verificador **631 ok / 5** (as 5 antigas do ZapIntel; 10 travas novas de Públicos); `tests/e2e/publicos-e2e.mjs` **56/56** e `tests/e2e/etiquetas-e2e.mjs` **57/57** (regressão do filtro da Transmissão).
- **O que o e2e cobre:** módulo desligado (API 403, Transmissão e Automatize sem o opcional, gatilho recusado); prévia e criar com conta na hora (negócio inativo e outra loja fora); nome repetido; dono com a loja Mogi escolhida não cria em Jaguariúna (rede inteira, cria); vendedor não cria e só vê os da loja dele; sessão não lê membros nem chama a conta; "entrou no público" pela rodada (só quem entrou dispara, a tarefa sai na mesma rodada, não repete); rodada não reconta público sem gatilho; editar o filtro reconta sem disparar; "Atualizar" dispara para quem entrou; espera + saiu = pulada; módulo desligado não reconta e pula o que estava na fila; religar o gatilho = ponto de partida; transmissão agendada refeita pelo público; apagar recusado com agendada e levando as automações; telas do dono e do vendedor; "Usar público salvo" na Transmissão.
- **Volta:** app antes (revert), depois `supabase/scripts/volta/volta-publicos.sql`.
- **Próxima migração livre:** 20261111000700.

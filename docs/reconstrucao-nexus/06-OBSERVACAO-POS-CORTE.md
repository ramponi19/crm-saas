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

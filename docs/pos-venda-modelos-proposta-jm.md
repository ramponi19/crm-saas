# Proposta de modelos da Meta — régua de iPhone da JM (24/11/2026)

Só texto, para o Lucas revisar. **Nada foi enviado à Meta.** Os modelos são dado da JM, e não código do Nexus.

## Antes de criar: regras da Meta que pesam aqui

- **Variáveis:** são numeradas, `{{1}}` e `{{2}}`, e cada uma precisa de um exemplo. Variável não pode abrir nem fechar o texto.
- **Variáveis nesta proposta:** `{{1}}` = primeiro nome do cliente e `{{2}}` = produto comprado.
- **Hoje no Nexus:** quem envia preenche as variáveis à mão. Preencher `{{1}}` e `{{2}}` sozinho, pelo passo, é um ajuste pequeno que pode entrar no bloco 4.
- **Utilidade:** mensagem ligada a uma compra que o cliente fez, sem oferta. Exemplos: confirmação, entrega, cuidado com o produto, pesquisa sobre aquela compra.
  - Se o texto tiver oferta, desconto, "aproveite" ou convite para comprar, a Meta reclassifica como Marketing, ou recusa.
- **Marketing:** oferta, novidade, troca, reativação.
  - Custa mais por conversa.
  - Só pode ir para quem aceitou receber.
  - O cliente pode bloquear o envio.
  - Por isso a JM liberou Marketing só para os passos de oferta.
- **Botões de resposta rápida:** no máximo 10 por modelo.
  - Não cabem os 11 botões de uma nota de 0 a 10. Por isso, no D+7 o texto pede a nota como número, e os botões são atalhos.
- **Onde criar os modelos com botão:**
  - A tela do Nexus (Automações › Modelos) cria só o texto, sem botões.
  - Os modelos com botões se criam no Gerenciador do WhatsApp da Meta, nas duas contas: a de Importados e a de Jaguariúna. Cada loja tem a sua conta, e o modelo precisa estar aprovado nas duas.
  - Depois, "Sincronizar" em Automações › Modelos traz os modelos para o Nexus, e eles aparecem no passo da régua.

## Os cinco modelos

### D+1 — entrega (`jm_pos_entrega`)
**Categoria esperada: Utilidade.** É acompanhamento da compra que o cliente acabou de fazer.

> Oi, {{1}}! Aqui é da JM Store. Seu {{2}} chegou certinho? Se precisar de ajuda para configurar ou passar os dados do aparelho antigo, é só responder esta mensagem.

Botões: **"Chegou tudo certo"** · **"Preciso de ajuda"**

### D+7 — experiência com nota (`jm_pos_experiencia`)
**Categoria esperada: Utilidade.** É uma pesquisa sobre a compra específica, sem oferta.
- Há risco de a Meta classificar como Marketing. Se isso acontecer, a JM já liberou Marketing, e o passo continua funcionando.

> Oi, {{1}}! Já faz uma semana com o seu {{2}}. De 0 a 10, quanto você recomendaria a JM Store para um amigo? Responda só com o número.

Botões (atalhos por faixa, para quem não quer digitar): **"9 ou 10"** · **"7 ou 8"** · **"0 a 6"**
- No Nexus, a nota é registrada na fila ("Registrar nota").
- O botão por faixa não dá a nota exata. Quem tocar "0 a 6" deve ser procurado; é aí que nasce o chamado.

### D+30 — acessórios (`jm_pos_acessorios`)
**Categoria esperada: Marketing.** Sugere uma compra nova.

> Oi, {{1}}! Um mês com o {{2}}. Para proteger o aparelho, temos capas, películas e carregadores originais na JM Store. Quer ver as opções?

Botões: **"Quero ver"** · **"Agora não"**
- Sem preço e sem prazo no texto ("só hoje", "últimas unidades"): a Meta costuma barrar urgência e promessa.

### D+90 — bateria, só seminovo (`jm_pos_bateria`)
**Categoria esperada: Utilidade**, desde que fique como cuidado com o aparelho comprado, sem venda.

> Oi, {{1}}! Passando para saber da bateria do seu {{2}}. Em Ajustes › Bateria › Saúde da bateria você vê a capacidade atual. Se notar algo diferente, responda esta mensagem que a gente orienta.

Botões: **"Está tudo bem"** · **"Quero orientação"**
- Se o texto oferecer troca de bateria paga, ele vira Marketing. A oferta fica para a conversa, depois que o cliente responder.

### D+330 — troca (`jm_pos_troca`)
**Categoria esperada: Marketing.** É um convite para comprar de novo, usando o aparelho atual na troca.

> Oi, {{1}}! Já faz quase um ano com o seu {{2}}. Se pensa em trocar de aparelho, a JM Store avalia o seu atual como parte do pagamento. Quer saber quanto ele vale?

Botões: **"Quero avaliar meu aparelho"** · **"Agora não"**
- Sem valor prometido ("pagamos até R$ X"): a avaliação depende do aparelho, e prometer valor costuma ser motivo de recusa.

## Como fica na régua (Configurações › Pós-venda)

| Passo | Roteiro (janela aberta) | Modelo (janela fechada) | Categoria |
|---|---|---|---|
| D+1 entrega | o texto acima, sem os botões | `jm_pos_entrega` | Utilidade |
| D+7 experiência | o texto acima | `jm_pos_experiencia` | Utilidade (Marketing se a Meta reclassificar) |
| D+30 acessórios | o texto acima | `jm_pos_acessorios` | Marketing |
| D+90 bateria (seminovo) | o texto acima | `jm_pos_bateria` | Utilidade |
| D+330 troca | o texto acima | `jm_pos_troca` | Marketing |

A JM precisa estar com Utilidade **e** Marketing liberados (Parâmetros) para escolher os modelos do D+30 e do D+330.

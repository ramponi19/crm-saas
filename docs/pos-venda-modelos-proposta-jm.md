# Proposta de modelos da Meta — régua de iPhone da JM (24/11/2026, revisão 2)

Só texto, para o Lucas revisar. **Nada foi enviado à Meta.** Os modelos são dado da JM, e não código do Nexus.

**Nome da loja nos textos: "JM Store".** É o nome do perfil do WhatsApp dos dois números da JM, gravado na conexão de cada um:
Importados (+55 19 99886-2028) e Jaguariúna (+55 19 98944-7419). O cliente vê "JM Store" no topo da conversa, e o texto fala igual.

Revisão 2 (Lucas, 24/11): D+1 serve balcão e entrega; D+30 sem "originais"; D+90 sem o nome exato do menu do iOS;
D+30 e D+330 com o botão "Não quero receber ofertas" (o que o sistema faz: seção no fim).

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

### D+1 — tudo certo com a compra (`jm_pos_entrega`)
**Categoria esperada: Utilidade.** É acompanhamento da compra que o cliente acabou de fazer, no balcão ou com entrega.

> Oi, {{1}}! Aqui é da JM Store. Está tudo certo com o seu {{2}}? Se precisar de ajuda para configurar ou passar os dados do aparelho antigo, é só responder esta mensagem.

Botões: **"Está tudo certo"** · **"Preciso de ajuda"**

### D+7 — experiência com nota (`jm_pos_experiencia`)
**Categoria esperada: Utilidade.** É uma pesquisa sobre a compra específica, sem oferta.
- Há risco de a Meta classificar como Marketing. Se isso acontecer, a JM já liberou Marketing, e o passo continua funcionando.

> Oi, {{1}}! Já faz uma semana com o seu {{2}}. De 0 a 10, quanto você recomendaria a JM Store para um amigo? Responda só com o número.

Botões (atalhos por faixa, para quem não quer digitar): **"9 ou 10"** · **"7 ou 8"** · **"0 a 6"**
- No Nexus, a nota é registrada na fila ("Registrar nota").
- O botão por faixa não dá a nota exata. Quem tocar "0 a 6" deve ser procurado; é aí que nasce o chamado.

### D+30 — acessórios (`jm_pos_acessorios`)
**Categoria esperada: Marketing.** Sugere uma compra nova.

> Oi, {{1}}! Um mês com o {{2}}. Para proteger o aparelho, temos capas, películas e carregadores na JM Store. Quer ver as opções?

Botões: **"Quero ver"** · **"Agora não"** · **"Não quero receber ofertas"**
- Sem preço e sem prazo no texto ("só hoje", "últimas unidades"): a Meta costuma barrar urgência e promessa.

### D+90 — bateria, só seminovo (`jm_pos_bateria`)
**Categoria esperada: Utilidade**, desde que fique como cuidado com o aparelho comprado, sem venda.

> Oi, {{1}}! Passando para saber da bateria do seu {{2}}. Em Ajustes › Bateria você vê a saúde da bateria. Se notar algo diferente, responda esta mensagem que a gente orienta.

Botões: **"Está tudo bem"** · **"Quero orientação"**
- Se o texto oferecer troca de bateria paga, ele vira Marketing. A oferta fica para a conversa, depois que o cliente responder.

### D+330 — troca (`jm_pos_troca`)
**Categoria esperada: Marketing.** É um convite para comprar de novo, usando o aparelho atual na troca.

> Oi, {{1}}! Já faz quase um ano com o seu {{2}}. Se pensa em trocar de aparelho, a JM Store avalia o seu atual como parte do pagamento. Quer saber quanto ele vale?

Botões: **"Quero avaliar meu aparelho"** · **"Agora não"** · **"Não quero receber ofertas"**
- Sem valor prometido ("pagamos até R$ X"): a avaliação depende do aparelho, e prometer valor costuma ser motivo de recusa.

## Como fica na régua (Configurações › Pós-venda)

| Passo | Roteiro (janela aberta) | Modelo (janela fechada) | Categoria |
|---|---|---|---|
| D+1 tudo certo | o texto acima, sem os botões | `jm_pos_entrega` | Utilidade |
| D+7 experiência | o texto acima | `jm_pos_experiencia` | Utilidade (Marketing se a Meta reclassificar) |
| D+30 acessórios | o texto acima | `jm_pos_acessorios` | Marketing |
| D+90 bateria (seminovo) | o texto acima | `jm_pos_bateria` | Utilidade |
| D+330 troca | o texto acima | `jm_pos_troca` | Marketing |

A JM precisa estar com Utilidade **e** Marketing liberados (Parâmetros) para escolher os modelos do D+30 e do D+330.

## Botão "Não quero receber ofertas" (D+30 e D+330): o que o sistema faz

Proposta; nada implementado ainda.

**Por que uma marca nova, e não o opt-out que já existe.** O `contatos.opt_out_em` de hoje desliga **tudo** o que sai
sozinho para o contato: Automatize, Transmissão e modelos. Quem toca "Não quero receber ofertas" ainda quer saber da
entrega, da bateria e da garantia. Por isso a marca é estreita: **sem ofertas** (`contatos.sem_ofertas_em`).

1. **Quando o cliente toca o botão.**
   - A resposta chega como mensagem do cliente, com o texto e o identificador do botão.
   - A Edge reconhece o botão e grava `sem_ofertas_em` no contato.
   - Grava também nos outros contatos da mesma empresa com o mesmo telefone (o cliente das duas lojas é o mesmo; a ficha já soma pelo telefone).
   - No histórico do contato fica "pediu para não receber ofertas em dd/mm, pelo botão do modelo X".
2. **Resposta ao cliente.** A janela de 24 h acabou de abrir com o toque. Sai uma confirmação curta, como mensagem
   normal: "Pronto, {{1}}: você não vai mais receber ofertas da JM Store. Avisos sobre a sua compra continuam chegando."
   - Decisão sua: automática ou sugerida para o atendente enviar.
3. **No pós-venda.**
   - Os passos pendentes cujo modelo é de Marketing ficam "pulados", com o motivo "cliente não quer ofertas". Vale para a jornada atual e para as próximas (D+30 e D+330 deixam de nascer).
   - Os passos de Utilidade (D+1, D+7, D+90) continuam.
4. **No resto do Nexus.**
   - Transmissão e Automatize pulam o contato quando o modelo é de Marketing, com o motivo registrado.
   - Mensagem digitada pelo atendente, com a janela aberta, continua possível: a marca vale para o que sai sozinho ou por modelo.
5. **Na tela.**
   - A ficha do cliente mostra o selo "Sem ofertas desde dd/mm".
   - Dono ou administrador pode desfazer, só a pedido do cliente, e o desfazer também fica no histórico.

Observação: a Meta também tem um botão próprio de "parar promoções" no editor de modelos de Marketing. Se a JM usar o da
Meta em vez do texto livre, o efeito no Nexus é o mesmo; muda só o identificador que a Edge reconhece.

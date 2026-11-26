# Conciliação de vendas antigas: plano curto (26/11/2026, sem código)

Pedido do Lucas em 26/11. A implementação será liberada depois. Decisões no §7 (26/11: D1, D4 e D5 aprovadas; D2 com os sócios; D3 com a loja).

## 1. Para que serve

Antes do hotfix de 24/11 (encomenda, entrega e pagamento conferidos), muitas vendas foram concluídas sem o pagamento completo registrado, e trocas foram aceitas sem que o aparelho chegasse. A loja confere à mão e precisa **lançar o que conferiu**, sem desfazer o hotfix:

- **Trocas aguardando chegada** (planilhas `conciliacao-pedidos/trocas-conferencia-20261125/`, conferência física de 25/11):
  - Mogi Guaçu: 12 trocas (R$ 21.401). São 12 vendas só com a troca como pagamento; falta lançar R$ 67.249.
  - Jaguariúna: 18 trocas (R$ 34.738). São 13 vendas; falta R$ 53.147.
  - A unidade 96 (MacBook, R$ 1) está com o "valor a confirmar".
- **Encomendas abertas antigas:** hoje são **7**, não 8. A 173 foi entregue em 25/11 com o pagamento.
  - Sem pagamento nenhum: 31, 37, 43, 54 (Mogi) e 92 (Jaguariúna).
  - Com sinal: 121 (R$ 2.000 de R$ 5.795) e 122 (R$ 500 de R$ 2.795), as duas de Jaguariúna.
  - A 37 (R$ 7,60) parece teste e vai para cancelamento.

## 2. O que a tela faz (só Dono)

`Vendas → Conciliação`. Só o cargo Dono, conferido no servidor (`sessao_e_dono()`). Não aparece para Administrador nem para a plataforma sem impersonação.

| Ação | O que grava | O que NÃO muda |
|---|---|---|
| **Registrar pagamento antigo** em venda concluída | uma linha em `vendas_pagamentos` com **data real** (coluna nova `data_pagamento`), forma, valor e `conciliacao_id` | valor, custo, desconto e situação da venda (H2 continua valendo) |
| **Troca recebida** | unidade `pendente` → `disponivel`, `recebido_em` = data real informada, `recebido_por` = quem lançou | a venda de origem e o valor oferecido |
| **Troca revendida** (para quem, quando, por quanto) | unidade → `vendido`, com o registro da revenda (cliente, data e valor). Se a revenda virar venda no sistema, ela fica ligada (§7, D2) | a venda de origem |
| **Cliente não trouxe** | unidade → `nao_recebida`, e nasce um **valor a cobrar** = valor oferecido, preso à venda e ao cliente | o pagamento "troca" da venda continua no histórico; o valor a cobrar é que mostra a falta |
| **Cancelar encomenda antiga** (ex.: 37) | situação `cancelada`, com **motivo obrigatório** | nenhum pagamento é inventado; a encomenda com sinal não cancela sem decidir o sinal (devolver ou reter, §7, D3) |

Toda ação:
- é um **"lançamento de conciliação"** em `vendas_conciliacao` (id, empresa, loja, venda, unidade, tipo, data original, valor, forma, detalhes, quem lançou, quando);
- vai para a **Auditoria** (`auditar_emp`, entidade `conciliacao`), com quem lançou e a data original;
- é idempotente por item (não deixa lançar duas vezes a mesma troca como recebida, nem pagar acima do que falta sem confirmar);
- tem desfazer só por novo lançamento de estorno, nunca apagando.

**Lista de pendências por loja, com totais:**
- vendas concluídas com pagamento abaixo do valor (falta R$);
- trocas aguardando chegada (quantidade, R$ oferecido e dias parada);
- valores a cobrar de "cliente não trouxe";
- encomendas abertas há mais de 30 dias.

Filtro por loja e exportação da lista para quem tem `core.exportar`.

## 3. A única exceção controlada à trava do H2

- **Hoje:** o H2 (`vendas_valor_guarda`) congela valor, custo e desconto da venda concluída. Mas o banco **não impede** inserir pagamento em venda concluída por rota com chave de serviço.
- **Proposta:** a entrega fecha essa porta e abre uma só exceção.
  - Gatilho novo em `vendas_pagamentos`: em venda `concluida`, inserir, alterar ou apagar pagamento é recusado (`VENDA_CONCLUIDA_PAGAMENTO`). As únicas exceções são as funções da conciliação, que marcam `nexus.conciliacao` dentro da transação, além de devolução e cancelamento, quando existirem.
  - As funções: `conciliacao_pagamento`, `conciliacao_troca`, `conciliacao_cancelar_encomenda` e `conciliacao_estornar`. Todas são `SECURITY DEFINER` e exigem `sessao_e_dono()`.
  - O valor da venda **nunca** passa pela exceção: `nexus.venda_valor_ajuste` continua sendo só de script de operação.
- **Teste:** a mesma escrita por rota com chave de serviço, sem a marca, é recusada. Pela conciliação, passa e fica na Auditoria.

## 4. Banco (migrações compatíveis com o app no ar)

1. `vendas_pagamentos.data_pagamento date`.
   - Nulo nas linhas de hoje: vale o `created_at`, então os relatórios leem `coalesce(data_pagamento, created_at::date)`.
   - Também a coluna `conciliacao_id bigint` (FK).
2. `vendas_conciliacao`, com RLS de leitura para Dono e escrita só pelas funções. A tabela tem o gatilho da plataforma (`zz_plataforma_auditar`).
3. `estoque_unidades.status` ganha `nao_recebida`. Valores a cobrar ficam em `vendas_conciliacao` (tipo `a_cobrar`, com situação aberto ou recebido) até existir Contas a Receber.
4. O gatilho de pagamento em venda concluída (§3).

## 5. App

- **A tela:** `app/(dashboard)/vendas/conciliacao`, com a lista por loja e os totais, e um painel por venda com o histórico de pagamentos e da troca.
- **Os formulários:** cada ação tem o seu, com data real obrigatória, e cada um chama a sua função. Nada grava direto na tabela.
- **Importar a conferência das planilhas:**
  - a pessoa marca, na lista, o que a planilha diz (está na loja, já revendido, cliente não trouxe), uma linha por troca;
  - a planilha não é lida automaticamente: ela é a folha de conferência, e a tela é onde se lança.
- **Relatórios e painel:** o livro-caixa passa a usar a data real do pagamento. Lançamento de conciliação aparece com selo "conciliação".

## 6. Testes e aceite

- **SQL:**
  - pagamento antigo não muda o valor da venda;
  - pagamento em venda concluída fora da conciliação é recusado, inclusive com chave de serviço;
  - troca recebida, revendida e "não trouxe" (vira a cobrar);
  - cancelar encomenda sem motivo é recusado;
  - Administrador e Vendedor recebem `SO_DONO`;
  - tudo aparece na Auditoria;
  - estorno compensa sem apagar.
- **Integração:** as rotas com sessão real de Dono, de Administrador e da plataforma, cada uma auditada.
- **Conferência visual:** lista, totais por loja, cada formulário e a Auditoria.
- **Aceite:**
  - a soma das pendências da tela bate com as planilhas de 25/11, por loja, antes de qualquer lançamento;
  - depois de lançar a conferência, os totais de vendas (quantidade, R$ e md5 da digital) ficam **iguais**: só mudam pagamentos, unidades e lançamentos.

## 7. Decisões (registradas em 26/11/2026; implementação ainda não liberada)

| | Pergunta | Situação |
|---|---|---|
| D1 | Pagamento antigo acima do que falta | **APROVADA** |
| D2 | Troca revendida fora do sistema | **PENDENTE dos sócios** (proposta alternativa abaixo) |
| D3 | Sinal das encomendas 121 e 122 | **PENDENTE da resposta da loja** |
| D4 | Valor a cobrar e comissão | **APROVADA** (estorno: sócios) |
| D5 | Período | **APROVADA** |

- **D1. Pagamento antigo acima do que falta: APROVADA (Lucas, 26/11).**
  - `conciliacao_pagamento` registra **só até o que falta** na venda.
  - O excedente vira um lançamento separado em `vendas_conciliacao`, tipo **`saldo_cliente`** ("saldo a favor do cliente"), preso à venda e ao cliente, com situação aberto ou devolvido/usado.
  - A tela avisa antes de gravar: "R$ X passam do que falta; vão como saldo a favor do cliente".
  - A venda nunca recebe mais do que vale, então os relatórios de recebido continuam batendo com as vendas.
- **D2. Troca revendida fora do sistema: PENDENTE (decisão dos sócios).**
  - **Recomendação original (só registrar):**
    - a revenda fica registrada em `vendas_conciliacao` (cliente, data e valor), e a unidade vai para `vendido`;
    - não nasce venda, e o faturamento de nenhum mês muda (o aceite "totais de vendas iguais, md5 igual" vale);
    - o dinheiro da revenda não aparece em nenhum relatório de vendas, só na tela da Conciliação.
  - **Proposta alternativa (Lucas, 26/11): "venda de conciliação".**
    - nasce uma venda com a **data real** da revenda, marcada `canal_venda = 'conciliacao'`;
    - ela entra no faturamento numa **linha separada "Conciliação"**, e fica **fora de metas, ranking e comissões**;
    - **impacto nos meses passados:** o faturamento dos meses das revendas (setembro a novembro de 2026) **sobe** pela linha "Conciliação". Painel, Relatórios, Visão geral e assistente passam a mostrar dois números: vendas do mês (como hoje) e "com conciliação". O CSV ganha a coluna do canal;
    - metas, ranking e comissão ficam **iguais** aos de hoje (filtram o canal);
    - o mês já fechado e conferido pelos sócios muda no total "com conciliação", o que exige o aviso "inclui lançamentos de conciliação de DD/MM";
    - o ZapIntel (ponte venda↔conversa) precisa ignorar esse canal, para não casar uma venda de balcão antigo com uma conversa;
    - o aceite muda: os totais **sem** o canal ficam iguais (md5 igual); **com** ele, sobem exatamente a soma das revendas lançadas.
  - **Comparação:**

| | Só registrar | Venda de conciliação |
|---|---|---|
| Faturamento dos meses passados | não muda | sobe na linha "Conciliação" |
| Metas, ranking, comissão | não mudam | não mudam (canal filtrado) |
| O dinheiro da revenda aparece em relatório | só na Conciliação | sim, separado |
| Trabalho a mais | nenhum | filtro do canal em painel, relatórios, metas, comissão, assistente e ZapIntel; selo "inclui conciliação" |
| Risco | a revenda some dos números da empresa | um filtro esquecido põe a revenda em meta ou comissão |

  - Decisão final: dos sócios. A implementação de D2 espera.
- **D3. Sinal das encomendas 121 (R$ 2.000) e 122 (R$ 500): PENDENTE da resposta da loja** (o cliente desistiu? o sinal foi devolvido?). Até lá, as duas não cancelam; a tela recusa cancelar encomenda com sinal sem a decisão do sinal.
- **D4. Valor a cobrar e comissão: APROVADA (Lucas, 26/11).** O valor a cobrar de "cliente não trouxe" **não gera comissão** enquanto não entrar. Quando a perda for definitiva, o estorno da comissão proporcional da venda original é decisão dos sócios (caso a caso ou por regra). Até essa regra existir, a tela só marca "perda definitiva", sem mexer em comissão.
- **D5. Período: APROVADA (Lucas, 26/11).** Período **fechado**: só vendas lançadas até o hotfix, **24/11/2026 22:17 UTC**. A trava de pagamento em venda concluída (§3) continua valendo para tudo depois disso. A tela não aceita venda posterior; o caminho normal (pagamento antes de entregar) é o do hotfix.

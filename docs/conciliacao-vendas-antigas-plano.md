# Conciliação de vendas antigas: plano curto (26/11/2026, sem código)

Pedido do Lucas em 26/11. A implementação será liberada depois. Decisões em aberto no §7.

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

## 7. Decisões em aberto (do Lucas e dos sócios)

- **D1.** Pagamento antigo acima do que falta (ex.: troca valia mais): recusar ou registrar com aviso?
- **D2.** Troca revendida fora do sistema: só registrar a revenda (proposta), ou criar a venda da revenda com data antiga, o que mexe no faturamento do mês dela?
- **D3.** Encomenda com sinal (121 e 122) cancelada: o sinal é devolvido (lançamento de saída) ou retido (receita)?
- **D4.** "Cliente não trouxe": o valor a cobrar entra na comissão do vendedor? Hoje a comissão olha a venda concluída.
- **D5.** Período: só vendas anteriores ao hotfix (lançadas até 24/11/2026 22:17 UTC), ou qualquer venda concluída com falta de pagamento?

# Reconciliação: encomendas entregues × pagamentos registrados

**Data:** 19/11/2026 · **Empresa:** JM Store (empresa 1) · **Tipo:** só leitura. Consultas `SELECT` na produção; nenhum dado foi gravado, alterado ou apagado.
**Lista completa:** [reconciliacao-encomendas.csv](reconciliacao-encomendas.csv) (92 linhas, da mais recente para a mais antiga; separador `;`, decimal com vírgula, abre direto no Excel).

> ⚠️ O CSV tem **nome e telefone de clientes**. Ele **não foi commitado** e não deveria ir para o git. Fica só na sua máquina, para a loja conferir.

> "Pagamento não registrado" **não significa** "dinheiro não recebido". Quase certamente a loja recebeu (Pix, cartão na maquininha, dinheiro); o que falta é o registro no sistema. Por isso nada aqui foi lançado automaticamente.

## Resumo

**92 encomendas concluídas** em que a soma dos pagamentos registrados é diferente do valor da venda:

| | Encomendas | Vendido | Pago registrado | Diferença |
|---|---:|---:|---:|---:|
| **Sem pagamento nenhum** | 64 | R$ 474.964,00 | R$ 0,00 | R$ 474.964,00 |
| **Pagamento parcial** | 27 | R$ 183.637,00 | R$ 61.893,50 | R$ 121.743,50 |
| Pago a mais | 1 | R$ 7.795,00 | R$ 7.797,00 | −R$ 2,00 |
| **Total** | **92** | **R$ 666.396,00** | **R$ 69.690,50** | **R$ 596.705,50** |

### Por mês (mês da entrega)

| Mês | Sem pagamento: qtd | Sem pagamento: valor | Parcial: qtd | Parcial: vendido | Parcial: pago | Parcial: diferença |
|---|---:|---:|---:|---:|---:|---:|
| nov/2026 (até dia 19) | 17 | R$ 123.488,00 | 12 | R$ 66.595,00 | R$ 24.350,00 | R$ 42.245,00 |
| out/2026 | 26 | R$ 183.881,00 | 10 | R$ 78.372,00 | R$ 22.899,00 | R$ 55.473,00 |
| set/2026 | 20 | R$ 162.300,00 | 5 | R$ 38.670,00 | R$ 14.644,50 | R$ 24.025,50 |
| ago/2026 | 1 | R$ 5.295,00 | — | — | — | — |
| **Total** | **64** | **R$ 474.964,00** | **27** | **R$ 183.637,00** | **R$ 61.893,50** | **R$ 121.743,50** |

O "pago a mais" é de setembro: venda 85, R$ 7.795,00 com três Pix somando R$ 7.797,00 (dois de R$ 2,00 lançados um minuto depois, provavelmente teste ou digitação).

## O que os dados mostram

1. **A encomenda virou o livro de vendas da loja.** 85 das 92 foram concluídas **em até 15 minutos depois de lançadas**, muitas no mesmo minuto. Nenhuma tem peça do estoque ligada (sem IMEI/série em nenhuma). O uso real é este: lançar a venda como encomenda e "Finalizar" na hora.
2. **Quase todas foram concluídas pelo Histórico.** O "Entregar" da aba Encomenda só aparece depois de "Chegou" e sempre gravava o saldo. O "Finalizar" do Histórico concluía sem pedir pagamento. **Nenhuma** das 92 tem pagamento gravado no momento da entrega.
3. **No pagamento parcial, o que ficou registrado foi quase sempre o aparelho de entrada.** 19 dos 27 têm só `troca` (o usado dado como entrada) e 8 têm só um Pix de sinal. A parte em dinheiro/cartão da diferença nunca entrou.
4. **O buraco não fechou com a correção de 15/09.** 81 das 92 são posteriores a 15/09 (quando a aba Encomenda passou a gravar o saldo), porque o Histórico seguiu sem gravar. Em novembro foram 29.
5. **Datas estranhas em 4 vendas** (124, 120, 118, 115): a data de entrega é *anterior* ao lançamento (ex.: 120 lançada 20/10 10:09, "entregue" 19/10 20:07). Provável edição da data ou relógio. Vale a loja olhar ao conferir.

## Como cada coluna foi obtida

| Coluna | De onde vem |
|---|---|
| `venda_ids` | `vendas_vendas.id` do fechamento. Uma encomenda com 2 itens vira 2 ids no mesmo grupo (ex.: "82 83"). Encomenda anterior a 16/09 não tem grupo: a venda sozinha é o fechamento. |
| `lancada_em` | `created_at` da primeira venda do fechamento (horário de Brasília). |
| `entregue_em` | `data_venda` mais recente do fechamento. A conclusão sobrescreve `data_venda` com a hora da entrega. |
| `loja`, `vendedor`, `cliente`, `telefone` | `filiais.nome`, `usuarios.nome` (`vendedor_id`), `contatos.nome/telefone` da primeira venda. |
| `quem_entregou` | **sem registro** em todas: até esta correção nenhuma coluna guardava quem concluiu. A partir de agora é `vendas_vendas.concluida_por`. |
| `produtos` | Nome do produto do catálogo; sem cadastro, o texto da encomenda ("Encomenda: …"). |
| `imei_serie` | `numero_serie` da venda ou IMEI/série da unidade ligada. **Vazio nas 92.** |
| `total` / `pago_registrado` / `diferenca` | Soma de `valor_venda` do fechamento × soma de `vendas_pagamentos.valor_pago` de todas as vendas do fechamento. |
| `situacao` | sem pagamento nenhum (pago = 0), pagamento parcial (0 < pago < total), pago a mais. |
| `conclusao_via` | **Inferido** (não havia registro): "antes de 15/09/2026 12h" quando a entrega é anterior à data em que algum caminho passou a gravar o saldo; "aba Encomenda" quando existe pagamento gravado até 15 min da entrega e depois do lançamento (**0 casos**); senão "Histórico (provável)". A partir de agora é `vendas_vendas.concluida_via` (pdv / encomenda / historico). |
| `pagamentos_registrados` | As linhas de `vendas_pagamentos` do fechamento (forma e valor). |

Escopo: fechamentos com pelo menos uma venda de canal `encomenda` e todas as vendas `concluida`, empresa 1. A Pronta Entrega (balcão) teve 3 fechamentos e todos batem; não entra na lista.

## Proposta: lançamento retroativo de reconciliação (não executado)

Objetivo: a loja registra o pagamento que de fato recebeu, **sem que ele se misture** com os pagamentos normais do dia (caixa, conciliação de cartão).

### Banco (migração futura, só com o seu OK)

```sql
alter table vendas_pagamentos
  add column natureza text not null default 'normal'
    check (natureza in ('normal', 'retroativo_reconciliacao')),
  add column observacao text,
  add column lancado_por uuid references usuarios(id),
  add column data_recebimento date,          -- quando o dinheiro entrou de fato (informado)
  add constraint pagamento_retroativo_completo check (
    natureza = 'normal'
    or (lancado_por is not null and data_recebimento is not null
        and length(btrim(coalesce(observacao, ''))) >= 10)
  );
```

- **Só por função:** `lancar_pagamento_retroativo(p_venda_id, p_forma, p_valor, p_data_recebimento, p_observacao)`, SECURITY DEFINER. Regras:
  - só dono/admin (`is_empresa_admin`);
  - venda `concluida` da empresa;
  - valor ≤ diferença ainda aberta do fechamento (não deixa passar do total);
  - observação obrigatória (≥ 10 caracteres: "Pix recebido na conta da loja, comprovante no WhatsApp do dia 05/11");
  - `lancado_por = auth.uid()`;
  - grava também uma linha imutável em `vendas_alertas` (tipo `pagamento_retroativo`), como trilha.
- **Imutável:** política restritiva impedindo UPDATE/DELETE de linha `retroativo_reconciliacao` pelo navegador. Errou? Lança um estorno retroativo, nunca apaga.
- Forma `nao_identificada` permitida **só** no retroativo, para o caso "a loja recebeu mas não sabe se foi Pix ou cartão". Assim não se inventa forma de pagamento.

### Telas

- **Histórico:** venda concluída com diferença ganha o selo "Pagamento não registrado · R$ X" e, para dono/admin, o botão "Lançar pagamento retroativo" (forma, valor, data em que recebeu, observação obrigatória).
- **Relatórios:** por forma de pagamento mostram o retroativo em coluna separada; **o caixa do dia e a conciliação de cartão nunca contam retroativo** (o dinheiro não entrou hoje).
- A lista do CSV vira uma tela "Reconciliação" (filtro por loja/mês, total em aberto), em vez de planilha.

### Processo sugerido

1. A loja confere o CSV contra extratos e maquininha, venda a venda.
2. Para cada uma: lança o retroativo com a forma e a data reais, ou marca "não recebido" (caso de calote ou erro de lançamento → aí é cancelamento, que ainda não existe; ver [auditoria-pdv.md](auditoria-pdv.md), P0.5).
3. Ao fim, a diferença por mês nesta tabela deve zerar. A consulta deste relatório refeita mostra o que falta.

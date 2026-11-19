/**
 * Hotfix 19/11/2026 (fix/entregar-sem-pagamento): nenhuma venda conclui com dinheiro faltando.
 *  - faltaParaFechar: o PDV trava o "Finalizar" com "Falta R$ X" (troco não trava).
 *  - concluirEncomenda / saldoDaEncomenda: a tela só fala com o banco pelas RPCs — nada de
 *    UPDATE de status pelo navegador — e devolve a recusa do banco ("Saldo em aberto").
 * A regra de dinheiro em si é provada no banco: tests/banco/prova-concluir-encomenda.sql.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { faltaParaFechar, resumirPagamentos } from '@/lib/pdv-pagamentos'
import { concluirEncomenda, saldoDaEncomenda } from '@/lib/encomendas'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('faltaParaFechar (PDV)', () => {
  const linha = (valor: number) => ({ id: 'p', forma: 'dinheiro', valor, parcelas: 1, bandeira: 'visa_master' as const })

  test('pagamento cobre o total: pode fechar', () => {
    assert.equal(faltaParaFechar(resumirPagamentos([linha(1000)], 1000, [])), 0)
  })
  test('falta dinheiro: devolve quanto falta', () => {
    assert.equal(faltaParaFechar(resumirPagamentos([linha(600)], 1000, [])), 400)
  })
  test('split que não fecha também trava', () => {
    assert.equal(faltaParaFechar(resumirPagamentos([linha(500), { ...linha(300), forma: 'pix' }], 1000, [])), 200)
  })
  test('passou do total (troco) não trava', () => {
    assert.equal(faltaParaFechar(resumirPagamentos([linha(1050)], 1000, [])), 0)
  })
  test('sobra de arredondamento abaixo de 1 centavo não trava', () => {
    assert.equal(faltaParaFechar({ falta: 0.004 }), 0)
    assert.equal(faltaParaFechar({ falta: 0.01 }), 0.01)
  })
})

/** Cliente falso: registra as chamadas; `rpc` responde o que o teste mandar. */
function clienteFalso(resposta: { data?: unknown; error?: { message: string } | null }) {
  const chamadas: { tipo: string; nome: string; args?: unknown }[] = []
  const cliente = {
    rpc: async (nome: string, args: unknown) => { chamadas.push({ tipo: 'rpc', nome, args }); return { data: resposta.data ?? null, error: resposta.error ?? null } },
    from: (nome: string) => { chamadas.push({ tipo: 'from', nome }); throw new Error('não deveria acessar tabela direto') },
  }
  return { cliente: cliente as unknown as SupabaseClient, chamadas }
}

describe('concluirEncomenda (lib/encomendas)', () => {
  test('conclui SÓ pela RPC, com pagamentos, acessórios e origem', async () => {
    const { cliente, chamadas } = clienteFalso({ data: { venda_ids: [10, 11, 12], baixou: 1 } })
    const r = await concluirEncomenda(cliente, 10, {
      origem: 'historico',
      pagamentos: [{ forma: 'pix', valor: 1500 }, { forma: 'dinheiro', valor: 0 }],
      acessorios: [{ descricao: 'Capinha', valor: 80 }],
    })
    assert.deepEqual(r, { ok: true, vendaIds: [10, 11, 12], baixou: 1 })
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].nome, 'concluir_encomenda')
    assert.deepEqual(chamadas[0].args, {
      p_venda_id: 10,
      // Linha de R$ 0 não vai: não é pagamento.
      p_pagamentos: [{ forma: 'pix', valor: 1500 }],
      p_acessorios: [{ descricao: 'Capinha', valor: 80 }],
      p_origem: 'historico',
    })
  })

  test('saldo em aberto: devolve a recusa do banco e não diz que concluiu', async () => {
    const { cliente } = clienteFalso({ error: { message: 'Saldo em aberto: R$ 1.500,00' } })
    const r = await concluirEncomenda(cliente, 10, { origem: 'encomenda' })
    assert.equal(r.ok, false)
    assert.equal(r.erro, 'Saldo em aberto: R$ 1.500,00')
    assert.deepEqual(r.vendaIds, [])
  })

  test('saldoDaEncomenda lê o número do banco', async () => {
    const { cliente, chamadas } = clienteFalso({ data: { total: '7695.00', pago: 1000, saldo: 6695 } })
    assert.deepEqual(await saldoDaEncomenda(cliente, 7), { total: 7695, pago: 1000, saldo: 6695 })
    assert.equal(chamadas[0].nome, 'encomenda_saldo')
  })

  test('saldoDaEncomenda sem resposta: null (a tela não deixa enviar)', async () => {
    const { cliente } = clienteFalso({ error: { message: 'Venda não encontrada' } })
    assert.equal(await saldoDaEncomenda(cliente, 7), null)
  })
})

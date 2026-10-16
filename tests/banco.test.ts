/**
 * Integração com o banco de verdade — só roda com BANCO=1 (lê .env.local).
 *
 * Não toca em dado de cliente. O único teste que grava usa uma chave de
 * contador própria (`teste:<aleatório>`) na tabela `rate_limit` e apaga as
 * linhas dela no fim, passe ou falhe.
 *
 *   BANCO=1 npm test
 */
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ligado = process.env.BANCO === '1'

function servico() {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
  )
  return {
    svc: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    anon: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }),
  }
}

describe('banco (BANCO=1)', { skip: !ligado && 'defina BANCO=1 para rodar' }, () => {
  const { svc, anon } = ligado ? servico() : ({} as ReturnType<typeof servico>)
  const chave = `teste:${randomUUID()}`
  after(async () => { if (ligado) await svc.from('rate_limit').delete().eq('chave', chave) })

  test('teto de uso: 40 chamadas simultâneas contam 1..40, sem perder nem repetir', async () => {
    const janela = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString()
    const r = await Promise.all(Array.from({ length: 40 }, () => svc.rpc('rate_limit_bump', { p_chave: chave, p_janela: janela })))
    assert.ok(r.every((x) => !x.error), String(r.find((x) => x.error)?.error?.message))
    const valores = r.map((x) => Number(x.data)).sort((a, b) => a - b)
    assert.deepEqual(valores, Array.from({ length: 40 }, (_, i) => i + 1))
  })

  test('o contador não pode ser chamado nem zerado de fora (anônimo)', async () => {
    const { error } = await anon.rpc('rate_limit_bump', { p_chave: chave, p_janela: new Date().toISOString() })
    assert.ok(error, 'anônimo não pode chamar rate_limit_bump')
    const { data } = await anon.from('rate_limit').select('chave').limit(1)
    assert.equal((data ?? []).length, 0, 'anônimo não lê a tabela')
  })

  test('nada sensível exposto à chave pública', async () => {
    for (const t of ['leads', 'lead_mensagens', 'zapintel_lead_perfil', 'zapintel_venda_lead', 'zapintel_midia_retida', 'v_orfaos_chat_midia', 'assistente_config']) {
      const { data } = await anon.from(t).select('*').limit(1)
      assert.equal((data ?? []).length, 0, `${t} não pode devolver linhas ao anônimo`)
    }
    for (const fn of ['zapintel_dashboard', 'zapintel_leads_lista', 'zapintel_escopo', 'zapintel_analises_pendentes', 'buscar_lead_por_numero']) {
      const { error } = await anon.rpc(fn, {})
      assert.ok(error, `${fn} não pode responder ao anônimo`)
    }
  })

  /**
   * O bucket `contratos` é público DE PROPÓSITO — e este teste trava as duas
   * metades da decisão (docs/DECISAO-BUCKET-CONTRATOS-20261016.md).
   *
   * Ele guarda só os fundos dos modelos (capa e papel timbrado; o importador
   * remove o texto do PDF antes de gerar a imagem). O contrato emitido é HTML que
   * usa o fundo pela URL pública, e os contratos já arquivados em
   * `contratos_venda.html` têm essa URL gravada: se ela parar de responder, a 2ª
   * via sai sem capa nem timbrado. Por isso o HEAD precisa dar 200.
   *
   * O que NÃO pode voltar é listar: sem os nomes (UUID aleatório), ninguém de
   * fora acha um arquivo. Se o bucket passar a guardar contrato emitido ou
   * documento de cliente, este teste está errado — o bucket vira privado.
   */
  test('contratos: anônimo não lista o bucket, mas a URL pública do fundo continua servindo (só cabeçalho, sem baixar)', async () => {
    const lista = await anon.storage.from('contratos').list('1', { limit: 5 })
    assert.ok(lista.error || (lista.data ?? []).length === 0, 'anônimo não pode listar os fundos')
    const { data: um } = await svc.storage.from('contratos').list('1', { limit: 1 })
    if (!um?.length) return
    const url = svc.storage.from('contratos').getPublicUrl(`1/${um[0].name}`).data.publicUrl
    const r = await fetch(url, { method: 'HEAD' })
    assert.equal(r.status, 200, 'o contrato emitido usa o fundo por URL pública')
  })

  test('fila de análises: paginação ordenada devolve o mesmo que a leitura inteira', async () => {
    const tudo = await svc.rpc('zapintel_analises_pendentes', { p_empresa: 1, p_versao: 'p2' })
    const pag = await svc.rpc('zapintel_analises_pendentes', { p_empresa: 1, p_versao: 'p2' }).order('lead_id').range(0, 999)
    assert.ifError(tudo.error); assert.ifError(pag.error)
    const ids = (x: unknown) => ((x ?? []) as { lead_id: number }[]).map((l) => Number(l.lead_id)).sort((a, b) => a - b)
    assert.deepEqual(ids(pag.data), ids(tudo.data))
  })
})

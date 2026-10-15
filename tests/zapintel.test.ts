/**
 * Regressões da auditoria do ZapIntel (15/10/2026) — sem banco e sem rede.
 * Cada teste trava um defeito que existiu de verdade; o comentário diz qual.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bancoFalso, filtro, type Consulta } from './banco-falso'
import { semAsQueSaoProva, retirarMidia, type Retirada } from '@/lib/storage/retencao'
import { guardarPerfil, VERSAO_DO_PERFIL, type PerfilIA } from '@/lib/zapintel/perfil'
import { excedeuLimiteDoUsuario } from '@/lib/rate-limit'

const como = (db: unknown) => db as unknown as SupabaseClient
const img = (id: number): Retirada => ({ mensagemId: id, arquivo: `1/m/wa-${id}.jpg`, urlAntiga: `https://x/chat-midia/1/m/wa-${id}.jpg`, tipo: 'imagem' })
const T0 = '2026-10-10T15:00:00.000Z'
const mais = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString()

describe('retenção de mídia: na dúvida, nada sai', () => {
  test('imagem perto de "paguei" num ÁUDIO TRANSCRITO fica (antes só o texto contava)', async () => {
    const db = bancoFalso((c) => {
      if (c.tabela === 'lead_mensagens' && filtro(c, 'or')) {
        // O banco devolveria a vizinha do lead 1 porque a TRANSCRIÇÃO tem "paguei".
        return { data: [{ lead_id: 1, created_at: mais(5) }], error: null }
      }
      return { data: [{ id: 10, lead_id: 1, created_at: T0 }, { id: 20, lead_id: 2, created_at: T0 }], error: null }
    })
    const fora = await semAsQueSaoProva(como(db), [img(10), img(20)])
    assert.deepEqual(fora.map((a) => a.mensagemId), [20])

    const busca = db.consultas.find((c) => filtro(c, 'or'))!
    const ou = String(filtro(busca, 'or')![0])
    for (const p of ['transcricao.ilike.%paguei%', 'conteudo.ilike.%cpf%', 'transcricao.ilike.%cpf%', 'conteudo.ilike.%rg %']) {
      assert.ok(ou.includes(p), `o filtro de prova precisa ter ${p}`)
    }
  })

  test('erro ao conferir as imagens interrompe tudo (antes virava "nenhuma é prova")', async () => {
    const db = bancoFalso(() => ({ data: null, error: { message: 'timeout' } }))
    await assert.rejects(semAsQueSaoProva(como(db), [img(1)]), /nada apagado/)
  })

  test('erro ao ler as conversas vizinhas também interrompe', async () => {
    const db = bancoFalso((c) => filtro(c, 'or')
      ? { data: null, error: { message: 'timeout' } }
      : { data: [{ id: 1, lead_id: 1, created_at: T0 }], error: null })
    await assert.rejects(semAsQueSaoProva(como(db), [img(1)]), /nada apagado/)
  })

  test('1.200 imagens são conferidas em lotes de até 500 (a API cortava em 1.000)', async () => {
    const pedidos: number[][] = []
    const db = bancoFalso((c) => {
      const inn = filtro(c, 'in')
      if (!filtro(c, 'or') && inn?.[0] === 'id') {
        const ids = inn[1] as number[]
        pedidos.push(ids)
        return { data: ids.map((id) => ({ id, lead_id: id, created_at: T0 })), error: null }
      }
      return { data: [], error: null }
    })
    const alvos = Array.from({ length: 1200 }, (_, i) => img(i + 1))
    const fora = await semAsQueSaoProva(como(db), alvos)
    assert.ok(pedidos.every((p) => p.length <= 500))
    assert.equal(new Set(pedidos.flat()).size, 1200)
    assert.equal(fora.length, 1200)
  })

  test('as vizinhas são paginadas: 1.000 marcos voltando pede a página seguinte', async () => {
    const paginas: unknown[] = []
    const db = bancoFalso((c) => {
      if (filtro(c, 'or')) {
        const r = filtro(c, 'range')!
        paginas.push(r[0])
        // 1ª página cheia (sem marco perto); a 2ª traz o marco que protege.
        if (r[0] === 0) return { data: Array.from({ length: 1000 }, () => ({ lead_id: 1, created_at: mais(-500) })), error: null }
        return { data: [{ lead_id: 1, created_at: mais(3) }], error: null }
      }
      return { data: [{ id: 1, lead_id: 1, created_at: T0 }], error: null }
    })
    const fora = await semAsQueSaoProva(como(db), [img(1)])
    assert.deepEqual(paginas, [0, 1000])
    assert.equal(fora.length, 0)
  })

  test('imagem que não foi encontrada para conferir não sai', async () => {
    const db = bancoFalso((c) => filtro(c, 'or') ? { data: [], error: null } : { data: [{ id: 1, lead_id: 1, created_at: T0 }], error: null })
    const fora = await semAsQueSaoProva(como(db), [img(1), img(2)])
    assert.deepEqual(fora.map((a) => a.mensagemId), [1])
  })

  test('arquivo só é apagado se a URL da mensagem saiu (lote que falhou fica intacto)', async () => {
    const alvos = Array.from({ length: 250 }, (_, i) => img(i + 1)) // 2 lotes de update: 200 + 50
    let updates = 0
    const db = bancoFalso((c) => {
      if (c.op === 'update') { updates++; return updates === 1 ? { data: null, error: { message: 'falhou' } } : { data: null, error: null } }
      if (c.op === 'remove') return { data: (c.dados as string[]).map((n) => ({ name: n })), error: null }
      return { data: null, error: null }
    })
    const r = await retirarMidia(como(db), alvos, 7)
    const apagados = db.consultas.filter((c) => c.op === 'remove').flatMap((c) => c.dados as string[])
    assert.equal(apagados.length, 50)
    assert.ok(apagados.every((n) => Number(/wa-(\d+)/.exec(n)![1]) > 200), 'só os do lote cuja URL saiu')
    assert.equal(r.urlsLimpas, 50)
    assert.equal(r.falhas, 200)
  })

  test('sem o registro de backup, nada é tocado', async () => {
    const db = bancoFalso((c) => c.op === 'insert' ? { data: null, error: { message: 'sem espaço' } } : { data: null, error: null })
    await assert.rejects(retirarMidia(como(db), [img(1)], 7), /nada foi apagado/)
    assert.ok(!db.consultas.some((c) => c.op === 'update' || c.op === 'remove'))
  })
})

describe('ficha de IA: a velha não sobrescreve a nova', () => {
  const perfil = { classificacao: 'warm' } as unknown as PerfilIA
  const guardada = (marca: number, mensagens: number, versao = VERSAO_DO_PERFIL) =>
    bancoFalso((c: Consulta) => c.op === 'select' ? { data: { marca, mensagens, versao }, error: null } : { data: null, error: null })

  test('pedido que começou com a conversa antiga termina depois: não grava', async () => {
    const db = guardada(2000, 40)
    await guardarPerfil(como(db), 1, 99, { marca: 1000, mensagens: 30, transcritos: 0 }, perfil, 'm', 1)
    assert.ok(!db.consultas.some((c) => c.op === 'upsert'))
  })

  test('mesma marca com menos mensagens também não grava', async () => {
    const db = guardada(2000, 40)
    await guardarPerfil(como(db), 1, 99, { marca: 2000, mensagens: 39, transcritos: 0 }, perfil, 'm', 1)
    assert.ok(!db.consultas.some((c) => c.op === 'upsert'))
  })

  test('conversa mais nova grava', async () => {
    const db = guardada(1000, 30)
    await guardarPerfil(como(db), 1, 99, { marca: 2000, mensagens: 40, transcritos: 1 }, perfil, 'm', 1)
    assert.equal(db.consultas.filter((c) => c.op === 'upsert').length, 1)
  })

  test('ficha de versão antiga é sempre substituída', async () => {
    const db = guardada(9999, 99, 'p1')
    await guardarPerfil(como(db), 1, 99, { marca: 1, mensagens: 1, transcritos: 0 }, perfil, 'm', 1)
    assert.equal(db.consultas.filter((c) => c.op === 'upsert').length, 1)
  })

  test('a mesma ficha regravada (perfil manual) passa', async () => {
    const db = guardada(2000, 40)
    await guardarPerfil(como(db), 1, 99, { marca: 2000, mensagens: 40, transcritos: 0 }, perfil, 'm', 1)
    assert.equal(db.consultas.filter((c) => c.op === 'upsert').length, 1)
  })
})

describe('teto de IA por pessoa', () => {
  test('a chave é do usuário da sessão e do escopo; passou do máximo, bloqueia', async () => {
    const db = bancoFalso(() => ({ data: 121, error: null }))
    assert.equal(await excedeuLimiteDoUsuario(como(db), 'zapintel-perfil', 'u-123', 120), true)
    const args = db.consultas[0].dados as { p_chave: string; p_janela: string }
    assert.equal(args.p_chave, 'zapintel-perfil:u:u-123')
    assert.equal(new Date(args.p_janela).getUTCMinutes(), 0, 'janela fixa de 1 hora')
  })

  test('no limite exato ainda passa', async () => {
    const db = bancoFalso(() => ({ data: 120, error: null }))
    assert.equal(await excedeuLimiteDoUsuario(como(db), 'zapintel-perfil', 'u', 120), false)
  })

  test('contador fora do ar deixa passar (escolha registrada: o limite não derruba a rota)', async () => {
    const db = bancoFalso(() => ({ data: null, error: { message: 'down' } }))
    const erro = console.error; console.error = () => {}
    try { assert.equal(await excedeuLimiteDoUsuario(como(db), 'zapintel-perfil', 'u', 120), false) } finally { console.error = erro }
  })
})

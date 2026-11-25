/**
 * Rotina de resgate das mídias pendentes do WhatsApp (25/11/2026; lib/midia/resgate.ts).
 * Banco e Storage falsos que executam os filtros (tests/postgrest-falso.ts); Meta falsa por fetch.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { postgrestFalso } from './postgrest-falso'
import { caminhoDaMidia, resgatarMidiasPendentes } from '@/lib/midia/resgate'

const AGORA = new Date('2026-11-25T15:00:00.000Z')
const EM_3_DIAS = '2026-11-28T15:00:00.000Z'
const ONTEM = '2026-11-24T15:00:00.000Z'

function cenario(mensagens: Record<string, unknown>[]) {
  return postgrestFalso({
    mensagens,
    canais: [
      { id: 15, empresa_id: 1, access_token_enc: 'cifrado-15' },
      { id: 16, empresa_id: 1, access_token_enc: null },
    ],
  })
}

/** Meta falsa: GET /{id} devolve a URL; GET da URL devolve o áudio. Respostas por id de mídia. */
function metaFalsa(respostas: Record<string, { info?: number; download?: number; bytes?: number; mime?: string }>) {
  const chamadas: string[] = []
  const f = (async (url: string) => {
    chamadas.push(url)
    const id = Object.keys(respostas).find((k) => url.includes(k))
    const r = respostas[id ?? ''] ?? {}
    if (url.startsWith('https://graph.facebook.com/')) {
      const st = r.info ?? 200
      return new Response(JSON.stringify(st === 200 ? { url: `https://lookaside.falso/${id}`, mime_type: r.mime ?? 'audio/ogg' } : { error: {} }), { status: st })
    }
    const st = r.download ?? 200
    return new Response(st === 200 ? new Uint8Array(r.bytes ?? 85017) : 'erro', {
      status: st, headers: { 'content-type': `${r.mime ?? 'audio/ogg'}; codecs=opus` },
    })
  }) as unknown as typeof fetch
  return { f, chamadas }
}

const dep = (f: typeof fetch) => ({ fetch: f, agora: AGORA, decifrar: (c: string) => `token:${c}`, graph: 'v25.0' })

describe('resgate das mídias pendentes', () => {
  test('pendente dentro do prazo: busca na Meta, grava no caminho da Edge e limpa o estado', async () => {
    const db = cenario([{ id: 1, empresa_id: 1, canal_id: 15, tipo: 'audio', midia_url: null, midia_status: 'pendente', midia_ref: '1184151040855213', midia_tentativas: 0, midia_expira_em: EM_3_DIAS }])
    const meta = metaFalsa({ '1184151040855213': {} })
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(meta.f))
    assert.deepEqual(r, { expiradas: 0, resgatadas: 1, indisponiveis: 0, adiadas: 0 })
    assert.ok(db.arquivos.has('chat-midia/1/m/wa-1184151040855213.ogg'), 'mesmo caminho determinístico da Edge')
    const m = (await db.from('mensagens').select('*').eq('id', 1).single()).data as Record<string, unknown>
    assert.equal(m.midia_status, null)
    assert.equal(m.midia_url, 'https://falso.supabase.co/storage/v1/object/public/chat-midia/1/m/wa-1184151040855213.ogg')
    assert.equal(m.midia_tentativas, 1)
    assert.ok(meta.chamadas[0].includes('/v25.0/1184151040855213'))
  })

  test('prazo de 7 dias vencido: indisponível, sem chamar a Meta', async () => {
    const db = cenario([{ id: 2, empresa_id: 1, canal_id: 15, tipo: 'audio', midia_url: null, midia_status: 'pendente', midia_ref: '999', midia_tentativas: 4, midia_expira_em: ONTEM }])
    const meta = metaFalsa({})
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(meta.f))
    assert.equal(r.expiradas, 1)
    assert.equal(meta.chamadas.length, 0)
    assert.equal(((await db.from('mensagens').select('*').eq('id', 2).single()).data as Record<string, unknown>).midia_status, 'indisponivel')
  })

  test('a Meta não tem mais a mídia (404): indisponível', async () => {
    const db = cenario([{ id: 3, empresa_id: 1, canal_id: 15, tipo: 'imagem', midia_url: null, midia_status: 'pendente', midia_ref: '777', midia_tentativas: 0, midia_expira_em: EM_3_DIAS }])
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(metaFalsa({ '777': { info: 404 } }).f))
    assert.equal(r.indisponiveis, 1)
    assert.equal(((await db.from('mensagens').select('*').eq('id', 3).single()).data as Record<string, unknown>).midia_status, 'indisponivel')
  })

  test('falha passageira (Meta 503 ou Storage 520): continua pendente, conta a tentativa', async () => {
    const db = cenario([
      { id: 4, empresa_id: 1, canal_id: 15, tipo: 'audio', midia_url: null, midia_status: 'pendente', midia_ref: '501', midia_tentativas: 2, midia_expira_em: EM_3_DIAS },
      { id: 5, empresa_id: 1, canal_id: 15, tipo: 'audio', midia_url: null, midia_status: 'pendente', midia_ref: '502', midia_tentativas: 0, midia_expira_em: '2026-11-29T15:00:00.000Z' },
    ])
    db.storageFalso.falhar = null
    const meta = metaFalsa({ '501': { info: 503 }, '502': {} })
    // o upload da 5 (segunda da lista) falha com 520
    const upload = db.storage.from('chat-midia').upload
    let n = 0
    db.storage.from = () => ({
      upload: async (...a: Parameters<typeof upload>) => (++n === 1 ? { data: null, error: { message: 'HTTP 520 error' } } : upload(...a)),
      getPublicUrl: (c: string) => ({ data: { publicUrl: c } }),
    }) as unknown as ReturnType<typeof db.storage.from>
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(meta.f))
    assert.deepEqual(r, { expiradas: 0, resgatadas: 0, indisponiveis: 0, adiadas: 2 })
    const linhas = (await db.from('mensagens').select('*').order('id')).data as Record<string, unknown>[]
    assert.deepEqual(linhas.map((l) => [l.id, l.midia_status, l.midia_tentativas]), [[4, 'pendente', 3], [5, 'pendente', 1]])
  })

  test('canal sem token: adia (não marca indisponível antes do prazo)', async () => {
    const db = cenario([{ id: 6, empresa_id: 1, canal_id: 16, tipo: 'audio', midia_url: null, midia_status: 'pendente', midia_ref: '600', midia_tentativas: 0, midia_expira_em: EM_3_DIAS }])
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(metaFalsa({}).f))
    assert.equal(r.adiadas, 1)
    assert.equal(((await db.from('mensagens').select('*').eq('id', 6).single()).data as Record<string, unknown>).midia_status, 'pendente')
  })

  test('nada pendente: não chama a Meta nem lê canais', async () => {
    const db = cenario([{ id: 7, empresa_id: 1, canal_id: 15, tipo: 'audio', midia_url: 'x', midia_status: null, midia_ref: null, midia_tentativas: 0, midia_expira_em: null }])
    const meta = metaFalsa({})
    const r = await resgatarMidiasPendentes(db as unknown as SupabaseClient, dep(meta.f))
    assert.deepEqual(r, { expiradas: 0, resgatadas: 0, indisponiveis: 0, adiadas: 0 })
    assert.equal(meta.chamadas.length, 0)
  })

  test('caminho igual ao da Edge (caminhoDaMidia)', () => {
    assert.equal(caminhoDaMidia(1, 'wa-1184151040855213', 'ogg'), '1/m/wa-1184151040855213.ogg')
    assert.equal(caminhoDaMidia(10, 'wa-12/34', 'jpg'), '10/m/wa-1234.jpg')
  })
})

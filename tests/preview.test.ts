/**
 * Prévia do superadmin (/api/zapintel/preview): era GET e virou POST da própria
 * origem em 15/10/2026 — GET que muda estado é CSRF (um link de fora trocava a
 * empresa que o superadmin estava vendo). Sessão e banco simulados.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const sessao = { logado: true, super: true, empresaExiste: true }

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: sessao.logado ? { id: 'u-super' } : null } }) },
      from: (tabela: string) => {
        const q: Record<string, unknown> = {}
        q.select = () => q; q.eq = () => q
        q.single = async () => ({ data: { is_super_admin: sessao.super } })
        q.maybeSingle = async () => ({ data: tabela === 'empresas' && sessao.empresaExiste ? { id: 3 } : null })
        return q
      },
    }),
  },
})

const { GET, POST } = await import('@/app/api/zapintel/preview/route')
const ORIGEM = 'http://localhost:3000'
const form = (campos: Record<string, string>) => new URLSearchParams(campos).toString()
const post = (campos: Record<string, string>, cabecalhos: Record<string, string> = { Origin: ORIGEM }) =>
  POST(new Request(`${ORIGEM}/api/zapintel/preview`, {
    method: 'POST', body: form(campos),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...cabecalhos },
  }))
const cookie = (r: Response) => r.headers.get('set-cookie') ?? ''

describe('prévia do superadmin', () => {
  beforeEach(() => { sessao.logado = true; sessao.super = true; sessao.empresaExiste = true })

  test('GET (o link antigo) não liga nada', async () => {
    const r = await GET(new Request(`${ORIGEM}/api/zapintel/preview?empresa=3`))
    assert.equal(r.status, 303)
    assert.equal(cookie(r), '')
  })

  test('POST vindo de outro site: 403, sem cookie', async () => {
    const r = await post({ empresa: '3' }, { Origin: 'https://site-de-fora.com' })
    assert.equal(r.status, 403); assert.equal(cookie(r), '')
  })

  test('POST sem Origin e sem Sec-Fetch-Site: 403', async () => {
    const r = await post({ empresa: '3' }, {})
    assert.equal(r.status, 403)
  })

  test('POST da própria origem por quem não é superadmin: sem cookie', async () => {
    sessao.super = false
    const r = await post({ empresa: '3' })
    assert.equal(r.status, 303); assert.equal(cookie(r), '')
    assert.match(r.headers.get('location') ?? '', /\/dashboard$/)
  })

  test('superadmin, mesma origem, empresa existente: liga a prévia (httpOnly, lax, 2 h)', async () => {
    const r = await post({ empresa: '3' })
    assert.equal(r.status, 303)
    assert.match(r.headers.get('location') ?? '', /\/zapintel$/)
    const c = cookie(r)
    assert.match(c, /nexus_preview_empresa=3/); assert.match(c, /HttpOnly/i); assert.match(c, /SameSite=lax/i); assert.match(c, /Max-Age=7200/)
  })

  test('empresa inexistente ou inválida: não liga', async () => {
    sessao.empresaExiste = false
    assert.equal(cookie(await post({ empresa: '999' })), '')
    sessao.empresaExiste = true
    assert.equal(cookie(await post({ empresa: '-1' })), '')
    assert.equal(cookie(await post({ empresa: 'abc' })), '')
  })

  test('sair da prévia apaga o cookie', async () => {
    const r = await post({ clear: '1' })
    assert.match(cookie(r), /nexus_preview_empresa=;/)
    assert.match(cookie(r), /Max-Age=0/)
  })
})

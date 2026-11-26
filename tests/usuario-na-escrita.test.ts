/**
 * O cliente de serviço manda quem escreveu só nas escritas (1.1c, lib/supabase/usuario-na-escrita.ts).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { comUsuarioNasEscritas, vaiPerguntarUsuario, CABECALHO_USUARIO, COOKIE_IMPERSONACAO } from '@/lib/supabase/usuario-na-escrita'

function base() {
  const chamadas: { url: string; metodo: string; headers: Headers }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(input), metodo: (init?.method ?? 'GET').toUpperCase(), headers: new Headers(init?.headers) })
    return new Response('[]', { status: 200 })
  }) as typeof fetch
  return { f, chamadas }
}

describe('comUsuarioNasEscritas', () => {
  test('leitura não pergunta o usuário nem põe cabeçalho', async () => {
    const { f, chamadas } = base()
    let perguntas = 0
    const embrulhado = comUsuarioNasEscritas(f, async () => { perguntas++; return 'u-1' })
    await embrulhado('http://x/rest/v1/contatos', { method: 'GET', headers: { apikey: 'k' } })
    await embrulhado('http://x/rest/v1/contatos')
    assert.equal(perguntas, 0)
    assert.equal(chamadas[0].headers.get(CABECALHO_USUARIO), null)
    assert.equal(chamadas[0].headers.get('apikey'), 'k')
  })

  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    test(`${metodo} com usuário: cabeçalho junto dos que já existiam`, async () => {
      const { f, chamadas } = base()
      const embrulhado = comUsuarioNasEscritas(f, async () => 'u-1')
      await embrulhado('http://x/rest/v1/negocios', { method: metodo, headers: { apikey: 'k', Prefer: 'return=representation' } })
      assert.equal(chamadas[0].headers.get(CABECALHO_USUARIO), 'u-1')
      assert.equal(chamadas[0].headers.get('apikey'), 'k')
      assert.equal(chamadas[0].headers.get('prefer'), 'return=representation')
      assert.equal(chamadas[0].metodo, metodo)
    })
  }

  test('escrita sem usuário (rotina, webhook): segue sem cabeçalho', async () => {
    const { f, chamadas } = base()
    await comUsuarioNasEscritas(f, async () => null)('http://x/rest/v1/rpc/algo', { method: 'POST' })
    assert.equal(chamadas[0].headers.get(CABECALHO_USUARIO), null)
  })

  test('erro ao descobrir o usuário não derruba a escrita', async () => {
    const { f, chamadas } = base()
    const r = await comUsuarioNasEscritas(f, async () => { throw new Error('auth fora do ar') })('http://x/rest/v1/tarefas', { method: 'POST' })
    assert.equal(r.status, 200)
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].headers.get(CABECALHO_USUARIO), null)
  })
})

describe('vaiPerguntarUsuario (pista, quem decide é o banco)', () => {
  const sessao = { name: 'sb-abc-auth-token', value: 'x' }
  const imp = { name: COOKIE_IMPERSONACAO, value: '1' }
  test('sessão + impersonação: pergunta', () => assert.equal(vaiPerguntarUsuario([sessao, imp]), true))
  test('sessão em pedaços (.0) + impersonação: pergunta', () => assert.equal(vaiPerguntarUsuario([{ name: 'sb-abc-auth-token.0', value: 'x' }, imp]), true))
  test('só sessão (equipe comum): não pergunta', () => assert.equal(vaiPerguntarUsuario([sessao]), false))
  test('só impersonação, sem sessão: não pergunta', () => assert.equal(vaiPerguntarUsuario([imp]), false))
  test('impersonação apagada (valor vazio): não pergunta', () => assert.equal(vaiPerguntarUsuario([sessao, { ...imp, value: '' }]), false))
})

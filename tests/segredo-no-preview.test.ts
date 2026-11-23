/**
 * PREVIEW NÃO GRAVA SEGREDO (23/11/2026, docs/design-pos-venda.md §8.6).
 *
 * O preview usa o banco da produção com chaves de teste: um segredo cifrado lá ficaria ilegível para a
 * produção. Prova que, com VERCEL_ENV = 'preview':
 *   - a cifra recusa (cofre de canais, de pagamento e segredos da empresa) — nada é gravado;
 *   - as seis rotas que gravam segredo respondem 403 PREVIEW_SEM_SEGREDO antes de qualquer outra coisa;
 * e que em produção (e sem VERCEL_ENV, no local) tudo segue igual.
 *
 *   npm test
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { emPreview, recusaNoPreview, CODIGO_PREVIEW } from '@/lib/segredo-no-preview'
import { cifrarToken, decifrarToken } from '@/lib/canais/crypto'
import { encryptCredenciais, decryptCredenciais } from '@/lib/payments/crypto'
import { gravarSegredo } from '@/lib/empresa-segredos'

const antes = { VERCEL_ENV: process.env.VERCEL_ENV, CH: process.env.CHANNEL_ENCRYPTION_KEY, PAY: process.env.PAYMENT_ENCRYPTION_KEY }
process.env.CHANNEL_ENCRYPTION_KEY = randomBytes(32).toString('hex')
process.env.PAYMENT_ENCRYPTION_KEY = randomBytes(32).toString('hex')
const ambiente = (v: string | undefined) => { if (v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = v }
afterEach(() => ambiente(antes.VERCEL_ENV))

describe('preview não grava segredo', () => {
  test('emPreview só com VERCEL_ENV = preview', () => {
    assert.equal(emPreview({ VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv), true)
    assert.equal(emPreview({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv), false)
    assert.equal(emPreview({} as unknown as NodeJS.ProcessEnv), false)
  })

  test('cofre de canais: cifrar recusa no preview; em produção e no local cifra e decifra', () => {
    ambiente('preview')
    assert.throws(() => cifrarToken('token-da-meta'), new RegExp(CODIGO_PREVIEW))
    for (const v of ['production', undefined]) {
      ambiente(v)
      assert.equal(decifrarToken(cifrarToken('token-da-meta')), 'token-da-meta')
    }
  })

  test('cofre de pagamento: cifrar recusa no preview; fora dele segue igual', () => {
    ambiente('preview')
    assert.throws(() => encryptCredenciais({ api_key: 'x' }), new RegExp(CODIGO_PREVIEW))
    ambiente('production')
    assert.deepEqual(decryptCredenciais(encryptCredenciais({ api_key: 'x' })), { api_key: 'x' })
  })

  test('segredo da empresa (token de portal): no preview devolve erro e NÃO fala com o banco', async () => {
    ambiente('preview')
    let chamou = false
    const svc = { from: () => { chamou = true; return { upsert: async () => ({ error: null }) } } }
    const r = await gravarSegredo(svc as never, 5, 'portal_leads', 'abc')
    assert.match(String(r.error), new RegExp(CODIGO_PREVIEW))
    assert.equal(chamou, false, 'nada é gravado no banco da produção')
  })

  test('recusaNoPreview: 403 com o código no preview; null fora dele', async () => {
    ambiente('preview')
    const r = recusaNoPreview()
    assert.ok(r)
    assert.equal(r.status, 403)
    assert.equal((await r.json()).codigo, CODIGO_PREVIEW)
    ambiente('production')
    assert.equal(recusaNoPreview(), null)
  })

  test('as seis rotas que gravam segredo recusam como PRIMEIRA coisa do handler', () => {
    for (const [arquivo, assinatura] of [
      ['app/api/canais/whatsapp/route.ts', 'export async function POST('],
      ['app/api/canais/meta/route.ts', 'export async function POST('],
      ['app/api/canais/instagram/iniciar/route.ts', 'export async function POST('],
      ['app/api/canais/instagram/retorno/route.ts', 'export async function GET('],
      ['app/api/payments/config/route.ts', 'export async function POST('],
      ['app/api/rastreamento/config/route.ts', 'export async function PATCH('],
    ]) {
      const src = readFileSync(arquivo, 'utf8')
      const corpo = src.slice(src.indexOf(assinatura))
      const linhas = corpo.split(/\r?\n/).slice(1).filter((l) => l.trim() && !l.trim().startsWith('//'))
      assert.match(linhas[0], /const recusa = recusaNoPreview\(\); if \(recusa\) return recusa/, arquivo)
    }
  })
})

process.on('exit', () => {
  if (antes.CH === undefined) delete process.env.CHANNEL_ENCRYPTION_KEY; else process.env.CHANNEL_ENCRYPTION_KEY = antes.CH
  if (antes.PAY === undefined) delete process.env.PAYMENT_ENCRYPTION_KEY; else process.env.PAYMENT_ENCRYPTION_KEY = antes.PAY
})

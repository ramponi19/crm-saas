/**
 * HORÁRIO POR DIA CONTRA O BANCO LOCAL DE VERDADE (npm run test:local; scripts/teste-local.sh).
 * A rota real /api/configuracoes/horario com sessões reais (empresa 5, Nexus Demonstração da semente): o
 * administrador grava o sábado reduzido, o vendedor é recusado, a loja tem horário próprio e volta ao da empresa,
 * e o formato antigo (`horario_comercial`, `horario`) acompanha o da empresa (fase 1 da compatibilidade).
 */
import { test, describe, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const EMPRESA = 5, LOJA = 1
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const sessoes: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { GET, PUT } = await import('@/app/api/configuracoes/horario/route')

const dia = (abre: string, fecha: string) => [{ abre, fecha }]
const SEMANA = { '0': [], '1': dia('09:00', '18:00'), '2': dia('09:00', '18:00'), '3': dia('09:00', '18:00'), '4': dia('09:00', '18:00'),
  '5': dia('09:00', '18:00'), '6': dia('09:00', '13:00') }
const put = async (corpo: unknown) => {
  const r = await PUT(new Request('http://local/api', { method: 'PUT', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }) as never)
  return { status: r.status, corpo: await r.json() as Record<string, unknown> }
}
const ler = async () => (await (await GET()).json()) as { empresa: { semana: Record<string, unknown[]> }; lojas: { id: number; proprio: unknown }[] }
const chave = async (c: string) => (await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', EMPRESA).eq('chave', c).maybeSingle()).data?.valor

before(async () => {
  for (const [quem, email] of Object.entries({ admin: 'admin.demo@teste.invalid', vendedor: 'vendedor.demo@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    sessoes[quem] = c
  }
})
after(async () => {
  await svc.from('configuracoes_sistema').delete().eq('empresa_id', EMPRESA).in('chave', ['core.horario', 'horario_comercial', 'horario'])
})

describe('horário de funcionamento por dia (rota + config_salvar + banco)', () => {
  test('sem nada gravado: o padrão de sempre (seg–sex, sábado fechado)', async () => {
    atual = sessoes.admin
    const h = await ler()
    assert.equal(h.empresa.semana['6'].length, 0); assert.equal(h.empresa.semana['1'].length, 1)
  })
  test('vendedor não altera o horário (403)', async () => {
    atual = sessoes.vendedor
    assert.equal((await put({ filialId: null, horario: { semana: SEMANA } })).status, 403)
  })
  test('horário inválido é recusado (400)', async () => {
    atual = sessoes.admin
    const r = await put({ filialId: null, horario: { semana: { ...SEMANA, '1': dia('18:00', '09:00') } } })
    assert.equal(r.status, 400)
  })
  test('admin grava o sábado reduzido; o formato antigo acompanha', async () => {
    atual = sessoes.admin
    const r = await put({ filialId: null, horario: { semana: SEMANA, sla_resposta_min: 20 } })
    assert.equal(r.status, 200, JSON.stringify(r.corpo))
    assert.deepEqual((await ler()).empresa.semana['6'], dia('09:00', '13:00'))
    assert.deepEqual(await chave('horario_comercial'), { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5, 6], sla_resposta_min: 20 })
    assert.deepEqual(await chave('horario'), { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5, 6] })
    // o banco lê o mesmo horário (core_horario / dia útil derivado)
    const { data: abre } = await svc.rpc('core_abre_no_dia', { p_empresa: EMPRESA, p_filial: LOJA, p_dia: '2026-11-28' })
    assert.equal(abre, true)
  })
  test('loja com horário próprio e depois de volta ao da empresa', async () => {
    atual = sessoes.admin
    assert.equal((await put({ filialId: LOJA, horario: { semana: { ...SEMANA, '0': dia('10:00', '14:00') } } })).status, 200)
    assert.ok((await ler()).lojas.find((l) => l.id === LOJA)?.proprio)
    const { data: dom } = await svc.rpc('core_abre_no_dia', { p_empresa: EMPRESA, p_filial: LOJA, p_dia: '2026-11-29' })
    assert.equal(dom, true)
    assert.equal((await put({ filialId: LOJA, horario: null })).status, 200)
    assert.equal((await ler()).lojas.find((l) => l.id === LOJA)?.proprio, null)
  })
})

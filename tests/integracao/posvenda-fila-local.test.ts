/**
 * FILA DO PÓS-VENDA CONTRA O BANCO LOCAL DE VERDADE (npm run test:local; scripts/teste-local.sh). C7 bloco 2.
 * JM de teste da semente (empresa 1, loja 3): vendedores M1 e M2, Administrador A. As rotas reais
 * /api/pos-venda/registrar e /api/pos-venda/lead/[id] e o carregador da fila, com sessões reais; as RPCs da 1700
 * decidem. Os dados do teste são criados aqui (banco descartável) e o módulo é desligado no fim.
 */
import { test, describe, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const EMPRESA = 1, LOJA = 3
const M1 = '0e5e0000-0000-4000-8000-000000000101', M2 = '0e5e0000-0000-4000-8000-000000000102'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const sessoes: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { POST } = await import('@/app/api/pos-venda/registrar/route')
const { GET } = await import('@/app/api/pos-venda/lead/[id]/route')
const { carregarFilaPosVenda } = await import('@/lib/posvenda/carregar-fila')

const registrar = async (corpo: unknown) => {
  const r = await POST(new Request('http://local/api', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }))
  return { status: r.status, corpo: await r.json() as Record<string, unknown> }
}
const lerLead = async (id: number) => {
  const r = await GET(new Request('http://local/api'), { params: Promise.resolve({ id: String(id) }) })
  return { status: r.status, corpo: await r.json() as { passos: { passo: string; status: string }[]; notas: { nota: number }[]; chamados: unknown[] } }
}
const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T }

let negocio = 0
const acomp: number[] = []
const { diaNoFuso, instanteLocal, somarDias } = await import('@/lib/datas')
const HOJE = diaNoFuso(new Date(), 'America/Sao_Paulo')
const diaTxt = (n: number) => somarDias(HOJE, n)
const dia = (n: number) => instanteLocal(diaTxt(n), '12:00', 'America/Sao_Paulo')

before(async () => {
  for (const [quem, email] of Object.entries({ m1: 'vendedor.matriz1@teste.invalid', m2: 'vendedor.matriz2@teste.invalid', admin: 'admin.a@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    sessoes[quem] = c
  }
  ok(await svc.from('empresa_modulos').upsert({ empresa_id: EMPRESA, modulo: 'posvenda', ativo: true }, { onConflict: 'empresa_id,modulo' }).select('modulo'))
  const cad = ok(await svc.from('posvenda_cadencias').insert({ empresa_id: EMPRESA, nome: 'Régua da fila' }).select('id').single()) as { id: number }
  const passos = ok(await svc.from('posvenda_cadencia_passos').insert([
    { empresa_id: EMPRESA, cadencia_id: cad.id, ordem: 1, dia_offset: 1, tipo_acao: 'whatsapp', titulo: 'Chegou bem?', roteiro: 'Oi {{nome}}, o {{produto}} chegou bem?' },
    { empresa_id: EMPRESA, cadencia_id: cad.id, ordem: 2, dia_offset: 7, tipo_acao: 'pesquisa', titulo: 'Experiência' },
    { empresa_id: EMPRESA, cadencia_id: cad.id, ordem: 3, dia_offset: 30, tipo_acao: 'ligacao', titulo: 'Tudo certo?' },
  ]).select('id, ordem')) as { id: number; ordem: number }[]
  const ct = ok(await svc.from('contatos').insert({ empresa_id: EMPRESA, filial_id: LOJA, nome: 'Ana Paula Fila', telefone: '11987654321' }).select('id').single()) as { id: number }
  const neg = ok(await svc.from('negocios').insert({ empresa_id: EMPRESA, filial_id: LOJA, contato_id: ct.id, funil_id: 1, etapa_id: 18, status: 'aberto', responsavel_id: M1,
    dados: { _lead: { ativo: true }, produto_interessado: 'iPhone 15', venda: { data: diaTxt(-8), categoria_id: null, condicao: 'seminovo', valor: 5000 } } }).select('id').single()) as { id: number }
  negocio = neg.id
  const jor = ok(await svc.from('posvenda_jornadas').insert({ empresa_id: EMPRESA, filial_id: LOJA, contato_id: ct.id, negocio_id: negocio, cadencia_id: cad.id, ancora_em: dia(-8).toISOString() }).select('id').single()) as { id: number }
  const linhas = [
    { passo: passos[0].id, quando: dia(-2), resp: M1 },   // atrasado
    { passo: passos[1].id, quando: dia(0), resp: M1 },    // hoje (pesquisa)
    { passo: passos[2].id, quando: dia(3), resp: M2 },    // próximo, de outra pessoa
  ]
  for (const l of linhas) {
    const a = ok(await svc.from('posvenda_acompanhamentos').insert({ empresa_id: EMPRESA, filial_id: LOJA, jornada_id: jor.id, passo_id: l.passo, contato_id: ct.id,
      negocio_id: negocio, responsavel_id: l.resp, origem_responsavel: 'vendedor', previsto_para: l.quando.toISOString() }).select('id').single()) as { id: number }
    acomp.push(a.id)
  }
})
after(async () => {
  await svc.from('empresa_modulos').update({ ativo: false }).eq('empresa_id', EMPRESA).eq('modulo', 'posvenda').select('modulo')
})

describe('fila do pós-venda (rotas + RPCs + banco)', () => {
  test('a fila do vendedor: só os dele, com cliente, produto, passo, dias da venda e a mensagem pronta', async () => {
    const { itens } = await carregarFilaPosVenda(sessoes.m1, { empresaId: EMPRESA, fuso: 'America/Sao_Paulo', rotuloUsado: 'Seminovo', so: M1 })
    const meus = itens.filter((i) => acomp.includes(i.id))
    assert.deepEqual(meus.map((i) => i.grupo), ['atrasados', 'hoje'])
    const [a] = meus
    assert.equal(a.cliente, 'Ana Paula Fila')
    assert.equal(a.produto, 'iPhone 15 · Seminovo')
    assert.equal(a.passo, 'D+1 Chegou bem?')
    assert.equal(a.diasDaVenda, 8)
    assert.equal(a.mensagem, 'Oi Ana, o iPhone 15 chegou bem?')
  })

  test('o botão do WhatsApp: sem conversa → wa.me; conversa no canal da loja → Nexus com a mensagem; janela fechada → modelo', async () => {
    const botao = async () => {
      const { itens } = await carregarFilaPosVenda(sessoes.m1, { empresaId: EMPRESA, fuso: 'America/Sao_Paulo', rotuloUsado: 'Seminovo', so: M1 })
      return itens.find((i) => i.id === acomp[0])!.contato
    }
    // 1. sem conversa no WhatsApp da loja
    const sem = await botao()
    assert.equal(sem.modo, 'externo'); assert.ok(sem.href?.startsWith('https://wa.me/5511987654321?text=')); assert.match(sem.aviso ?? '', /não fica registrada/)
    // 2. conversa no WhatsApp conectado da loja, cliente escreveu há 1 hora
    const canal = ok(await svc.from('canais').insert({ empresa_id: EMPRESA, filial_id: LOJA, tipo: 'whatsapp', external_id: 'teste-local-posvenda', status: 'ativo', via: 'pagina' }).select('id').single()) as { id: number }
    const { data: ct } = await svc.from('negocios').select('contato_id').eq('id', negocio).single()
    const conv = ok(await svc.from('conversas').insert({ empresa_id: EMPRESA, filial_id: LOJA, contato_id: ct!.contato_id, canal_id: canal.id,
      ultima_recebida_at: new Date(Date.now() - 3600_000).toISOString(), ultima_mensagem_at: new Date().toISOString() }).select('id').single()) as { id: number }
    const nx = await botao()
    assert.equal(nx.modo, 'nexus')
    assert.equal(nx.href, `/comunicacao?c=${conv.id}&texto=${encodeURIComponent('Oi Ana, o iPhone 15 chegou bem?')}`)
    // 3. a mesma conversa, cliente escreveu há 30 horas: janela de 24 h fechada
    ok(await svc.from('conversas').update({ ultima_recebida_at: new Date(Date.now() - 30 * 3600_000).toISOString() }).eq('id', conv.id).select('id'))
    const md = await botao()
    assert.equal(md.modo, 'modelo'); assert.equal(md.href, `/comunicacao?c=${conv.id}&modelo=posvenda&cat=UTILITY`)
    // canal desconectado: volta para o wa.me
    ok(await svc.from('canais').update({ status: 'desconectado' }).eq('id', canal.id).select('id'))
    assert.equal((await botao()).modo, 'externo')
  })

  test('outro vendedor não registra o passo de M1 (403); M1 registra (feito)', async () => {
    atual = sessoes.m2
    assert.equal((await registrar({ acompanhamento: acomp[0], acao: 'feito' })).status, 403)
    atual = sessoes.m1
    const r = await registrar({ acompanhamento: acomp[0], acao: 'feito' })
    assert.equal(r.status, 200)
    assert.equal((r.corpo.resultado as { status: string }).status, 'feito')
    assert.equal((await registrar({ acompanhamento: acomp[0], acao: 'feito' })).status, 409)
  })

  test('pular sem motivo: 422; reagendar sem data: 422', async () => {
    atual = sessoes.m1
    assert.equal((await registrar({ acompanhamento: acomp[1], acao: 'pular' })).status, 422)
    assert.equal((await registrar({ acompanhamento: acomp[1], acao: 'reagendar' })).status, 422)
  })

  test('nota no passo de pesquisa: grava o NPS, conclui o passo e, nota baixa, abre o chamado', async () => {
    atual = sessoes.m1
    const r = await registrar({ acompanhamento: acomp[1], acao: 'nota', nota: 4, comentario: 'demorou' })
    assert.equal(r.status, 200)
    assert.ok((r.corpo.resultado as { chamado_id: number | null }).chamado_id)
  })

  test('aba do lead: a régua inteira (também o passo de M2), a nota e o chamado', async () => {
    atual = sessoes.m1
    const r = await lerLead(negocio)
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.passos.map((p) => `${p.passo}:${p.status}`), ['D+1 Chegou bem?:feito', 'D+7 Experiência:feito', 'D+30 Tudo certo?:pendente'])
    assert.deepEqual(r.corpo.notas.map((n) => n.nota), [4])
    assert.equal(r.corpo.chamados.length, 1)
  })

  test('módulo desligado: as duas rotas respondem 403 modulo_desligado', async () => {
    ok(await svc.from('empresa_modulos').update({ ativo: false }).eq('empresa_id', EMPRESA).eq('modulo', 'posvenda').select('modulo'))
    atual = sessoes.m1
    const r = await registrar({ acompanhamento: acomp[2], acao: 'feito' })
    assert.equal(r.status, 403); assert.equal(r.corpo.code, 'modulo_desligado')
    assert.equal((await lerLead(negocio)).status, 403)
  })
})

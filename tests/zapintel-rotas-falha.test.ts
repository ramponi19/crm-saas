/**
 * As rotas de IA do ZapIntel quando o banco falha no meio (lote de 17/10/2026):
 *
 *   2. a leitura da venda falhou → a ficha recebe "indisponível", a sugestão
 *      responde 503 (sem saber se comprou, não escolhe o ponto de retomada);
 *   3. a checagem de funil interno falhou → as rotas de IA BLOQUEIAM (503) e a
 *      tela trata como interno (esconde o botão).
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { bancoFalso } from './banco-falso'

const estado = {
  ponteErro: false,
  funil: 'nao' as 'nao' | 'sim' | 'falha',
  gerarPerfil: [] as Array<Record<string, unknown>>,
  ia: 0,
}

class FalhaFunilInterno extends Error {}
mock.module('@/lib/zapintel/ctx', {
  namedExports: {
    zapintelAcesso: async () => ({ userId: 'u', empresaId: 1, lojas: [3] }),
    lojaVisivel: () => true,
    leadDeFunilInterno: async () => {
      if (estado.funil === 'falha') throw new FalhaFunilInterno('connection reset')
      return estado.funil === 'sim'
    },
    logFalhaFunilInterno: (rota: string, empresaId: number, leadId: number, e: unknown) =>
      console.error(JSON.stringify({ evento: 'zapintel.funil_interno.falha', rota, empresa_id: empresaId, lead_id: leadId, erro: String(e) })),
    MENSAGEM_FALHA_FUNIL: 'Não foi possível confirmar se esta conversa é de funil interno. Tente de novo em instantes.',
  },
})
mock.module('@/lib/rate-limit', { namedExports: { excedeuLimiteDoUsuario: async () => false } })
mock.module('@/lib/rastreamento/db', {
  namedExports: {
    rastrDb: () => bancoFalso((c) => {
      if (c.tabela === 'zapintel_venda_lead') return estado.ponteErro ? { data: null, error: { message: 'timeout' } } : { data: null, error: null }
      return { data: null, error: null }
    }),
  },
})
mock.module('@/lib/zapintel/conversas', {
  namedExports: {
    carregarConversas: async () => ({
      analisados: [{ id: 'lead-7', messages: [], crm: {} }],
      porId: new Map([[7, { id: 7, filial_id: 3, origem: 'whatsapp', kanban_status: null }]]),
      nomeDaLoja: 'Loja Exemplo', segmento: 'varejo', indisponivel: [],
    }),
  },
})
mock.module('@/lib/zapintel/perfil', {
  namedExports: {
    marcaDaConversa: () => ({ marca: 1, mensagens: 1, transcritos: 0 }),
    lerPerfil: async () => null,
    gerarPerfil: async (o: Record<string, unknown>) => { estado.gerarPerfil.push(o); return { ok: false, status: 503, erro: 'sem IA no teste' } },
    guardarPerfil: async () => {},
  },
})
mock.module('@/lib/zapintel/ficha', { namedExports: { montarFicha: () => ({}) } })
mock.module('@/lib/zapintel/travou', { namedExports: { ondeTravou: () => ({ indice: 0 }), contextoDaSugestao: () => '' } })
mock.module('@/lib/zapintel/ia', {
  namedExports: {
    perguntarIA: async () => { estado.ia++; return { ok: false, status: 503, erro: 'sem IA no teste' } },
    iaDoCrmLigada: async () => true,
  },
})

const { POST: perfil } = await import('@/app/zapintel/api/perfil/route')
const { POST: sugestao } = await import('@/app/zapintel/api/sugestao/route')
const { GET: conversa } = await import('@/app/zapintel/api/conversa/route')

const post = (rota: (r: Request) => Promise<Response>) =>
  rota(new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead: 7 }) }))
async function semLog<T>(fn: () => Promise<T>): Promise<{ r: T; logs: string[] }> {
  const logs: string[] = []; const e0 = console.error
  console.error = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try { return { r: await fn(), logs } } finally { console.error = e0 }
}

beforeEach(() => { estado.ponteErro = false; estado.funil = 'nao'; estado.gerarPerfil = []; estado.ia = 0 })

describe('Venda que não pôde ser lida', () => {
  test('ficha: a geração recebe `indisponivel: [venda]` — nunca "não comprou" como fato — e o log registra', async () => {
    estado.ponteErro = true
    const { logs } = await semLog(() => post(perfil))
    assert.equal(estado.gerarPerfil.length, 1)
    assert.deepEqual(estado.gerarPerfil[0].indisponivel, ['venda'])
    assert.ok(logs.some((l) => l.includes('zapintel.prompt.dado_indisponivel')))
  })
  test('ficha: com a leitura certa, nada vai como indisponível', async () => {
    await post(perfil)
    assert.deepEqual(estado.gerarPerfil[0].indisponivel, [])
  })
  test('sugestão: 503 e a IA não é chamada (sem saber se comprou, não sugere)', async () => {
    estado.ponteErro = true
    const { r } = await semLog(() => post(sugestao))
    assert.equal(r.status, 503)
    assert.match(((await r.json()) as { erro: string }).erro, /confirmar se este lead já comprou/)
    assert.equal(estado.ia, 0)
  })
})

describe('Checagem de funil interno que falha: bloqueia', () => {
  for (const [nome, rota] of [['perfil', perfil], ['sugestao', sugestao]] as const) {
    test(`${nome}: 503 com mensagem clara, log JSON, e nenhuma chamada à IA`, async () => {
      estado.funil = 'falha'
      const { r, logs } = await semLog(() => post(rota))
      assert.equal(r.status, 503)
      assert.match(((await r.json()) as { erro: string }).erro, /funil interno/)
      assert.ok(logs.some((l) => l.includes('zapintel.funil_interno.falha')))
      assert.equal(estado.ia + estado.gerarPerfil.length, 0)
    })
  }
  test('conversa (a tela): trata como interno — o botão de gerar some', async () => {
    estado.funil = 'falha'
    const { r } = await semLog(() => conversa(new Request('http://x/zapintel/api/conversa?lead=7')))
    assert.equal(((await r.json()) as { funilInterno: boolean }).funilInterno, true)
  })
  test('funil interno de verdade continua 422 (sem mudança)', async () => {
    estado.funil = 'sim'
    assert.equal((await post(perfil)).status, 422)
  })
})

describe('leadDeFunilInterno (real): erro do banco lança, não devolve "não é interno"', () => {
  test('erro ao ler `leads` → FalhaFunilInterno', async () => {
    const real = await import('@/lib/zapintel/funil-interno')
    const db = bancoFalso(() => ({ data: null, error: { message: 'boom' } }))
    await assert.rejects(() => real.leadDeFunilInterno(db as never, 1, 7), real.FalhaFunilInterno)
  })
  test('erro ao ler `funis` → FalhaFunilInterno', async () => {
    const real = await import('@/lib/zapintel/funil-interno')
    const db = bancoFalso((c) => c.tabela === 'leads' ? { data: { funil_id: 3 }, error: null } : { data: null, error: { message: 'boom' } })
    await assert.rejects(() => real.leadDeFunilInterno(db as never, 1, 7), real.FalhaFunilInterno)
  })
  test('lead sem funil → false; funil interno → true', async () => {
    const real = await import('@/lib/zapintel/funil-interno')
    assert.equal(await real.leadDeFunilInterno(bancoFalso(() => ({ data: { funil_id: null }, error: null })) as never, 1, 7), false)
    const db = bancoFalso((c) => c.tabela === 'leads' ? { data: { funil_id: 3 }, error: null } : { data: { interno: true }, error: null })
    assert.equal(await real.leadDeFunilInterno(db as never, 1, 7), true)
  })
})

/**
 * Lote de estabilidade de 17/10/2026 (ver docs/ZAPINTEL-INVENTARIO-QUALIDADE-20261017.md):
 *
 *   1. a contagem do robô: falha → "indisponível", nunca "em dia"; cache de 60 s;
 *   2. dado do CRM que não pôde ser lido entra no prompt como "informação
 *      indisponível", nunca como um padrão que pareça fato;
 *   6. a tela nunca mostra TypeError, URL do Supabase ou texto do Postgres.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Lead, RawMessage } from '@/types/zapintel'

// ── dublês ──────────────────────────────────────────────────────────────────
const estado = {
  rpcChamadas: 0,
  rpc: { data: [] as unknown[], error: null as null | { message: string; code?: string } },
  leads: { data: [] as unknown[], error: null as null | { message: string } },
  lojas: [3, 6, 0],
}
mock.module('@/lib/zapintel/ctx', {
  namedExports: {
    zapintelAcesso: async () => ({ userId: 'u-1', empresaId: 1, lojas: estado.lojas }),
    lojaVisivel: (a: { lojas: number[] }, f: number | null | undefined) => a.lojas.includes(Number(f ?? 0)),
  },
})
mock.module('@/lib/rastreamento/db', {
  namedExports: {
    rastrDb: () => ({
      rpc: () => {
        estado.rpcChamadas++
        const b: Record<string, unknown> = {}
        b.order = () => b
        b.range = () => Promise.resolve(estado.rpc)
        return b
      },
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'eq']) b[m] = () => b
        b.in = () => Promise.resolve(estado.leads)
        return b
      },
    }),
  },
})
mock.module('@/lib/zapintel/conversas', {
  namedExports: {
    // A paginação real é testada em zapintel.test.ts; aqui basta uma página.
    buscarTudo: async (pagina: (de: number, ate: number) => Promise<{ data: unknown[]; error: { message: string } | null }>) => {
      const { data, error } = await pagina(0, 999)
      if (error) throw new Error(error.message)
      return data
    },
  },
})
mock.module('@/lib/zapintel/ia', {
  namedExports: { iaDoCrmLigada: async () => true, perguntarIA: async () => ({ ok: false, status: 503, erro: 'sem IA no teste' }) },
})
const sentry = { capturas: [] as Array<{ erro: unknown; ctx: { tags?: Record<string, string> } }> }
mock.module('@sentry/nextjs', {
  namedExports: { captureException: (erro: unknown, ctx: { tags?: Record<string, string> }) => { sentry.capturas.push({ erro, ctx }) } },
})

const { GET: pendentes } = await import('@/app/zapintel/api/perfil/pendentes/route')
const { limparCachePendentes, CACHE_PENDENTES_MS } = await import('@/lib/zapintel/cache-pendentes')
const { ResumoPendentes } = await import('@/components/zapintel/robo-analises')
const { contextoDoPerfil, INDISPONIVEL } = await import('@/lib/zapintel/perfil')
const { montarFicha } = await import('@/lib/zapintel/ficha')
const { mensagemDeErroDeTela, mensagemPorStatus, ehTextoTecnico, TEXTOS_DE_ERRO } = await import('@/lib/zapintel/mensagem-erro')
const { ErroDeTela } = await import('@/components/zapintel/erro-de-tela')

async function comLogs<T>(fn: () => Promise<T>): Promise<{ r: T; erros: string[]; infos: string[] }> {
  const erros: string[] = []; const infos: string[] = []
  const e0 = console.error; const l0 = console.log
  console.error = (...a: unknown[]) => { erros.push(a.map(String).join(' ')) }
  console.log = (...a: unknown[]) => { infos.push(a.map(String).join(' ')) }
  try { return { r: await fn(), erros, infos } } finally { console.error = e0; console.log = l0 }
}
const pedir = (q = '') => pendentes(new Request(`http://x/zapintel/api/perfil/pendentes${q}`))
const LINHA = { lead_id: 10, nome: 'Fulano', filial: 'Mogi', tem_ficha: false, gerado_em: null, mensagens_na_ficha: null, mensagens_agora: 4, ultima: '2026-10-16T10:00:00Z', loja_deve: true }

// ── 1. pendentes ────────────────────────────────────────────────────────────
describe('GET /zapintel/api/perfil/pendentes: falha não é "em dia"', () => {
  beforeEach(() => {
    limparCachePendentes(); sentry.capturas = []; estado.rpcChamadas = 0
    estado.rpc = { data: [LINHA], error: null }; estado.leads = { data: [{ id: 10, filial_id: 3 }], error: null }
  })

  test('timeout do banco → 200 "indisponível", log JSON e Sentry (modulo=zapintel) uma vez', async () => {
    estado.rpc = { data: [], error: { message: 'canceling statement due to statement timeout', code: '57014' } }
    const { r, erros } = await comLogs(() => pedir())
    const d = await r.json() as { indisponivel: boolean; motivo: string; semAnalise: unknown[]; desatualizadas: unknown[] }
    assert.equal(r.status, 200)
    assert.equal(d.indisponivel, true)
    assert.equal(d.motivo, 'timeout')
    assert.deepEqual([d.semAnalise.length, d.desatualizadas.length], [0, 0])
    const ev = erros.map((l) => JSON.parse(l)).filter((j) => j.evento === 'zapintel.pendentes.falha')
    assert.equal(ev.length, 1)
    assert.equal(sentry.capturas.length, 1)
    assert.equal(sentry.capturas[0].ctx.tags?.modulo, 'zapintel')
  })

  test('erro ao ler `leads` (o caso que virava "em dia") → indisponível, motivo erro_leads', async () => {
    estado.leads = { data: [], error: { message: 'connection reset' } }
    const { r } = await comLogs(() => pedir())
    const d = await r.json() as { indisponivel: boolean; motivo: string }
    assert.equal(d.indisponivel, true)
    assert.equal(d.motivo, 'erro_leads')
  })

  test('cache: a 2ª chamada em 60 s não consulta o banco e o log diz que veio do cache', async () => {
    const a = await (await pedir()).json() as { semAnalise: unknown[]; indisponivel: boolean }
    assert.equal(a.indisponivel, false)
    assert.equal(a.semAnalise.length, 1)
    const { r, infos } = await comLogs(() => pedir())
    assert.deepEqual(await r.json(), a)
    assert.equal(estado.rpcChamadas, 1, 'uma consulta só')
    assert.ok(infos.some((l) => JSON.parse(l).evento === 'zapintel.pendentes.cache'))
  })

  test('cache: passados 60 s, consulta de novo; `?atualizar=1` pula o cache', async () => {
    await pedir()
    const agora = Date.now
    Date.now = () => agora() + CACHE_PENDENTES_MS + 1
    try { await pedir() } finally { Date.now = agora }
    assert.equal(estado.rpcChamadas, 2)
    await pedir('?atualizar=1')
    assert.equal(estado.rpcChamadas, 3)
  })

  test('falha não entra no cache: a próxima chamada tenta o banco de novo', async () => {
    estado.rpc = { data: [], error: { message: 'boom' } }
    await comLogs(() => pedir())
    estado.rpc = { data: [LINHA], error: null }
    const d = await (await pedir()).json() as { indisponivel: boolean }
    assert.equal(d.indisponivel, false)
    assert.equal(estado.rpcChamadas, 2)
  })

  test('o cache é por empresa + lojas: outra combinação de lojas consulta de novo', async () => {
    await pedir()
    estado.lojas = [3]
    try { await pedir() } finally { estado.lojas = [3, 6, 0] }
    assert.equal(estado.rpcChamadas, 2)
  })
})

describe('Robô: a frase do topo', () => {
  const html = (p: Parameters<typeof ResumoPendentes>[0]) => renderToStaticMarkup(createElement(ResumoPendentes, p))
  test('indisponível → "Não foi possível verificar as análises pendentes", nunca "em dia"', () => {
    const h = html({ indisponivel: true, nNovas: 0, nAndou: 0, onTentar: () => {} })
    assert.ok(h.includes('Não foi possível verificar as análises pendentes'))
    assert.ok(!h.includes('em dia'))
    assert.ok(h.includes('Tentar de novo'))
  })
  test('contagem certa e zero → "em dia"', () => {
    assert.ok(html({ indisponivel: false, nNovas: 0, nAndou: 0 }).includes('em dia'))
  })
  test('contagem com pendências → diz quantas', () => {
    const h = html({ indisponivel: false, nNovas: 2, nAndou: 3 })
    assert.ok(h.includes('2 conversas novas') && h.includes('3'))
  })
})

// ── 2. o prompt com dado do CRM que não pôde ser lido ───────────────────────
const msg = (isStore: boolean, body: string, min: number): RawMessage => ({
  date: '2026-10-10', time: `14:${String(min).padStart(2, '0')}`, phone: '', name: '', body, mediaType: '', mediaCaption: '', quotedMessage: '', isStore,
})
const LEAD: Lead = {
  id: 'lead-9', filename: 'lead-9', contact: 'Ana Souza', phone: '5519900000000', sellerName: 'Pedro',
  messages: [msg(false, 'Oi, tem o 15?', 1), msg(true, 'Tenho sim, R$ 4.999', 2), msg(false, 'Vou ver e te falo', 3)],
  daysInactive: 2, conversationDays: 0, firstDate: '2026-10-10', lastDate: '2026-10-10', totalMessages: 3, leadMessages: 2, storeMessages: 1,
}
const FICHA = montarFicha(LEAD, { leadId: 9, filialId: 3, canal: 'whatsapp', comprou: false, valorVenda: null, diasAteVenda: null })
const prompt = (o: Partial<Parameters<typeof contextoDoPerfil>[0]>) => contextoDoPerfil({
  lead: LEAD, ficha: FICHA, travou: null, nomeDaLoja: 'Loja Exemplo', kanban: null,
  temVendaRegistrada: false, valorVenda: null, diasAteVenda: null, ...o,
})

describe('Prompt da ficha: dado do CRM que falhou vira "informação indisponível"', () => {
  test('venda ilegível: nunca "não há venda ligada" (que a IA leria como fato)', () => {
    const p = prompt({ indisponivel: ['venda'] })
    assert.ok(p.includes(`VENDA REGISTRADA NO CRM: ${INDISPONIVEL}`))
    assert.ok(!p.includes('não há venda ligada'))
  })
  test('sem falha, o fato continua como antes', () => {
    assert.ok(prompt({}).includes('não há venda ligada a este lead'))
  })
  test('valor da venda ilegível: "valor: informação indisponível", sem número inventado', () => {
    const p = prompt({ temVendaRegistrada: true, indisponivel: ['valor_venda'] })
    assert.ok(p.includes(`VENDA REGISTRADA NO CRM: sim, valor: ${INDISPONIVEL}`))
    assert.ok(!/R\$ \d/.test(p.split('=== A CONVERSA')[0]))
  })
  test('nome da empresa ilegível: "Loja: informação indisponível", não "Loja: Loja"', () => {
    const p = prompt({ nomeDaLoja: 'Loja', indisponivel: ['empresa'] })
    assert.ok(p.includes(`Loja: ${INDISPONIVEL}`))
    assert.ok(!p.includes('Loja: Loja'))
  })
  test('responsáveis ilegíveis: "Quem atendeu: informação indisponível"', () => {
    assert.ok(prompt({ indisponivel: ['responsaveis'] }).includes(`Quem atendeu: ${INDISPONIVEL}`))
  })
})

// ── 6. o que a tela diz quando algo falha ───────────────────────────────────
describe('Mensagens de erro da tela', () => {
  const CRUS = [
    'TypeError: Failed to fetch (guiuzbcqkvelqcuogxtd.supabase.co)',
    'canceling statement due to statement timeout',
    'permission denied for function zapintel_dashboard',
    'relation "public.leads" does not exist',
    'JWT expired',
  ]
  test('nenhum texto técnico passa: nem TypeError, nem URL do Supabase, nem Postgres', () => {
    for (const cru of CRUS) {
      const m = mensagemDeErroDeTela(cru)
      assert.ok(!ehTextoTecnico(m), `vazou: ${m}`)
      assert.ok(!/supabase|TypeError|statement|relation|JWT/i.test(m))
    }
  })
  test('sem rede → "Sem conexão…"; timeout → "demorou demais"; loja fora → a orientação da loja', () => {
    assert.equal(mensagemDeErroDeTela(new TypeError('Failed to fetch')), TEXTOS_DE_ERRO.semConexao)
    assert.equal(mensagemDeErroDeTela('canceling statement due to statement timeout'), TEXTOS_DE_ERRO.demorou)
    assert.equal(mensagemDeErroDeTela('loja fora do seu acesso'), TEXTOS_DE_ERRO.semAcessoLoja)
    assert.equal(mensagemDeErroDeTela('qualquer coisa'), TEXTOS_DE_ERRO.erroAoCarregar)
  })
  test('ficha por status: 403, 404, 429, 500', () => {
    assert.equal(mensagemPorStatus(403), 'Você não tem acesso a este lead.')
    assert.equal(mensagemPorStatus(404, 'conversa nao encontrada'), 'Lead não encontrado.')
    assert.equal(mensagemPorStatus(429, 'Muitas análises nesta hora. Tente de novo daqui a pouco.'), 'Muitas análises nesta hora. Tente de novo daqui a pouco.')
    assert.equal(mensagemPorStatus(429), TEXTOS_DE_ERRO.limitePorHora)
    assert.equal(mensagemPorStatus(500, 'falha ao ler a conversa: canceling statement due to statement timeout'), 'Erro ao carregar; tente novamente.')
    assert.equal(mensagemPorStatus(500), 'Erro ao carregar; tente novamente.')
  })
  test('frase em português da rota passa como está (ex.: 504 "demorou demais")', () => {
    assert.equal(mensagemPorStatus(504, 'A análise demorou demais, tente novamente'), 'A análise demorou demais, tente novamente')
  })
  test('o aviso da tela mostra a frase e o botão de tentar de novo', () => {
    const h = renderToStaticMarkup(createElement(ErroDeTela, { erro: 'TypeError: Failed to fetch (abc.supabase.co)', onTentar: () => {} }))
    assert.ok(h.includes('Sem conexão') && h.includes('Tentar de novo'))
    assert.ok(!h.includes('supabase') && !h.includes('TypeError'))
  })
})

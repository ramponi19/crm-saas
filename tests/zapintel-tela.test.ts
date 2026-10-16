/**
 * A ficha do lead não oferece gerar análise em conversa de funil interno —
 * o mesmo critério que faz `/zapintel/api/perfil` responder 422.
 *
 * O componente é renderizado de verdade (`react-dom/server`); o `.tsx` é
 * transformado pelo TypeScript do projeto (ver tests/resolver.mjs).
 *
 *   npm test
 */
import { test, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// ── a rota que manda o `funilInterno` para a tela ─────────────────────────
const estado = { interno: false, perguntas: [] as Array<[number, number]> }
mock.module('@/lib/zapintel/ctx', {
  namedExports: {
    zapintelAcesso: async () => ({ userId: 'u', empresaId: 1, lojas: [3] }),
    lojaVisivel: () => true,
    leadDeFunilInterno: async (_db: unknown, empresaId: number, leadId: number) => { estado.perguntas.push([empresaId, leadId]); return estado.interno },
    logFalhaFunilInterno: () => {},
    MENSAGEM_FALHA_FUNIL: 'Não foi possível confirmar se esta conversa é de funil interno. Tente de novo em instantes.',
  },
})
mock.module('@/lib/rastreamento/db', {
  namedExports: {
    rastrDb: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit', 'in']) q[m] = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      return { from: () => q }
    },
  },
})
mock.module('@/lib/zapintel/conversas', {
  namedExports: {
    carregarConversas: async () => ({
      analisados: [{ id: 'lead-7', messages: [], totalMessages: 0, crm: {} }],
      porId: new Map([[7, { id: 7, filial_id: 3, origem: 'whatsapp' }]]),
    }),
  },
})
mock.module('@/lib/zapintel/ficha', { namedExports: { montarFicha: () => ({}) } })
mock.module('@/lib/zapintel/travou', { namedExports: { ondeTravou: () => null } })
mock.module('@/lib/zapintel/perfil', { namedExports: { lerPerfil: async () => null, marcaDaConversa: () => ({}) } })
mock.module('@/lib/zapintel/ia', { namedExports: { iaDoCrmLigada: async () => true } })

const { GET: conversa } = await import('@/app/zapintel/api/conversa/route')
const { AnaliseDeIA } = await import('@/components/zapintel/analise-de-ia')

describe('GET /zapintel/api/conversa: funilInterno', () => {
  for (const interno of [true, false]) {
    test(`lead ${interno ? 'do funil interno' : 'normal'} → funilInterno=${interno}, pela mesma leadDeFunilInterno da rota da ficha`, async () => {
      estado.interno = interno; estado.perguntas = []
      const r = await conversa(new Request('http://x/zapintel/api/conversa?lead=7'))
      const d = await r.json() as { funilInterno: boolean }
      assert.equal(r.status, 200)
      assert.equal(d.funilInterno, interno)
      assert.deepEqual(estado.perguntas, [[1, 7]], 'a empresa vem da sessão e o lead da URL')
    })
  }
})

// ── o componente ───────────────────────────────────────────────────────────
type Props = Parameters<typeof AnaliseDeIA>[0]
const PERFIL = {
  classificacao: 'customer', score: 50, riscoPerda: 10, perfil: 'Direto', diagnostico: 'Diagnóstico de teste.',
  relato: '', sinais: [], objecoes: [], pontasSoltas: [], proximaAcao: '', proximaAcaoPorque: '', urgencia: 'low', mensagemSugerida: '',
} as unknown as NonNullable<Props['guardado']>['perfil']
const base: Props = {
  guardado: null, analisando: false, novas: 0, leadMessages: 5, storeMessages: 3,
  iaLigada: true, funilInterno: false, erroIA: '', onAnalisar: () => {},
}
const html = (p: Partial<Props>) => renderToStaticMarkup(createElement(AnaliseDeIA, { ...base, ...p }))
const BOTOES = ['Gerar análise', 'Gerar nova análise', 'Refazer análise']
const semBotao = (h: string) => { for (const b of BOTOES) assert.ok(!h.includes(b), `não podia ter "${b}"`) }

describe('AnaliseDeIA: botões de gerar', () => {
  test('lead normal sem ficha: mostra "Gerar análise"', () => {
    assert.ok(html({}).includes('Gerar análise'))
  })

  test('funil interno sem ficha: nenhum botão, e diz por quê', () => {
    const h = html({ funilInterno: true })
    semBotao(h)
    assert.ok(h.includes('funil interno'))
  })

  test('lead normal com ficha atual: mostra "Refazer análise"', () => {
    assert.ok(html({ guardado: { perfil: PERFIL, atual: true, geradoEm: '2026-10-16T18:00:00Z' } }).includes('Refazer análise'))
  })

  test('funil interno com ficha atual: a ficha aparece, "Refazer análise" não', () => {
    const h = html({ funilInterno: true, guardado: { perfil: PERFIL, atual: true, geradoEm: '2026-10-16T18:00:00Z' } })
    semBotao(h)
    assert.ok(h.includes('Diagnóstico de teste.'))
  })

  test('lead normal com ficha desatualizada: mostra "Gerar nova análise"', () => {
    assert.ok(html({ novas: 3, guardado: { perfil: PERFIL, atual: false, geradoEm: '2026-10-16T18:00:00Z' } }).includes('Gerar nova análise'))
  })

  test('funil interno com ficha desatualizada: nem aviso de nova análise, nem botão', () => {
    const h = html({ funilInterno: true, novas: 3, guardado: { perfil: PERFIL, atual: false, geradoEm: '2026-10-16T18:00:00Z' } })
    semBotao(h)
    assert.ok(!h.includes('Nova análise disponível'))
  })

  test('IA desligada (comportamento de antes, intacto): sem botão e com o aviso', () => {
    const h = html({ iaLigada: false })
    semBotao(h)
    assert.ok(h.includes('A IA do CRM está desligada.'))
  })
})

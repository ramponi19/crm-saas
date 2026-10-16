/**
 * As rotas de IA do ZapIntel, chamadas de verdade (o handler do Next), com o
 * acesso e o banco simulados. É aqui que se prova a ORDEM das barreiras:
 * empresa sem ZapIntel → 403, entrada ruim → 400, lead de outra loja → 404
 * (igual a inexistente), funil interno → 422, teto → 429 — tudo ANTES de
 * qualquer chamada paga ao provedor.
 *
 * O acesso real (quem vê qual loja) é testado no banco:
 * supabase/testes/zapintel_acesso.sql.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

type Acesso = { userId: string; empresaId: number; lojas: number[] } | null
const estado = {
  acesso: { userId: 'u-vend', empresaId: 1, lojas: [3] } as Acesso,
  lead: { id: 100, filial_id: 3 },
  interno: false,
  estourou: false,
  chamadasIA: 0,
  guardado: null as null | { atual: boolean },
}

mock.module('@/lib/zapintel/ctx', {
  namedExports: {
    zapintelAcesso: async () => estado.acesso,
    lojaVisivel: (a: { lojas: number[] }, f: number | null | undefined) => a.lojas.includes(Number(f ?? 0)),
    leadDeFunilInterno: async () => estado.interno,
    logFalhaFunilInterno: () => {},
    MENSAGEM_FALHA_FUNIL: 'Não foi possível confirmar se esta conversa é de funil interno. Tente de novo em instantes.',
  },
})
mock.module('@/lib/rate-limit', { namedExports: { excedeuLimiteDoUsuario: async () => estado.estourou } })
mock.module('@/lib/rastreamento/db', {
  namedExports: {
    rastrDb: () => {
      const vazio: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit', 'in']) vazio[m] = () => vazio
      vazio.maybeSingle = async () => ({ data: null, error: null })
      return { from: () => vazio }
    },
  },
})
mock.module('@/lib/zapintel/conversas', {
  namedExports: {
    carregarConversas: async () => ({
      analisados: [{ id: `lead-${estado.lead.id}`, messages: [], crm: { filialId: estado.lead.filial_id } }],
      porId: new Map([[estado.lead.id, { id: estado.lead.id, filial_id: estado.lead.filial_id, origem: 'whatsapp', kanban_status: null }]]),
      nomeDaLoja: 'Loja', segmento: 'varejo', indisponivel: [],
    }),
  },
})
mock.module('@/lib/zapintel/perfil', {
  namedExports: {
    marcaDaConversa: () => ({ marca: 1, mensagens: 1, transcritos: 0 }),
    lerPerfil: async () => estado.guardado && { ...estado.guardado, perfil: {}, geradoEm: '', modelo: null },
    gerarPerfil: async () => { estado.chamadasIA++; return { ok: false, status: 503, erro: 'sem IA no teste' } },
    guardarPerfil: async () => {},
  },
})
mock.module('@/lib/zapintel/ficha', { namedExports: { montarFicha: () => ({}) } })
mock.module('@/lib/zapintel/travou', {
  namedExports: { ondeTravou: () => ({ indice: 0 }), contextoDaSugestao: () => '' },
})
mock.module('@/lib/zapintel/ia', {
  namedExports: { perguntarIA: async () => { estado.chamadasIA++; return { ok: false, status: 503, erro: 'sem IA no teste' } } },
})

const { POST: perfil } = await import('@/app/zapintel/api/perfil/route')
const { POST: sugestao } = await import('@/app/zapintel/api/sugestao/route')

const pedir = (rota: (r: Request) => Promise<Response>, corpo: string) =>
  rota(new Request('http://x/rota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo }))

for (const [nome, rota] of [['perfil', perfil], ['sugestao', sugestao]] as const) {
  describe(`POST /zapintel/api/${nome}`, () => {
    beforeEach(() => {
      estado.acesso = { userId: 'u-vend', empresaId: 1, lojas: [3] }
      estado.lead = { id: 100, filial_id: 3 }
      estado.interno = false; estado.estourou = false; estado.chamadasIA = 0
    })

    test('empresa sem o ZapIntel: 403 e nenhuma IA', async () => {
      estado.acesso = null
      const r = await pedir(rota, '{"lead":100}')
      assert.equal(r.status, 403); assert.equal(estado.chamadasIA, 0)
    })

    for (const corpo of ['null', '{}', '{"lead":"abc"}', '{"lead":-1}', '{"lead":1.5}', '{"lead":99999999999999999999}', 'não é json']) {
      test(`entrada inválida ${corpo}: 400 (corpo null dava 500)`, async () => {
        const r = await pedir(rota, corpo)
        assert.equal(r.status, 400); assert.equal(estado.chamadasIA, 0)
      })
    }

    test('vendedor pedindo lead de OUTRA loja: 404, igual a inexistente', async () => {
      estado.lead = { id: 100, filial_id: 6 }
      const r = await pedir(rota, '{"lead":100}')
      assert.equal(r.status, 404); assert.equal(estado.chamadasIA, 0)
    })

    test('lead de funil interno: 422, sem IA', async () => {
      estado.interno = true
      const r = await pedir(rota, '{"lead":100}')
      assert.equal(r.status, 422); assert.equal(estado.chamadasIA, 0)
    })

    test('teto da hora estourado: 429, sem IA', async () => {
      estado.estourou = true
      const r = await pedir(rota, '{"lead":100}')
      assert.equal(r.status, 429); assert.equal(estado.chamadasIA, 0)
    })

    test('tudo certo: chega ao provedor (uma chamada)', async () => {
      const r = await pedir(rota, '{"lead":100}')
      assert.equal(estado.chamadasIA, 1); assert.equal(r.status, 503)
    })
  })
}

test('perfil: "forcar" só vale como booleano (a string "false" era verdadeira e furava o cache)', async () => {
  estado.acesso = { userId: 'u', empresaId: 1, lojas: [3] }; estado.lead = { id: 100, filial_id: 3 }
  estado.interno = false; estado.estourou = false; estado.guardado = { atual: true }

  estado.chamadasIA = 0
  const doCache = await pedir(perfil, '{"lead":100,"forcar":"false"}')
  assert.equal(doCache.status, 200); assert.equal((await doCache.json()).doCache, true); assert.equal(estado.chamadasIA, 0)

  estado.chamadasIA = 0
  await pedir(perfil, '{"lead":100,"forcar":true}')
  assert.equal(estado.chamadasIA, 1, 'forcar:true ignora o guardado')
  estado.guardado = null
})

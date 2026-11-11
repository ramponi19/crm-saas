/**
 * NÚMERO SÓ DE CONSULTA E O RECORTE NA PRIMEIRA LINHA (10/11/2026, pedido do Lucas).
 *
 * No smoke de 10/11 o Assistente escreveu "2.238 leads de Mogi Guaçu" sem
 * consultar nada. Regra: contagem, valor ou percentual só com ferramenta
 * chamada na mesma resposta. Aqui: a régua (`numeros.ts`), com respostas
 * típicas das perguntas de contagem, e o laço do chat com um modelo falso —
 * a resposta sem consulta que afirma número não chega à tela.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numerosAfirmados, semFundamento, semNumeros, trocarTrechos } from '@/lib/assistente/numeros'
import { respostaDoChat } from '@/lib/assistente/chat-dados'
import { rotuloDaRede } from '@/lib/assistente/recorte'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── a régua ──────────────────────────────────────────────────────────────────

test('respostas às perguntas de contagem: o número é pego', () => {
  const casos: [string, string][] = [
    ['Quantos leads novos entraram este mês?', 'Em novembro entraram 240 leads na loja Mogi Guaçu.'],
    ['Quantos estão esperando resposta?', 'Há 547 leads esperando resposta da loja.'],
    ['Quantos leads tem Mogi?', 'Os dados disponíveis são só da loja Mogi Guaçu (2.238 leads de 01/01 a 10/11/2026).'],
    ['Quanto vendemos no mês?', 'Foram R$ 89,6 mil em 15 vendas.'],
    ['Qual a conversão?', 'A conversão ficou em 2,5% no período.'],
    ['Quantas mensagens hoje?', '1.544 mensagens recebidas e 1.918 enviadas.'],
    ['E de Instagram?', 'O Instagram trouxe 48 leads novos.'],
    ['Faturamento?', 'O faturamento foi de 89 mil.'],
  ]
  for (const [pergunta, resposta] of casos) {
    assert.ok(numerosAfirmados(resposta).length > 0, `"${pergunta}" → não pegou número em: ${resposta}`)
  }
})

test('o que não é contagem passa: datas, horas, aparelhos, parcelas, passos', () => {
  const livres = [
    'Abra **Leads** e clique no lead. Passo 1: escolha a etapa. Passo 2: salve.',
    'A Daiane quer o iPhone 17 Pro Max e o 18 Pro em 18x; ela vem em 13/10 às 11h30.',
    'O relatório fica em **Relatórios → Vendas**, filtrando de 01/11 a 10/11.',
    'Mande: "Oi, Ana! O 15 Pro Max está separado para você até 11:30."',
  ]
  for (const t of livres) assert.deepEqual(numerosAfirmados(t), [], t)
})

test('semNumeros troca só o número afirmado', () => {
  assert.equal(semNumeros('Há 547 leads esperando, desde 03/08.'), 'Há [número não consultado] esperando, desde 03/08.')
})

test('o rótulo da rede', () => {
  assert.equal(rotuloDaRede('JM Store Importados'), 'Rede JM')
})

// ── o laço do chat, com um modelo falso ──────────────────────────────────────

type Bloco = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
type Rodada = Bloco[]

/** Cliente falso: cada chamada devolve a próxima rodada roteirizada e guarda o que recebeu. */
function falso(rodadas: Rodada[]) {
  const recebidas: unknown[][] = []
  let i = 0
  const cliente = {
    messages: {
      stream(params: { messages: unknown[] }) {
        recebidas.push([...params.messages])
        const conteudo = rodadas[i++] ?? [{ type: 'text', text: '(sem roteiro)' }]
        const ouvintes: ((d: string) => void)[] = []
        return {
          on(ev: string, fn: (d: string) => void) { if (ev === 'text') ouvintes.push(fn); return this },
          async finalMessage() {
            for (const b of conteudo) if (b.type === 'text') for (const o of ouvintes) o(b.text)
            return {
              content: conteudo,
              stop_reason: conteudo.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            }
          },
        }
      },
    },
  }
  return { cliente: cliente as never, recebidas, chamadas: () => i }
}

async function conversar(rodadas: Rodada[], pergunta: string, resultado = '{"erro":"sem dado"}') {
  const f = falso(rodadas)
  const nada = {} as SupabaseClient
  const r = respostaDoChat({
    db: nada, svc: nada, cliente: f.cliente, executor: async () => resultado,
    recorte: { alcance: [1, 2, 0], loja: null, rotulo: 'Rede JM', escolheLoja: true },
    acesso: { empresaId: 1, userId: 'u', nome: 'Teste', papel: 'owner', soMinhasVendas: false, soMeusLeads: false, verFinanceiro: true },
    turnos: [{ role: 'user', text: pergunta }],
    modelo: 'claude-falso', empresa: 'JM Store Importados', preset: null, lojas: ['Mogi Guaçu', 'Jaguariúna'],
    tela: null, extra: null, fuso: 'America/Sao_Paulo', registrar: async () => {},
  })
  const corpo = await r.text()
  const eventos = corpo.split('\n').filter(Boolean).map((l) => JSON.parse(l) as { t: string; v: string })
  return { f, texto: eventos.filter((e) => e.t === 'txt').map((e) => e.v).join(''), eventos }
}

// O executor falso devolve `resultado` (o que a ferramenta teria trazido do banco).
const CONSULTA: Bloco = { type: 'tool_use', id: 't1', name: 'leads_numeros', input: {} }

test('pergunta de contagem respondida SEM consulta: o número não chega à tela, o modelo é mandado consultar', async () => {
  const { f, texto, eventos } = await conversar([
    [{ type: 'text', text: '**Rede JM · agora**\nHá 2.238 leads na rede.' }],
    [{ type: 'text', text: 'Vou consultar.' }, CONSULTA],
    [{ type: 'text', text: '**Rede JM · agora**\nNão consegui ler esse dado agora.' }],
  ], 'Quantos leads temos?')
  assert.equal(f.chamadas(), 3)
  assert.ok(!texto.includes('2.238'), `o número inventado chegou à tela: ${texto}`)
  assert.ok(eventos.some((e) => e.t === 'tool'), 'a consulta foi feita')
  // A 2ª chamada levou o aviso do sistema.
  const segunda = JSON.stringify(f.recebidas[1])
  assert.match(segunda, /verificação automática do sistema/)
})

test('o modelo insiste sem consultar: o número sai trocado', async () => {
  const { f, texto } = await conversar([
    [{ type: 'text', text: '**Rede JM · agora**\nSão 547 leads esperando.' }],
    [{ type: 'text', text: '**Rede JM · agora**\nSão 547 leads esperando, confirmo.' }],
  ], 'Quantos esperando?')
  assert.equal(f.chamadas(), 2)
  assert.ok(!/547/.test(texto), texto)
  assert.match(texto, /\[número não consultado\]/)
})

test('número DEPOIS de consulta na mesma resposta: passa ao vivo', async () => {
  const { f, texto } = await conversar([
    [{ type: 'text', text: 'Consultando.' }, CONSULTA],
    [{ type: 'text', text: '**Rede JM · 01/11 a 10/11**\nEntraram 240 leads.' }],
  ], 'Quantos leads entraram no mês?', JSON.stringify({ total: 240, grupos: [{ grupo: 'whatsapp', leads: 191 }, { grupo: 'instagram', leads: 49 }] }))
  assert.equal(f.chamadas(), 2)
  assert.match(texto, /240 leads/)
})

test('ajuda de uso sem número: uma chamada, texto intacto', async () => {
  const ajuda = '**Rede JM · agora**\nAbra **Leads**, clique no lead e mude a etapa. Passo 1: …'
  const { f, texto } = await conversar([[{ type: 'text', text: ajuda }]], 'Como mudo a etapa?')
  assert.equal(f.chamadas(), 1)
  assert.equal(texto, ajuda)
})

test('o recorte da tela vai nas instruções', async () => {
  // O prompt é o `system` da chamada; o falso não o guarda, então confere pelo código-fonte da instrução.
  const { readFileSync } = await import('node:fs')
  const fonte = readFileSync('lib/assistente/chat-dados.ts', 'utf8')
  assert.match(fonte, /A PRIMEIRA LINHA de toda resposta é o recorte usado/)
  assert.match(fonte, /NÚMERO SÓ DE CONSULTA/)
})

// ── fundamento: o número tem de estar nos resultados desta resposta ─────────

test('fundamento: número que a ferramenta trouxe passa; inventado não', () => {
  const r = [JSON.stringify({ recorte: 'Mogi Guaçu', encontrados: 547, mostrando: 40, leads: [{ esperando_loja: true }, { esperando_loja: false }] })]
  assert.deepEqual(semFundamento('Há 547 leads esperando.', r), [])
  assert.deepEqual(semFundamento('Os dados são de Mogi (2.238 leads).', r), ['2.238 leads'])
})

test('fundamento: soma direta, total de campo numa lista, contagem de itens e arredondamento', () => {
  const r = [JSON.stringify({ grupos: [{ grupo: 'whatsapp', leads: 191, compraram: 6 }, { grupo: 'instagram', leads: 48, compraram: 0 }, { grupo: 'messenger', leads: 1, compraram: 0 }] })]
  assert.deepEqual(semFundamento('Entraram 240 leads e 6 vendas.', r), [], 'soma do campo leads')
  assert.deepEqual(semFundamento('WhatsApp com 191 leads e Instagram com 48 leads: 239 leads.', r), [], 'soma de dois')
  const v = [JSON.stringify({ totais: { vendas: 15, faturamento: 89612.4, margem: '33%' } })]
  assert.deepEqual(semFundamento('Foram R$ 89,6 mil em 15 vendas, margem de 33%.', v), [])
  assert.deepEqual(semFundamento('Foram R$ 95 mil.', v), ['R$ 95 mil'])
  const l = [JSON.stringify({ leads: [{ esperando_loja: true }, { esperando_loja: true }, { esperando_loja: false }] })]
  assert.deepEqual(semFundamento('Destes, 2 leads estão esperando.', l), [], 'contagem de itens com o campo')
})

test('fundamento: percentual calculado pelo modelo (não é soma direta) não passa', () => {
  const r = [JSON.stringify({ total: 240, grupos: [{ leads: 191 }, { leads: 49 }] })]
  assert.deepEqual(semFundamento('O WhatsApp concentra 80% da entrada.', r), ['80%'])
})

test('trocarTrechos troca só o que não tem fundamento', () => {
  assert.equal(trocarTrechos('Há 547 leads; 2.238 leads no total.', ['2.238 leads']), 'Há 547 leads; [número não consultado] no total.')
})

test('consultou, mas inventou (o caso do 2.238): sai da tela, o modelo corrige', async () => {
  const resultado = JSON.stringify({ recorte: 'Mogi Guaçu', encontrados: 0 })
  const { f, texto, eventos } = await conversar([
    [{ type: 'text', text: 'Procurando.' }, CONSULTA],
    [{ type: 'text', text: '**Mogi Guaçu · 01/01 a 10/11**\nNenhum em Jaguariúna; Mogi tem 2.238 leads.' }],
    [{ type: 'text', text: '**Mogi Guaçu · 01/01 a 10/11**\nNenhum lead em Jaguariúna.' }],
  ], 'Leads de Jaguariúna?', resultado)
  assert.equal(f.chamadas(), 3)
  assert.ok(eventos.some((e) => e.t === 'troca'), 'a resposta sem fundamento saiu da tela')
  // O que a tela mostra no fim: o último "troca" e o texto depois dele.
  let tela = ''
  for (const e of eventos) { if (e.t === 'troca') tela = e.v; else if (e.t === 'txt') tela += e.v }
  assert.ok(!tela.includes('2.238'), tela)
  assert.match(tela, /Nenhum lead em Jaguariúna/)
  assert.match(JSON.stringify(f.recebidas[2]), /não aparecem nos resultados/)
  void texto
})

test('consultou, inventou e insistiu: o número fica "[número não consultado]"', async () => {
  const { eventos } = await conversar([
    [{ type: 'text', text: 'Procurando.' }, CONSULTA],
    [{ type: 'text', text: '**Rede JM · agora**\nSão 2.238 leads.' }],
    [{ type: 'text', text: '**Rede JM · agora**\nSão 2.238 leads, confirmo.' }],
  ], 'Quantos leads?', JSON.stringify({ encontrados: 3 }))
  let tela = ''
  for (const e of eventos) { if (e.t === 'troca') tela = e.v; else if (e.t === 'txt') tela += e.v }
  assert.ok(!tela.includes('2.238'), tela)
  assert.match(tela, /\[número não consultado\]/)
})

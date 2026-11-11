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
import { numerosAfirmados, semNumeros } from '@/lib/assistente/numeros'
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

async function conversar(rodadas: Rodada[], pergunta: string) {
  const f = falso(rodadas)
  const nada = {} as SupabaseClient
  const r = respostaDoChat({
    db: nada, svc: nada, cliente: f.cliente,
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

// Ferramenta que o executor não conhece: devolve erro sem tocar no banco.
const CONSULTA: Bloco = { type: 'tool_use', id: 't1', name: 'ferramenta_de_teste', input: {} }

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
  ], 'Quantos leads entraram no mês?')
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

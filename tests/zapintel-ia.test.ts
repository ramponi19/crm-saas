/**
 * O que sai do ZapIntel para a IA: máscara de dado pessoal, só o primeiro
 * nome, o gabarito inventado, o provedor único e o contador por hora que não
 * pode ficar cego calado. Sem rede: o SDK da Anthropic, o banco e o Sentry são
 * simulados.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Lead, RawMessage } from '@/types/zapintel'

// ── simulações ──────────────────────────────────────────────────────────────

const sdk = {
  opcoes: [] as Array<Record<string, unknown>>,
  pedidos: [] as Array<Record<string, unknown>>,
  responder: async (): Promise<unknown> => ({
    stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 },
  }),
}
class APIError extends Error { status?: number; constructor(status?: number, m = 'erro') { super(m); this.status = status } }
class APIConnectionError extends APIError {}
class APIConnectionTimeoutError extends APIConnectionError { constructor() { super(undefined, 'Request timed out.') } }
class APIUserAbortError extends APIError { constructor() { super(undefined, 'Request was aborted.') } }
class AnthropicFalso {
  static APIError = APIError
  static APIConnectionError = APIConnectionError
  static APIConnectionTimeoutError = APIConnectionTimeoutError
  static APIUserAbortError = APIUserAbortError
  messages = { create: async (p: Record<string, unknown>) => { sdk.pedidos.push(p); return sdk.responder() } }
  constructor(o: Record<string, unknown>) { sdk.opcoes.push(o) }
}
mock.module('@anthropic-ai/sdk', { defaultExport: AnthropicFalso })

const cfg = { atual: { ativo: true, modelo: '' as string | null } }
/** Cada linha que `perguntarIA` grava em `assistente_uso` (item 4 de 17/10). */
const usos: Array<Record<string, unknown>> = []
mock.module('@/lib/supabase/service', {
  namedExports: {
    createServiceClient: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) q[m] = () => q
      q.maybeSingle = async () => ({ data: cfg.atual, error: null })
      q.insert = async (linha: Record<string, unknown>) => { usos.push(linha); return { error: null } }
      return { from: () => q }
    },
  },
})

const sentry = { capturas: [] as Array<{ erro: unknown; ctx: { tags?: Record<string, string> } }> }
mock.module('@sentry/nextjs', {
  namedExports: { captureException: (erro: unknown, ctx: { tags?: Record<string, string> }) => { sentry.capturas.push({ erro, ctx }) } },
})

process.env.ANTHROPIC_API_KEY = 'chave-de-teste'

const { mascararDadosPessoais, nomeParaIA } = await import('@/lib/zapintel/mascara')
const { contextoDoPerfil, GABARITO } = await import('@/lib/zapintel/perfil')
const { contextoDaSugestao, ondeTravou } = await import('@/lib/zapintel/travou')
const { montarFicha } = await import('@/lib/zapintel/ficha')
const ia = await import('@/lib/zapintel/ia')
const { excedeuLimiteDoUsuario } = await import('@/lib/rate-limit')
const { bancoFalso } = await import('./banco-falso')

/** Captura o console.error durante `fn` (os logs JSON são o que se testa). */
async function comLogs<T>(fn: () => Promise<T>): Promise<{ r: T; logs: string[] }> {
  const logs: string[] = []
  const antes = console.error
  console.error = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try { return { r: await fn(), logs } } finally { console.error = antes }
}

// ── 1. a máscara, um tipo de dado por vez ──────────────────────────────────

describe('mascararDadosPessoais', () => {
  const casos: Array<[string, string, string]> = [
    ['CPF formatado', 'meu cpf é 529.982.247-25 ok', 'meu cpf é [CPF] ok'],
    ['CPF só dígitos', 'segue 52998224725 pro cadastro', 'segue [CPF] pro cadastro'],
    ['CNPJ formatado', 'CNPJ da empresa 11.222.333/0001-81', 'CNPJ da empresa [CNPJ]'],
    ['CNPJ só dígitos', 'nota no 11222333000181 por favor', 'nota no [CNPJ] por favor'],
    ['RG formatado', 'RG: 12.345.678-9', 'RG: [RG]'],
    ['RG anunciado, só dígitos', 'rg 123456789 emitido em SP', 'rg [RG] emitido em SP'],
    ['CNH', 'CNH 12345678900 válida', 'CNH [CNH] válida'],
    ['CEP formatado', 'entrega no 13840-000', 'entrega no [CEP]'],
    ['CEP anunciado, só dígitos', 'CEP: 13840000', 'CEP: [CEP]'],
    ['e-mail', 'manda pra mariana.lima@exemplo.com.br', 'manda pra [E-MAIL]'],
    ['telefone +55 com espaço', 'liga no +55 19 98888-7777', 'liga no [TELEFONE]'],
    ['telefone +55 colado', 'whats +5519988887777', 'whats [TELEFONE]'],
    ['telefone (DDD)', 'meu número (19) 98888-7777', 'meu número [TELEFONE]'],
    ['telefone DDD sem separador', 'chama no 19988887777', 'chama no [TELEFONE]'],
    ['celular sem DDD', 'é 98888-7777', 'é [TELEFONE]'],
    ['fixo com DDD', 'fixo (19) 3456-7890', 'fixo [TELEFONE]'],
    ['chave Pix aleatória', 'pix 123e4567-e89b-12d3-a456-426614174000', 'pix [CHAVE PIX]'],
    ['chave Pix CPF', 'chave pix: 529.982.247-25', 'chave pix: [CPF]'],
    ['chave Pix e-mail', 'chave pix: loja@exemplo.com', 'chave pix: [E-MAIL]'],
    ['chave Pix telefone', 'pix: +55 19 98888-7777', 'pix: [TELEFONE]'],
    ['cartão com espaços', 'cartão 4111 1111 1111 1111 vence 08/29', 'cartão [CARTÃO] vence 08/29'],
    ['cartão com hífen', '5555-5555-5555-4444', '[CARTÃO]'],
    ['cartão corrido', '4111111111111111', '[CARTÃO]'],
    ['Amex 4-6-5', 'amex 3782 822463 10005', 'amex [CARTÃO]'],
    ['IMEI não vira cartão', 'IMEI 356938035643809', 'IMEI [IMEI]'],
    ['endereço com vírgula, nº e apto', 'Rua das Palmeiras, 742, apto 31, Campinas', 'Rua das Palmeiras, [Nº], apto [COMPLEMENTO], Campinas'],
    ['avenida com nº', 'Av. Brasil nº 1500 - Mogi Guaçu', 'Av. Brasil, [Nº] - Mogi Guaçu'],
    ['complemento só com CEP', 'casa 12 do condomínio, CEP 13840-000, Mogi Mirim', 'casa [COMPLEMENTO] do condomínio, CEP [CEP], Mogi Mirim'],
  ]
  for (const [nome, entrada, saida] of casos) {
    test(nome, () => assert.equal(mascararDadosPessoais(entrada), saida))
  }

  test('texto sem dado pessoal sai IDÊNTICO', () => {
    const t = 'Oi! O iPhone 15 de 128GB sai por R$ 4.999 em 10x, ou R$ 4.599,90 no Pix. '
      + 'Tem na cor azul, modelo 2023, pedido 12345678. Chega dia 20/10/2026 às 14:30, '
      + 'casa cheia hoje kkk. Garantia 2019-2020 não vale mais.'
    assert.equal(mascararDadosPessoais(t), t)
  })

  test('número de casa sem logradouro nem CEP não é tocado', () => {
    assert.equal(mascararDadosPessoais('quero 2 capinhas, sala 3 da loja'), 'quero 2 capinhas, sala 3 da loja')
  })
})

// ── 2. o prompt montado não leva o dado em claro ───────────────────────────

const msg = (isStore: boolean, body: string, min: number): RawMessage => ({
  date: '2026-10-10', time: `14:${String(min).padStart(2, '0')}`, phone: isStore ? '' : '5519988887777',
  name: isStore ? 'Loja' : 'Mariana Souza Lima', body, mediaType: '', mediaCaption: '', quotedMessage: '', isStore,
})
function leadFicticio(contact: string, phone: string): Lead {
  const messages = [
    msg(false, 'Oi, quero o iPhone 15 em 10x. Meu CPF é 529.982.247-25', 1),
    msg(true, 'Fechado! Me passa o endereço de entrega?', 2),
    msg(false, 'Rua das Palmeiras, 742, apto 31, Campinas. E-mail mariana.lima@exemplo.com', 3),
    msg(true, 'Anotado. Te ligo no (19) 98888-7777 quando sair', 4),
    msg(false, 'pode mandar o boleto no 52998224725 mesmo?', 5),
  ]
  return {
    id: 'lead-9001', filename: 'lead-9001', contact, phone, sellerName: null, messages,
    daysInactive: 3, conversationDays: 0, firstDate: '2026-10-10', lastDate: '2026-10-10',
    totalMessages: messages.length, leadMessages: 3, storeMessages: 2,
  }
}
function prompts(lead: Lead) {
  const ficha = montarFicha(lead, { leadId: 9001, filialId: 1, canal: 'whatsapp', comprou: false, valorVenda: null, diasAteVenda: null })
  const travou = ondeTravou(lead, false)
  const perfil = contextoDoPerfil({
    lead, ficha, travou, nomeDaLoja: 'Loja Exemplo', kanban: null,
    temVendaRegistrada: false, valorVenda: null, diasAteVenda: null,
  })
  const sugestao = travou ? contextoDaSugestao(lead, travou, ficha) : ''
  return { perfil, sugestao, travou }
}

describe('montagem do prompt', () => {
  const EM_CLARO = [
    '529.982.247-25', '52998224725', 'mariana.lima@exemplo.com', '742', 'apto 31',
    '98888-7777', '5519988887777', '19988887777', 'Souza', 'Lima',
  ]

  test('lead com CPF, endereço e e-mail: nenhum deles chega em claro à ficha nem à sugestão', () => {
    const lead = leadFicticio('Mariana Souza Lima', '5519988887777')
    const { perfil, sugestao, travou } = prompts(lead)
    assert.ok(travou, 'a conversa de teste precisa ter ponto de travamento para a sugestão')
    for (const [nome, texto] of [['perfil', perfil], ['sugestao', sugestao]] as const) {
      for (const proibido of EM_CLARO) assert.ok(!texto.includes(proibido), `${nome} contém "${proibido}"`)
      assert.ok(texto.includes('Cliente: Mariana'), `${nome}: só o primeiro nome`)
    }
    assert.ok(perfil.includes('[CPF]') && perfil.includes('[E-MAIL]') && perfil.includes('[Nº]'))
    assert.ok(perfil.includes('Campinas'), 'a cidade fica')
    // A cópia é só para o envio: o lead original continua intacto (é o que a tela mostra).
    assert.ok(lead.messages[0].body.includes('529.982.247-25'))
    assert.equal(lead.contact, 'Mariana Souza Lima')
  })

  test('lead sem nome (montar.ts põe o telefone): vai "Cliente", nunca o telefone', () => {
    const lead = leadFicticio('5519977776666', '5519977776666')
    const { perfil, sugestao } = prompts(lead)
    for (const texto of [perfil, sugestao]) {
      assert.ok(texto.includes('Cliente: Cliente'))
      assert.ok(!texto.includes('5519977776666') && !texto.includes('19977776666') && !texto.includes('97777-6666'))
    }
  })

  test('nomeParaIA: id do Instagram, "Lead N" e vazio também viram "Cliente"', () => {
    assert.equal(nomeParaIA({ contact: '17841400000000000', phone: '' }), 'Cliente')
    assert.equal(nomeParaIA({ contact: 'Lead 12', phone: '' }), 'Cliente')
    assert.equal(nomeParaIA({ contact: '  ', phone: '' }), 'Cliente')
    assert.equal(nomeParaIA({ contact: 'João Pedro (indicação)', phone: '' }), 'João')
  })
})

// ── 3. o gabarito não tem nada da cliente real ─────────────────────────────

describe('gabarito', () => {
  /**
   * SHA-256 das frases da cliente real que estavam no gabarito até 16/10/2026
   * (nome, número do lead, valor, parcelas, data, citações dela e do marido),
   * com o tamanho de cada uma. Guardar o TEXTO aqui reintroduziria no
   * repositório exatamente o que o teste existe para manter fora; o hash
   * prova a ausência sem repetir o dado.
   *
   * Normalização: minúsculas, `\n` literal e espaços seguidos viram um espaço.
   */
  const PROIBIDAS: Array<[string, number]> = [["fed53f30df66d6dfea34a7cfb064a4d4a7855029439f9a5b470db9b10e2ad8fd",14],["bb3226cae728552951bf421b1b36f919267f8592fcaf133c96a93daa67cd17c1",8],["f855c22b0250fd145230b33be314529f4eb46a3192981813e4d2102a53fe0396",8],["cfbaba377d9001c9ac425e7d0cd12b2d57cdb3dab29360fd1a7127f7dbe0d3f4",8],["525655c830217c2c563adcb2e75b9be234b22dfc2fb3d62a7b2061cbf2359f27",12],["5d808cd3785c885071cffcf5980281585418654f9d315530d12720c56fd07a18",12],["9464633a8386d60c951bb5096eaa220c88a23230364410ae23c54c1768abbe67",20],["79b5bc2237390b0a7fe87bd1f2b4a5b795a12a9684150cb7717d6a208cfcb0ff",39],["29b24389d6055786667bdb20c94e854334550a2d457d416e0c4e8b2e50290af4",16],["f0c53b9f8510c33e96faf5c288c049414fb9ba1ac2370e903f3c52f15d9e95fd",20],["02425ee9b800e7f093046cf0aaf8d57c481f6ac2326522a29af612de07879647",21],["3a82f014a8bcd1d2652abc47fa4158a2e1368f9e5b33abdb0e16e867c82117f8",19],["6e107dd2e8b3ae2eca2885f633cfaf954ccd0ff9cab955e3aff984f37cb02f82",17],["110e315a63548039a71ee26ca7f0a39686ec6a188dc8e1a5c96041faed670f5b",27],["83224ed00cf83031f8a8ebb7f263ee7cd855578bb9879208c97ada9d144069c2",35],["d91a8b6d9a6be87526b54c4e60f3ffc852a78f287ffdf2a589415d9cdcb33ff6",24],["0c8f6271cab680246fffe637d093006a673c94d517d5bc695400099db231d81e",18],["c4e2b0b49d2ac8f434bb48e83dafef5353bb98d8040ca7312c458441047037be",22],["142c5f3f2029b6a96074822e9cf0e7362a3dcce11822d41ecccbe1d66eafd6fa",30],["2d85f9e0761ed00e2effcd7e147f22509d743fbe5bb28331bfe543cce4795b57",19],["7d377fb373aca85dd3f0a0755b011bae85d422ff0894b899ec893651da997b94",30],["213550f82a9587b039a3929ec6c992292cbce7726da9614ec20c2cb1d495ef3a",22],["598a0c8f8524f91940ab91c0a65ce3cfed61109ad242ed3034ec38748a113666",20],["7524ae9c7f4cc633caa03460ff7d8b37d180786ca68fc1926b5dffebd972f353",8],["fed210fa1a0a9dcca5176e970a2ddf4f7a8f7a4295a190dc416dfab95d844e1f",13],["53e803dbff6869bcad02cd7587a449d274c97499724296df32b4c1087eaf35c1",16],["d45c97669d9bf20fded578dcf3b3ea3eb5967fffc0efd5e85aa2c11a9fcbdcbe",23],["2de0769d6c28eb172264d99ed177ab4816ebab9c6fb07768d4c6af62ea891579",32]]

  const norm = (s: string) => s.replace(/\\n/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim()
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  function achadas(texto: string, lista: Array<[string, number]> = PROIBIDAS): string[] {
    const t = norm(texto)
    const hashes = new Map(lista)
    const tamanhos = [...new Set(lista.map(([, n]) => n))]
    const fora: string[] = []
    for (const n of tamanhos) {
      for (let i = 0; i + n <= t.length; i++) {
        const h = sha(t.slice(i, i + n))
        if (hashes.get(h) === n) fora.push(`${h.slice(0, 12)}… na posição ${i}`)
      }
    }
    return fora
  }

  test('o detector funciona (controle): acha uma frase plantada, com caixa e espaços diferentes', () => {
    const controle = norm('frase   de CONTROLE')
    const lista: Array<[string, number]> = [[sha(controle), controle.length]]
    assert.equal(achadas('antes Frase de\\n   controle depois', lista).length, 1)
    assert.equal(achadas('nada aqui', lista).length, 0)
  })

  test('o GABARITO não contém nenhuma frase original', () => {
    assert.deepEqual(achadas(GABARITO), [])
  })

  test('nem o arquivo inteiro de perfil.ts (comentários incluídos)', () => {
    assert.deepEqual(achadas(readFileSync('lib/zapintel/perfil.ts', 'utf8')), [])
  })

  test('o gabarito continua sendo um JSON de ficha completo', () => {
    const json = JSON.parse(GABARITO.slice(GABARITO.indexOf('{'), GABARITO.lastIndexOf('}') + 1).replace(/\\\\n/g, '\\n'))
    for (const campo of ['classificacao', 'score', 'riscoPerda', 'perfil', 'diagnostico', 'relato', 'sinais', 'objecoes', 'pontasSoltas', 'proximaAcao', 'proximaAcaoPorque', 'urgencia', 'mensagemSugerida']) {
      assert.ok(campo in json, `falta ${campo}`)
    }
  })
})

// ── 4. provedor único, modelo e tempo ──────────────────────────────────────

describe('perguntarIA: só Anthropic', () => {
  const pergunta = () => ia.perguntarIA({ empresaId: 1, system: 's', mensagens: [{ role: 'user', content: 'x' }], origem: 'teste' })
  let fetchChamado = 0
  const fetchOriginal = globalThis.fetch
  beforeEach(() => {
    sdk.opcoes = []; sdk.pedidos = []; fetchChamado = 0
    sdk.responder = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } })
    globalThis.fetch = (async () => { fetchChamado++; throw new Error('nenhuma chamada HTTP direta') }) as typeof fetch
  })
  const depois = () => { globalThis.fetch = fetchOriginal }

  test('modelo vazio → claude-haiku-5-5, 25 s por tentativa e uma repetição', async () => {
    cfg.atual = { ativo: true, modelo: '' }
    const r = await pergunta(); depois()
    assert.deepEqual(r, { ok: true, texto: 'ok', modelo: 'claude-haiku-5-5' })
    assert.equal(sdk.pedidos[0].model, 'claude-haiku-5-5')
    assert.equal(sdk.opcoes[0].timeout, 25_000)
    assert.equal(sdk.opcoes[0].maxRetries, 1)
  })

  test('modelo nulo (sem linha de config) → claude-haiku-5-5', async () => {
    cfg.atual = { ativo: true, modelo: null }
    const r = await pergunta(); depois()
    assert.equal(r.ok && r.modelo, 'claude-haiku-5-5')
  })

  test('modelo que não é claude- → 503 com a instrução, sem chamar provedor nenhum', async () => {
    cfg.atual = { ativo: true, modelo: 'gemini-3.6-flash' }
    const { r, logs } = await comLogs(pergunta); depois()
    assert.deepEqual(r, { ok: false, status: 503, erro: 'Modelo de IA não configurado; defina um modelo Claude em /superadmin/assistente' })
    assert.equal(sdk.pedidos.length, 0, 'SDK da Anthropic não chamado')
    assert.equal(sdk.opcoes.length, 0)
    assert.equal(fetchChamado, 0, 'nenhum fetch (o caminho do Google saiu)')
    assert.equal(JSON.parse(logs[0]).motivo, 'modelo_nao_claude')
  })

  test('o modelo do script (--modelo) segue a mesma regra', async () => {
    cfg.atual = { ativo: true, modelo: 'claude-haiku-5-5' }
    const r = await ia.perguntarIA({ empresaId: 1, mensagens: [{ role: 'user', content: 'x' }], origem: 't', modelo: 'gemini-2.5-flash' }); depois()
    assert.equal(r.ok, false)
    assert.equal(sdk.pedidos.length, 0)
  })

  test('iaDoCrmLigada: falso com modelo não-Claude, verdadeiro com vazio', async () => {
    cfg.atual = { ativo: true, modelo: 'gemini-3.6-flash' }
    assert.equal(await ia.iaDoCrmLigada(), false)
    cfg.atual = { ativo: true, modelo: '' }
    assert.equal(await ia.iaDoCrmLigada(), true)
    cfg.atual = { ativo: false, modelo: 'claude-haiku-5-5' }
    assert.equal(await ia.iaDoCrmLigada(), false)
    depois()
  })

  test('estouro de tempo → 504 "A análise demorou demais" e log motivo=timeout', async () => {
    cfg.atual = { ativo: true, modelo: 'claude-haiku-5-5' }
    sdk.responder = async () => { throw new APIConnectionTimeoutError() }
    const { r, logs } = await comLogs(pergunta); depois()
    assert.deepEqual(r, { ok: false, status: 504, erro: 'A análise demorou demais, tente novamente' })
    const log = JSON.parse(logs[0])
    assert.equal(log.evento, 'zapintel.ia.falha')
    assert.equal(log.motivo, 'timeout')
  })

  test('prazo total estourado (abort) também é timeout, não erro da API', async () => {
    cfg.atual = { ativo: true, modelo: 'claude-haiku-5-5' }
    sdk.responder = async () => { throw new APIUserAbortError() }
    const { r, logs } = await comLogs(pergunta); depois()
    assert.equal(!r.ok && r.status, 504)
    assert.equal(JSON.parse(logs[0]).motivo, 'timeout')
  })

  test('erro da API → 502 traduzido e log motivo=erro_api com o status', async () => {
    cfg.atual = { ativo: true, modelo: 'claude-haiku-5-5' }
    sdk.responder = async () => { throw new APIError(429, 'rate limit') }
    const { r, logs } = await comLogs(pergunta); depois()
    assert.equal(!r.ok && r.status, 502)
    const log = JSON.parse(logs[0])
    assert.equal(log.motivo, 'erro_api')
    assert.equal(log.status, 429)
  })
})

// ── 4b. toda chamada à Anthropic grava em assistente_uso (17/10/2026) ──────

describe('assistente_uso: toda chamada à Anthropic vira uma linha', () => {
  const chamar = (modelo?: string) => ia.perguntarIA({ empresaId: 7, system: 's', mensagens: [{ role: 'user', content: 'x' }], origem: 'teste', modelo })
  beforeEach(() => { usos.length = 0; cfg.atual = { ativo: true, modelo: 'claude-haiku-5-5' } })

  test('sucesso: grava com os tokens (entrada soma o cache)', async () => {
    sdk.responder = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 1, output_tokens: 7 } })
    const r = await chamar()
    assert.equal(r.ok, true)
    assert.deepEqual(usos, [{ empresa_id: 7, tokens_in: 16, tokens_out: 7 }])
  })

  test('recusa: grava (a Anthropic cobra) e responde 502', async () => {
    sdk.responder = async () => ({ stop_reason: 'refusal', stop_details: { category: 'x' }, content: [], usage: { input_tokens: 3, output_tokens: 1 } })
    const { r } = await comLogs(() => chamar())
    assert.equal(!r.ok && r.status, 502)
    assert.deepEqual(usos, [{ empresa_id: 7, tokens_in: 3, tokens_out: 1 }])
  })

  test('resposta vazia: grava', async () => {
    sdk.responder = async () => ({ stop_reason: 'max_tokens', content: [], usage: { input_tokens: 4, output_tokens: 9 } })
    await comLogs(() => chamar())
    assert.equal(usos.length, 1)
  })

  test('timeout: grava, com tokens nulos (não dá para saber o que foi cobrado)', async () => {
    sdk.responder = async () => { throw new APIConnectionTimeoutError() }
    const { r } = await comLogs(() => chamar())
    assert.equal(!r.ok && r.status, 504)
    assert.deepEqual(usos, [{ empresa_id: 7, tokens_in: null, tokens_out: null }])
  })

  test('erro da API: grava', async () => {
    sdk.responder = async () => { throw new APIError(529, 'overloaded') }
    await comLogs(() => chamar())
    assert.equal(usos.length, 1)
  })

  test('o caminho do script de lote (`modelo` explícito) também grava', async () => {
    sdk.responder = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, output_tokens: 2 } })
    await chamar('claude-haiku-5-5')
    assert.equal(usos.length, 1)
  })

  test('modelo não Claude não chama a Anthropic — e não grava nada', async () => {
    cfg.atual = { ativo: true, modelo: 'gemini-3.6-flash' }
    await comLogs(() => chamar())
    assert.equal(usos.length, 0)
  })
})

// ── 5. o contador por hora não fica cego calado ────────────────────────────

describe('limite por hora: falha do contador', () => {
  test('libera, e registra log JSON + Sentry (modulo=zapintel) uma vez', async () => {
    sentry.capturas = []
    const db = bancoFalso(() => ({ data: null, error: { message: 'down' } }))
    const { r, logs } = await comLogs(() => excedeuLimiteDoUsuario(db as never, 'zapintel-perfil', 'u-1', 120))
    assert.equal(r, false, 'continua liberando (fail-open)')
    const eventos = logs.filter((l) => l.includes('zapintel.rate_limit.falha'))
    assert.equal(eventos.length, 1)
    assert.equal(JSON.parse(eventos[0]).escopo, 'zapintel-perfil')
    assert.equal(sentry.capturas.length, 1)
    assert.equal(sentry.capturas[0].ctx.tags?.modulo, 'zapintel')
  })

  test('contador que LANÇA em vez de devolver erro também libera e avisa', async () => {
    sentry.capturas = []
    const db = { rpc: async () => { throw new Error('fetch failed') } }
    const { r, logs } = await comLogs(() => excedeuLimiteDoUsuario(db as never, 'zapintel-sugestao', 'u-2', 40))
    assert.equal(r, false)
    assert.equal(logs.filter((l) => l.includes('zapintel.rate_limit.falha')).length, 1)
    assert.equal(sentry.capturas.length, 1)
  })

  test('contador funcionando não chama o Sentry', async () => {
    sentry.capturas = []
    const db = bancoFalso(() => ({ data: 3, error: null }))
    assert.equal(await excedeuLimiteDoUsuario(db as never, 'zapintel-perfil', 'u-1', 120), false)
    assert.equal(sentry.capturas.length, 0)
  })
})

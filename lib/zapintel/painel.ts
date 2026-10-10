import { carregarConversas, idDoLead } from '@/lib/zapintel/conversas'
import { fatosDeVenda, type FatosDeVenda } from '@/lib/zapintel/vendas'
import { linhasDaAnalise, type LinhaAnalise } from '@/lib/zapintel/analise'
import { computeStats, type FatosStats } from '@/lib/zapintel/insights/stats'
import { computePerformance } from '@/lib/zapintel/insights/performance'
import { computePerformance2 } from '@/lib/zapintel/insights/performance2'
import { computeLinguagem } from '@/lib/zapintel/insights/linguagem'
import { computeSilencio, type FraseAntesDoSilencio } from '@/lib/zapintel/insights/silencio'
import type { Lead, DashboardStats, PerformanceStats } from '@/types/zapintel'
import type { Performance2Stats } from '@/lib/zapintel/insights/performance2'
import type { LinguagemStats } from '@/lib/zapintel/insights/linguagem'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O PAINEL DO ZAPINTEL, MONTADO NO SERVIDOR.
 *
 * ══ O QUE VIAJA, E O QUE NÃO ═══════════════════════════════════════════════
 *
 * As conversas NÃO viajam. Eram 54.888 mensagens, 4,1 MB — acima do teto de
 * 4,5 MB de uma resposta de função, e foi para fugir disso que a análise
 * passou a ser truncada, anunciando número de três semanas antes como se
 * fosse de hoje.
 *
 * Agora os motores rodam aqui, ao lado do dado, e o que vai para o navegador é
 * a conclusão: os agregados (alguns KB) e um lead LEVE por conversa.
 *
 * ══ POR QUE `messages` VAI VAZIO, E NÃO "SÓ A ÚLTIMA" ══════════════════════
 *
 * Seria tentador mandar a última mensagem dentro de `messages` para as telas
 * continuarem funcionando sem mudar. Seria a mesma armadilha de antes: um
 * array com 1 de 50 itens responde a `.length` com 1 e ninguém percebe que a
 * conta saiu errada. Quem precisa de um pedaço da conversa recebe um campo com
 * nome próprio (`ultimaMensagem`, `aguardandoLoja`), e quem precisa da conversa
 * inteira busca por lead, sob demanda.
 */

/** O lead como as telas o recebem: tudo do motor, menos o texto das conversas. */
export interface LeadLeve extends Omit<Lead, 'messages' | '_sources'> {
  messages: never[]
  /**
   * O id do lead NO CRM.
   *
   * `id` é o que o motor gerou ao ler a conversa e só serve dentro do ZapIntel;
   * é este aqui que serve para pedir a conversa de volta, ou para abrir o lead
   * no CRM. Nulo em dado importado à mão, que não veio de lead nenhum.
   */
  leadId: number | null
  /** A loja (filial) a que este lead pertence no CRM. */
  filialId: number | null
  /** Só para exibir "última coisa que foi dita". Nunca para contar. */
  ultimaMensagem: { body: string; date: string; time: string; isStore: boolean } | null
  /** A última fala foi do cliente — a loja deve resposta. */
  aguardandoLoja: boolean
  /** Conversa que só tem disparo automático (`notification_template`). */
  fantasma: boolean
  /** O cliente mencionou ter vindo por indicação. */
  indicacao: boolean
  /** Produto predominante, deduzido do que a loja falou. Usado no pós-venda. */
  produto: string
}

export interface Agregados {
  stats: DashboardStats
  performance: PerformanceStats
  performance2: Performance2Stats
  linguagem: LinguagemStats | null
  /**
   * O que a loja disse antes de o cliente sumir, agrupado.
   *
   * A única coisa nesta reconstrução que as ferramentas do segmento não têm:
   * chamada gravada não tem "última mensagem antes de sumir". Ver
   * `lib/zapintel/insights/silencio.ts` para as duas armadilhas que o cálculo
   * precisa desviar.
   */
  silencio: FraseAntesDoSilencio[]
}

export interface Loja {
  id: number | null
  nome: string
  leads: number
}

export interface Painel {
  empresaNome: string
  segmentId: string
  mensagens: number
  /** Id da mensagem mais recente que entrou nesta análise. Ver `Conversas`. */
  ultimaMensagem: number
  /**
   * Leads ATIVOS que não têm uma única mensagem.
   *
   * Ficam fora dos agregados de propósito: entrariam como conversa de nota
   * zero e puxariam toda média para baixo, dizendo que o atendimento piorou
   * quando o que houve foi gente entrando no funil. Mas somem da tela se não
   * forem contados — e "ninguém falou com estes" é das informações mais úteis
   * que o painel tem.
   */
  semConversa: number
  leads: LeadLeve[]
  lojas: Loja[]
  /** Agregados por recorte: `geral` e uma entrada por filial (chave = id). */
  agregados: Record<string, Agregados>
  calculadoEm: string
  ms: number
  /**
   * Onde o tempo foi, em ms. Fica na resposta de propósito: o teto de 10 s da
   * função é o limite que mais perto chegou de ser estourado aqui, e quando
   * voltar a apertar o número já estará à mão, sem precisar instrumentar de
   * novo no escuro.
   */
  tempos: { ler: number; agregar: number; leads: number; mensagens: number; motor: number }
}

const PALAVRAS_INDICACAO = ['indicação', 'indicacao', 'indicou', 'me indicou', 'amigo', 'amiga']

const PRODUTOS: [string, string[]][] = [
  ['macbook', ['macbook']],
  ['ipad', ['ipad']],
  ['airpods', ['airpod']],
  ['apple watch', ['apple watch', 'watch series', 'watch ultra']],
  ['perfume', ['perfume', '212 vip', 'importado']],
  ['iphone', ['iphone']],
]

function produtoDaConversa(lead: Lead): string {
  const texto = [
    lead.manualSale?.product || '',
    ...(lead.messages || []).filter((m) => m.isStore).map((m) => m.body || ''),
  ].join(' ').toLowerCase()
  for (const [chave, termos] of PRODUTOS) {
    if (termos.some((t) => texto.includes(t))) return chave
  }
  return 'default'
}

/** Tira as conversas do lead e guarda, com nome próprio, o que as telas usam delas. */
/**
 * O CANAL VEM DO BANCO, não de adivinhação.
 *
 * `detectLeadOrigin` (no hook) chuta o canal pelo formato do telefone e pelo
 * nome do arquivo, porque na época da importação manual era só o que havia.
 * Com o CRM alimentando, `leads.origem` diz a verdade — e o chute errava
 * feio: o `origem_id` do Instagram é numérico e longo (ex.:
 * 1000392312975947), então os 384 leads de Instagram da JM apareciam todos
 * como WhatsApp.
 *
 * A diferença não é cosmética. Medido em 10/10/2026: conversa de Instagram
 * tem 13,8 mensagens de média contra 27,6 do WhatsApp — metade do tamanho.
 * Qualquer regra calibrada sobre profundidade de conversa (e a regra nova de
 * `hot` é exatamente isso) está tratando os dois canais como se fossem um.
 *
 * ⚠ E tem um buraco maior atrás disto: lead de Instagram não tem telefone
 * (3 em 384), e a ponte venda↔conversa casa por telefone. Os 384 entram no
 * denominador de toda taxa e NUNCA podem entrar no numerador. "Instagram
 * converte 0%" não é medição, é impossibilidade de medir.
 */
export function aliviar(a: Lead, filialId: number | null, canal?: string | null): LeadLeve {
  const comTexto = (a.messages || []).filter((m) => m.body?.trim())
  const ultima = comTexto[comTexto.length - 1]
  const todoTexto = (a.messages || []).map((m) => (m.body || '').toLowerCase())

  const { messages: _m, _sources: _s, ...resto } = a
  // `_channel` é o campo que as telas já leem; só faltava alguém preenchê-lo
  // com o que o banco sabe.
  if (canal === 'instagram' || canal === 'whatsapp') resto._channel = canal

  return {
    ...resto,
    messages: [],
    leadId: idDoLead(a),
    filialId,
    ultimaMensagem: ultima
      ? { body: ultima.body || '', date: ultima.date, time: ultima.time, isStore: ultima.isStore }
      : null,
    aguardandoLoja: !!ultima && !ultima.isStore,
    fantasma: a.classification === 'unqualified' || todoTexto.some((t) => t.includes('notification_template')),
    indicacao: todoTexto.some((t) => PALAVRAS_INDICACAO.some((k) => t.includes(k))),
    produto: produtoDaConversa(a),
  }
}

/**
 * Quantas linhas de cada lista chegam à tela.
 *
 * A maior lista que `/zapintel/performance2` exibe tem 20 itens. Quarenta dá
 * folga para a tela crescer sem obrigar a mexer aqui.
 */
const LINHAS_POR_LISTA = 40

/**
 * Corta as listas POR LEAD de `performance2` ao que a tela mostra.
 *
 * Eram seis listas com os 2.039 leads cada — 1,6 MB por loja, 4,8 MB no total,
 * acima do teto de 4,5 MB de uma resposta. E a tela exibe no máximo 20 de cada.
 *
 * Cortar aqui, e não dentro do motor, é de propósito: nenhum resumo depende
 * do corte (médias, contagens e distribuições são calculados sobre a lista
 * inteira, antes), então `computePerformance2` continua devolvendo a verdade
 * completa e quem corta é quem tem o problema de transporte.
 *
 * Cada corte preserva o RECORTE que a tela pede, não os primeiros N: a tela de
 * velocidade só mostra os lentos, e cortar pelo topo da lista deixaria
 * justamente eles de fora.
 */
function enxugar(p: Performance2Stats): Performance2Stats {
  const n = LINHAS_POR_LISTA
  const sentimento = p.sentimentByLead
  return {
    ...p,
    // A tela lista apenas os lentos (e checa se há algum).
    sellerSpeedByLead: p.sellerSpeedByLead
      .filter((s) => s.rating === 'slow' || s.rating === 'very_slow').slice(0, n),
    leadResponseByLead: p.leadResponseByLead.slice(0, n),
    // Duas colunas: os mais positivos e os que esfriaram.
    sentimentByLead: [
      ...sentimento.filter((s) => s.sentimentScore > 0).slice(0, n / 2),
      ...sentimento.filter((s) => s.arc === 'cooling' || s.arc === 'stable_negative').slice(0, n / 2),
    ],
    dynamicScores: p.dynamicScores.slice(0, n),
    talkRatios: p.talkRatios.slice(0, n),
    // A tela ordena do mais rápido para o mais lento; ordenar aqui garante que
    // o corte guarde os que ela mostraria.
    priceResponseByLead: [...p.priceResponseByLead]
      .sort((a, b) => a.minutesToRespond - b.minutesToRespond).slice(0, n),
    exitIntentAlerts: p.exitIntentAlerts.slice(0, n),
  }
}

/**
 * Converte os fatos de venda no contrato que o motor entende.
 *
 * O `comprou` mora aqui, e nao dentro do motor, porque so este arquivo sabe
 * traduzir o lead do motor (`filename = "lead-123"`) para o id do CRM. Motor
 * de analise nao deve saber que existe banco.
 */
function paraOMotor(f: FatosDeVenda | null, taxaHot: number, taxaWarm: number): FatosStats | null {
  if (!f) return null
  return {
    taxaHot,
    taxaWarm,
    ticket: f.ticket,
    vendas: f.vendas,
    cobertura: f.cobertura,
    cicloMediano: f.cicloMediano,
    comprou: (l: Lead) => {
      const id = idDoLead(l)
      return id != null && f.compradores.has(id)
    },
  }
}

export function agregar(leads: Lead[], fatos: FatosStats | null = null): Agregados {
  return {
    stats: computeStats(leads, fatos),
    silencio: computeSilencio(leads, fatos ? fatos.comprou : () => false),
    performance: computePerformance(leads),
    performance2: enxugar(computePerformance2(leads)),
    linguagem: computeLinguagem(leads),
  }
}

/**
 * Lê tudo, analisa tudo e devolve o painel pronto.
 *
 * Os agregados vêm em recortes: `geral` e um por filial. Rodar os motores de
 * novo por loja é barato — o caro foi ler, e já está lido — e é o que permite
 * ao administrador ver a rede inteira e cada loja sem recarregar nada.
 */
export async function montarPainel(
  db: SupabaseClient,
  empresaId: number,
): Promise<{ painel: Painel; linhas: LinhaAnalise[] }> {
  const inicio = Date.now()
  // As duas leituras sao independentes. A de vendas custa duas consultas
  // pequenas (60 linhas na JM) contra as 55 mil mensagens da outra — pedir em
  // paralelo nao atrasa nada e paga o fim do ticket inventado.
  const [conversas, vendas] = await Promise.all([
    carregarConversas(db, empresaId),
    fatosDeVenda(db, empresaId),
  ])
  const { analisados, porId, nomeDaLoja, segmentId, totalMensagens, ultimaMensagem, tempos } = conversas
  // `fatos` depende das taxas, medidas logo abaixo.

  /**
   * CLIENTE É QUEM COMPROU — e isso é fato registrado, não palavra na conversa.
   *
   * O motor tinha uma regra `CUSTOMER_KW` que marcava cliente por texto, e lia
   * os dois lados. Media: 133 marcados, 33 compraram. O gatilho número 1 era
   * "imei" (101 leads), que é pergunta de cotação de troca — o oposto de venda
   * fechada. A regra saiu de `classification/engine.ts` em 10/10/2026.
   *
   * O carimbo é aplicado AQUI, antes dos motores de agregado rodarem, e não lá
   * no fim em `aliviar()`: se a lista dissesse uma coisa e as médias outra,
   * teríamos dois números verdadeiros para o mesmo lead, que é como este
   * módulo já enganou duas vezes.
   */
  //
  // A TAXA DE FECHAMENTO SAI DAQUI, E ANTES DO CARIMBO.
  //
  // Depois dele nao sobra nenhum comprador dentro de `hot`, entao a taxa
  // medida la daria zero e o pipeline zeraria por construcao — um numero
  // errado produzido por um conserto certo. Medida aqui, sobre a
  // classificacao por COMPORTAMENTO, ela responde o que a pergunta quer
  // saber: destes quentes de hoje, quantos tendem a fechar.
  const taxaPorClasse = (cls: string): number => {
    if (!vendas?.cobertura) return 0
    const naClasse = analisados.filter((a) => a.classification === cls)
    if (!naClasse.length) return 0
    const compraram = naClasse.filter((a) => {
      const id = idDoLead(a)
      return id != null && vendas.compradores.has(id)
    }).length
    return Math.min(1, compraram / naClasse.length / vendas.cobertura)
  }
  const taxaHot = taxaPorClasse('hot')
  const taxaWarm = taxaPorClasse('warm')

  const fatos = paraOMotor(vendas, taxaHot, taxaWarm)

  if (vendas) {
    for (const a of analisados) {
      const id = idDoLead(a)
      if (id != null && vendas.compradores.has(id)) a.classification = 'customer'
    }
  }
  const leu = Date.now()

  // Leads sem nenhuma mensagem não saem do parser; entram aqui para que o
  // painel conte quem entrou no funil e nunca foi atendido.
  const analisadosPorId = new Map<number, Lead>()
  for (const a of analisados) {
    const id = idDoLead(a)
    if (id != null && porId.has(id)) analisadosPorId.set(id, a)
  }

  const { data: filiaisRaw } = await db
    .from('filiais').select('id, nome').eq('empresa_id', empresaId)
  const nomeDaFilial = new Map<number, string>(
    ((filiaisRaw ?? []) as { id: number; nome: string }[]).map((f) => [f.id, f.nome]),
  )

  const comConversa: Lead[] = []
  const leves: LeadLeve[] = []
  const porFilial = new Map<number | null, Lead[]>()

  for (const [id, lead] of porId) {
    const a = analisadosPorId.get(id)
    if (!a) continue
    comConversa.push(a)
    leves.push(aliviar(a, lead.filial_id, lead.origem))
    const chave = lead.filial_id ?? null
    const lista = porFilial.get(chave)
    if (lista) lista.push(a); else porFilial.set(chave, [a])
  }

  leves.sort((x, y) => y.score - x.score)

  const comecouAgregar = Date.now()
  // O MESMO `fatos` vale para a rede e para cada loja, e isso e correto:
  // `comprou` olha lead a lead, entao o recorte de uma filial so conta os
  // compradores dela. O ticket e o ciclo, sim, sao da empresa — a JM tem 55
  // vendas no total, e quebrar isso por loja daria um ticket de 4 vendas, que
  // seria ruido com cara de medida.
  const agregados: Record<string, Agregados> = { geral: agregar(comConversa, fatos) }
  const lojas: Loja[] = [{ id: null, nome: 'Toda a rede', leads: comConversa.length }]
  for (const [filial, lista] of porFilial) {
    if (filial == null) continue
    agregados[String(filial)] = agregar(lista, fatos)
    lojas.push({ id: filial, nome: nomeDaFilial.get(filial) ?? `Loja ${filial}`, leads: lista.length })
  }
  lojas.sort((a, b) => (a.id ?? -1) - (b.id ?? -1))

  const painel: Painel = {
    empresaNome: nomeDaLoja,
    segmentId,
    mensagens: totalMensagens,
    ultimaMensagem,
    semConversa: porId.size - comConversa.length,
    leads: leves,
    lojas,
    agregados,
    calculadoEm: new Date().toISOString(),
    ms: Date.now() - inicio,
    tempos: { ler: leu - inicio, agregar: Date.now() - comecouAgregar, ...tempos },
  }

  // A tabela é gravada no MESMO passo que alimenta a tela: assim o que o
  // módulo de Leads lê de `zapintel_analise` é, por construção, o mesmo número
  // que o ZapIntel mostra. Dois caminhos dariam dois resultados.
  return { painel, linhas: linhasDaAnalise(analisados, porId, empresaId) }
}

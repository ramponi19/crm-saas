import type { SupabaseClient } from '@supabase/supabase-js'
import type { Classification, Lead, RawMessage } from '@/types/zapintel'
import type { Ficha } from '@/lib/zapintel/ficha'
import type { Travou } from '@/lib/zapintel/travou'
import { perguntarIA } from '@/lib/zapintel/ia'

/**
 * A FICHA DO LEAD ESCRITA POR IA — tudo que a tela do lead afirma, acima do
 * Copiloto, sai daqui.
 *
 * ══ O QUE ISTO SUBSTITUI, E POR QUE ════════════════════════════════════════
 *
 * O bloco "ANÁLISE DE IA" da tela do lead nunca foi IA. Era uma cadeia de
 * `if` sobre a fala do cliente, em `lib/zapintel/insights/followUp.ts`:
 *
 *     if (lt.includes("bateria"))
 *       insight = "Preocupação com saúde da bateria — reforçar garantia de 6 meses."
 *
 * E "PRÓXIMA AÇÃO" era uma tabela de sete frases indexada pela classificação.
 * Dois leads com conversas completamente diferentes recebiam a mesma frase,
 * sob um rótulo que dizia "IA".
 *
 * Medido no lead 439 (Carol Baldasso) em 13/10/2026, com a conversa inteira
 * na mão, a tela dizia:
 *
 *     🔥 QUENTE · Score 100 · Risco de perda 75%
 *     ANÁLISE DE IA: "Preocupação com saúde da bateria — reforçar garantia…"
 *     PRÓXIMA AÇÃO: "FECHAR AGORA — confirmar pagamento e finalizar pedido."
 *
 * Ela tinha comprado 52 dias antes, pago R$ 5.695 em 18x, recebido em casa e
 * mandado foto com o aparelho. Dois dos seis "sinais de compra" eram lixo de
 * substring: `Pediu NF` saiu de "só me co-NF-irma se é esse valor", e
 * `Indecisão / Timing` saiu da palavra "depois" em "tenho que ir aí pagar
 * depois buscar?".
 *
 * ══ POR QUE AGORA DÁ, E ANTES NÃO DAVA ═════════════════════════════════════
 *
 * Porque 35% do que a loja fala é áudio (10.201 de 29.135 mensagens enviadas),
 * e até 13/10/2026 isso era `[audio]` para qualquer motor. Com o backfill do
 * Whisper, a IA lê o que foi DITO. Na mesma Carol, três fatos que decidem o
 * que fazer com ela estão todos dentro de áudio: a promessa de recomprar o
 * iPhone 12 Pro Max dela, a revelação de que o aparelho era por encomenda com
 * 100% antecipado, e o carregador de R$ 199 que ficou pendente.
 *
 * ══ O QUE A IA PODE DIZER, E O QUE ELA NÃO PODE ════════════════════════════
 *
 * Um texto bonito e errado é pior que uma frase genérica. Quando a tela diz
 * "Preocupação com saúde da bateria", todo mundo entende que é automático e
 * ninguém age cegamente. Quando ela disser "ela está esperando o valor do
 * aparelho dela desde terça", o vendedor acredita — e se estiver errado, ele
 * liga errado, na frente de um cliente de verdade.
 *
 * Por isso cada sinal e cada objeção carregam a EVIDÊNCIA junto: o pedaço da
 * conversa de onde aquilo saiu. Afirmação sem evidência é invenção com boa
 * redação, e a tela mostra a evidência ao lado para quem quiser conferir.
 */

/**
 * Muda quando o PROMPT ou o contrato mudam — nunca por mudança de código que
 * não altere o que a IA vê. É o que faz as fichas antigas serem regeradas.
 *
 *   p1  13/10/2026  primeira versão
 *   p2  13/10/2026  o GABARITO entrou no prompt: um exemplo de ficha pronta
 *                   vale mais que instrução para ensinar o nível de detalhe,
 *                   e pesa mais ainda num modelo barato. Ver `GABARITO`.
 */
export const VERSAO_DO_PERFIL = 'p2'

/**
 * Quanto da conversa cabe no prompt.
 *
 * A Carol (lead 439) tem 165 mensagens e ~18 mil caracteres — cabe inteira. A
 * média da base é 27 mensagens. O teto existe para o caso raro: o lead 4089
 * tem 1.400 mensagens, e mandá-las custaria mais que a ficha vale.
 *
 * Quando estoura, o corte é no MEIO e anunciado dentro do texto. Cortar o fim
 * seria jogar fora exatamente o que decide a próxima ação; cortar o começo,
 * perder o que a pessoa pediu.
 */
const TETO_DA_CONVERSA = 26_000

/** Quanto de cada mensagem entra. O suficiente para o sentido inteiro. */
const TETO_DA_MENSAGEM = 700

export interface SinalIA { rotulo: string; evidencia: string }
export interface ObjecaoIA { rotulo: string; evidencia: string; desfecho: string }

export interface PerfilIA {
  /** O mesmo vocabulário da lista, para a tela reusar o `Badge`. */
  classificacao: Classification
  score: number
  riscoPerda: number
  /** Rótulo curto de como esta pessoa compra. Livre — não é mais um enum. */
  perfil: string
  /** O bloco "ANÁLISE DE IA": 1 a 2 frases, o diagnóstico. */
  diagnostico: string
  /** O bloco "O QUE ACONTECEU": o relato da conversa, em parágrafos. */
  relato: string
  sinais: SinalIA[]
  objecoes: ObjecaoIA[]
  /**
   * O que ficou em aberto DENTRO da conversa e ninguém retomou.
   *
   * Nasceu do teste na Carol: o marido pagou cheio e o iPhone 12 Pro Max dela
   * nunca foi entregue na troca, embora o vendedor tenha prometido, em áudio,
   * aceitá-lo como entrada. É um seminovo de R$ 1.200 parado na gaveta de uma
   * cliente que confia na loja — e nenhum motor de palavra-chave chegaria
   * perto disso.
   */
  pontasSoltas: string[]
  proximaAcao: string
  proximaAcaoPorque: string
  urgencia: 'critical' | 'high' | 'medium' | 'low'
  mensagemSugerida: string
}

export interface MarcaDaConversa {
  marca: number
  mensagens: number
  transcritos: number
}

const instante = (m: RawMessage): number => {
  const t = Date.parse(`${m.date}T${(m.time || '00:00')}:00`)
  return Number.isNaN(t) ? 0 : t
}

/**
 * OS TRÊS NÚMEROS QUE DIZEM "A CONVERSA MUDOU".
 *
 * `transcritos` não é zelo: a transcrição chega DEPOIS da mensagem. O backfill
 * do Whisper enche `lead_mensagens.transcricao` sem criar mensagem nenhuma, e
 * sem contá-las um lead com 30 áudios recém-transcritos continuaria mostrando
 * a ficha escrita quando a IA só via "[audio]" — que é o caso de quase toda a
 * base em 13/10/2026.
 */
export function marcaDaConversa(lead: Lead): MarcaDaConversa {
  const msgs = lead.messages || []
  let marca = 0
  let transcritos = 0
  for (const m of msgs) {
    const t = instante(m)
    if (t > marca) marca = t
    if (m.transcrito) transcritos++
  }
  return { marca, mensagens: msgs.length, transcritos }
}

/**
 * ⚠ O `T12:00:00` NÃO É ENFEITE — SEM ELE A DATA ANDA UM DIA PARA TRÁS.
 *
 * `new Date('2026-07-31')` é interpretado como meia-noite UTC. Em São Paulo
 * (UTC-3) isso é 21h de 30/07, e `toLocaleDateString` imprime **30/07**.
 * Medido no lead 439 em 13/10/2026: o contexto dizia "Primeira mensagem:
 * 30/07" enquanto a primeira linha da conversa, logo abaixo no mesmo prompt,
 * era `[2026-07-31 12:24]`. A IA receberia duas datas diferentes para o mesmo
 * fato e teria de escolher uma.
 *
 * É o mesmo erro de fuso que em 12/10/2026 fez o painel anunciar pico de
 * movimento às 14h quando o real é 11h. Meio-dia é a hora que sobrevive a
 * qualquer fuso do Brasil.
 */
const data = (iso: string): string => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}

/**
 * A conversa como texto, marcando o que é transcrição.
 *
 * A marca importa para o modelo pelo mesmo motivo que importa para a tela:
 * transcrição automática erra ("no prato" por "preto", "Mojo Mirim" por "Mogi
 * Mirim"), e tratar isso como citação literal faria a IA pôr entre aspas, na
 * boca de alguém, o que a máquina entendeu.
 */
function conversaEmTexto(lead: Lead, contato: string): string {
  const msgs = lead.messages || []
  const linha = (m: RawMessage): string => {
    const quem = m.isStore ? 'LOJA' : contato.toUpperCase()
    const marca = m.transcrito ? ' (áudio transcrito)' : ''
    const corpo = (m.body || '').trim().slice(0, TETO_DA_MENSAGEM)
    return `[${m.date} ${m.time}] ${quem}${marca}: ${corpo || `[${m.mediaType || 'anexo'}]`}`
  }

  const todas = msgs.map(linha)
  const inteira = todas.join('\n')
  if (inteira.length <= TETO_DA_CONVERSA) return inteira

  // Estourou: fica o começo (o que ele pediu) e o fim (o que decide a próxima
  // ação). O buraco é anunciado, para a IA não costurar o que não viu.
  const inicio: string[] = []
  const fim: string[] = []
  let usado = 0
  for (let i = 0; i < todas.length && usado < TETO_DA_CONVERSA * 0.3; i++) {
    inicio.push(todas[i]); usado += todas[i].length
  }
  for (let i = todas.length - 1; i >= inicio.length && usado < TETO_DA_CONVERSA; i--) {
    fim.unshift(todas[i]); usado += todas[i].length
  }
  const ocultas = todas.length - inicio.length - fim.length
  return [
    ...inicio,
    `\n[... ${ocultas} mensagens do meio não couberam neste resumo ...]\n`,
    ...fim,
  ].join('\n')
}

/**
 * O CONTEXTO — fato antes de conversa, sempre.
 *
 * A ordem é deliberada: o que o CRM REGISTRA vem primeiro e vem rotulado como
 * registro, porque é a única parte que a IA não deve reinterpretar. O resto da
 * conversa ela lê e deduz. Misturar os dois é como o `insight` antigo errava —
 * afirmava "cliente" por palavra na conversa enquanto a tabela de vendas dizia
 * outra coisa.
 */
export function contextoDoPerfil(opts: {
  lead: Lead
  ficha: Ficha
  travou: Travou | null
  nomeDaLoja: string
  kanban: string | null
  temVendaRegistrada: boolean
  valorVenda: number | null
  diasAteVenda: number | null
}): string {
  const { lead, ficha, travou, nomeDaLoja, kanban, temVendaRegistrada } = opts
  const f = ficha

  const fatos = [
    `Loja: ${nomeDaLoja}`,
    `Cliente: ${lead.contact}`,
    `Canal: ${f.canal}`,
    /**
     * "Loja" é o que `montarFicha` devolve quando NÃO conseguiu identificar
     * quem atendeu — é a ausência de informação, não o nome de ninguém. Pôr
     * "Quem atendeu: Loja" no prompt convida o modelo a escrever frases sobre
     * um vendedor chamado Loja. Quando há nome de verdade na conversa (nesta
     * aparecem "Pedro aqui da JM" e "Luiz Felipe aqui"), a IA o lê de lá.
     */
    f.vendedor && f.vendedor !== 'Loja' ? `Quem atendeu: ${f.vendedor}` : '',
    kanban ? `Etapa no funil do CRM (movida por uma pessoa): ${kanban}` : '',
    `Primeira mensagem: ${data(f.primeiraEm)} · Última: ${data(f.ultimaEm)}`,
    `${f.mensagensLead + f.mensagensLoja} mensagens — ${f.mensagensLead} do cliente, ${f.mensagensLoja} da loja`,
    `Sem falar há ${f.diasInativo} dia(s)`,
    temVendaRegistrada
      ? `VENDA REGISTRADA NO CRM: sim${opts.valorVenda ? `, R$ ${opts.valorVenda.toLocaleString('pt-BR')}` : ''}${opts.diasAteVenda != null ? `, ${opts.diasAteVenda} dias após o primeiro contato` : ''}`
      : 'VENDA REGISTRADA NO CRM: não há venda ligada a este lead no sistema',
  ].filter(Boolean)

  const mecanica = [
    `Trocas de turno: ${f.trocasDeTurno}`,
    f.monologoLoja >= 3 ? `Maior sequência da loja sem resposta: ${f.monologoLoja} mensagens` : '',
    f.respostaMedianaMin != null ? `Mediana de resposta da loja: ${f.respostaMedianaMin} min (pior: ${f.respostaPiorMin} min)` : '',
    `Perguntas feitas pela loja: ${f.perguntasDaLoja}`,
    f.tentativasDeRetomada > 0 ? `Tentativas de retomada depois do silêncio dele: ${f.tentativasDeRetomada}` : '',
    f.aguardandoLoja ? 'A última fala foi do CLIENTE — a loja deve resposta.' : '',
  ].filter(Boolean)

  const partes = [
    '=== O QUE O CRM REGISTRA (fato, não reinterprete) ===',
    fatos.join('\n'),
    '',
    '=== MECÂNICA DA CONVERSA (medida, não deduzida) ===',
    mecanica.join('\n'),
  ]

  if (travou) {
    const m = (lead.messages || [])[travou.indice]
    partes.push(
      '',
      '=== ONDE A CONVERSA PAROU (medido) ===',
      `${travou.rotulo} — ${travou.detalhe}`,
      m ? `Mensagem: "${(m.body || '').trim().slice(0, 300)}"` : '',
    )
  }

  partes.push(
    '',
    '=== A CONVERSA, DO COMEÇO AO FIM ===',
    conversaEmTexto(lead, lead.contact),
  )

  return partes.filter((p) => p !== '').join('\n')
}

/**
 * O GABARITO — a ficha de um lead real, mostrada ao modelo como padrão.
 *
 * ══ DE ONDE VEIO ═══════════════════════════════════════════════════════════
 *
 * Do Lucas, em 13/10/2026, olhando a ficha da Carol que eu havia escrito a
 * mão: *"nao podemos aplicar o seu modelo e caso faça a ligacao de uma ia e
 * solicite a analise ela puxa conforme o modelo pronto?"*
 *
 * Ele tem razão na parte que importa. O que separa "Preocupação com saúde da
 * bateria" de "ela checou se a bateria trocada daria problema na revenda, e a
 * loja se comprometeu a aceitar o aparelho de volta" não é inteligência do
 * modelo — é saber que nível de detalhe se espera. Um exemplo ensina isso em
 * uma passada; vinte linhas de instrução não ensinam.
 *
 * É o que pesa mais num modelo barato, que é justamente onde este CRM vai
 * rodar: dar o padrão pronto vale mais do que pagar por um modelo melhor.
 *
 * ══ O RISCO, E COMO ELE É CONTIDO ══════════════════════════════════════════
 *
 * Exemplo contamina. O modelo que vê "iPhone 12 Pro Max" e "carregador de
 * R$ 199" aqui pode escrevê-los numa conversa onde ninguém os mencionou — e
 * seria o mesmo defeito que o vocabulário do Whisper causou em 13/10, quando
 * listar modelos fez a transcrição inventar "o Pro Max" num áudio que não
 * dizia isso. Invenção induzida por exemplo é pior que texto genérico, porque
 * vem bem escrita.
 *
 * Três contenções: o bloco se anuncia como de OUTRO cliente; a instrução
 * logo abaixo proíbe reaproveitar qualquer fato dele; e a regra 1 ("não
 * invente") continua valendo acima de tudo.
 *
 * ⚠ Mexer aqui é mexer em TODA ficha gerada daqui para frente. Suba
 * `VERSAO_DO_PERFIL` junto, senão as fichas antigas continuam no banco
 * passando por atuais.
 */
const GABARITO = `
EXEMPLO — ficha de OUTRO cliente, de outra conversa. Serve só para mostrar o
nível de detalhe, o tom e o formato esperados. NENHUM fato dele aparece na
conversa que você vai ler agora; não reaproveite produto, preço, nome nem
situação daqui.

{
  "classificacao": "customer",
  "score": 78,
  "riscoPerda": 15,
  "perfil": "Cautelosa e decidida",
  "diagnostico": "Comprou o aparelho por R$ 5.695 em 18x no dia 22/08, recebeu em casa no mesmo dia e mandou foto agradecendo. Não há nada a fechar aqui — o que existe é um cliente satisfeito com duas pontas soltas que valem dinheiro.",
  "relato": "Conheceu a loja pessoalmente numa feira, onde ouviu o preço e a avaliação do aparelho dela na troca. Voltou pelo WhatsApp onze dias depois perguntando boleto e parcelamento.\\n\\nO primeiro travamento foi crédito: mandou dois CPFs e os dois foram negados. Reagiu com humor e propôs sozinha a saída — pedir o cartão do irmão. Pediu uma coisa específica, que a loja cumpriu: ser avisada se entrasse outro na cor certa. Foi esse aviso, sete dias depois, que reabriu a conversa.\\n\\nO atrito que quase custou a venda apareceu no último dia: só então o vendedor contou que o aparelho era de um parceiro de outra cidade, por encomenda, com 100% pago antes. Ela acabara de dizer que mora longe. O vendedor resolveu no mesmo minuto, com link de pagamento e entrega em casa.",
  "sinais": [
    { "rotulo": "Insistiu após o crédito negado", "evidencia": "vou pedir cartão pro meu irmão então rs" },
    { "rotulo": "Mandou o marido à loja", "evidencia": "Meu marido tá indo aí. Vc consegue esperar ?" }
  ],
  "objecoes": [
    { "rotulo": "Bateria substituída", "evidencia": "Mais da algum b.o? Pq caso eu tento vender depois", "desfecho": "A loja se comprometeu a aceitar de volta como entrada" },
    { "rotulo": "Pagar antes de ver o aparelho", "evidencia": "Tenho que ir aí pagar depois buscar ? Kkk", "desfecho": "Resolvida com link de pagamento e entrega em casa" }
  ],
  "pontasSoltas": [
    "O aparelho antigo dela continua com ela — o marido pagou cheio e a troca não aconteceu, embora o vendedor tenha prometido em áudio aceitá-lo como entrada."
  ],
  "proximaAcao": "Oferecer a compra do aparelho antigo dela — a loja já prometeu aceitá-lo e ele continua parado com ela.",
  "proximaAcaoPorque": "Retoma uma promessa que a loja fez, não uma oferta nova, e não pede nada: oferece dinheiro por um seminovo que entraria no estoque por um canal que já confia na loja.",
  "urgencia": "medium",
  "mensagemSugerida": "Oi! Tudo bem? Me conta, como tá sendo o aparelho novo? 😄 Lembra que eu falei que a gente pegava o seu antigo como entrada? Seu marido acabou pagando tudo e ele ficou com você — se tiver só parado aí, a gente compra de você. Quer que eu faça uma avaliação?"
}

REPARE no exemplo: cada sinal cita o que a pessoa ESCREVEU; cada objeção diz
como terminou; o relato conta uma história com causa e sequência, não uma
lista de rótulos; e a próxima ação sai de algo que ficou em aberto na própria
conversa, não de uma regra geral de vendas.
`.trim()

/**
 * AS REGRAS — e cada uma existe porque algo deu errado sem ela.
 *
 * O contexto do negócio NÃO é descrito aqui. Foi tentado e medido em
 * 13/10/2026: o prompt da sugestão dizia o ramo vindo de
 * `getSegment().followupContext`, a JM cai em `ecommerce` ("loja de moda/
 * varejo"), e a IA escreveu "ainda tenho suas PEÇAS separadinhas aqui" para
 * quem queria iPhone. O negócio se descreve sozinho na conversa.
 */
function regras(nomeDaLoja: string): string {
  return [
    `Você analisa conversas de venda de ${nomeDaLoja} e escreve a ficha do cliente para o vendedor ler antes de falar com ele.`,
    '',
    'REGRAS, todas obrigatórias:',
    '',
    '1. NÃO INVENTE. Toda afirmação precisa estar na conversa ou nos fatos do',
    '   CRM. Não há "provavelmente", não há o que costuma acontecer em vendas.',
    '   Se o dado não está aí, o campo fica curto ou vazio.',
    '',
    '2. CADA SINAL E CADA OBJEÇÃO LEVA EVIDÊNCIA: um trecho curto do que foi',
    '   dito, de onde você tirou aquilo. Se não consegue citar, não inclua.',
    '',
    '3. NUNCA prometa preço, desconto, parcela, prazo, brinde ou condição que a',
    '   loja não tenha oferecido NESTA conversa. A mensagem sugerida vai para',
    '   um cliente de verdade, e promessa inventada alguém tem que honrar ou',
    '   desdizer.',
    '',
    '4. FATO DO CRM E DEDUÇÃO SUA SÃO COISAS DIFERENTES. Se a conversa mostra',
    '   que a pessoa comprou mas o CRM não tem venda registrada, diga as duas',
    '   coisas — é informação útil para a loja, não um conflito a resolver',
    '   escolhendo um lado.',
    '',
    '5. NÃO TRANSFORME COINCIDÊNCIA EM CAUSA. "Ele sumiu depois que a loja',
    '   mandou o preço" é o que aconteceu; "o preço afastou o cliente" é uma',
    '   conclusão que você não tem como sustentar.',
    '',
    '6. Transcrição de áudio pode ter erro de transcrição. Use o sentido, não',
    '   cite palavra por palavra como se fosse texto digitado.',
    '',
    '7. Escreva em português brasileiro, direto, para alguém de balcão ler em',
    '   quinze segundos. Sem jargão de consultoria, sem "potencial cliente",',
    '   sem "jornada". Chame a pessoa pelo nome.',
    '',
    'RESPONDA SOMENTE COM JSON VÁLIDO, sem markdown e sem texto fora do JSON,',
    'exatamente neste formato:',
    '',
    '{',
    '  "classificacao": "customer|hot|warm|followup|stalled|lost|unqualified",',
    '  "score": 0 a 100,',
    '  "riscoPerda": 0 a 100,',
    '  "perfil": "como esta pessoa compra, em 1 a 3 palavras",',
    '  "diagnostico": "o estado desta conversa agora, em 1 ou 2 frases",',
    '  "relato": "o que aconteceu, do começo ao fim, em 2 a 4 parágrafos curtos separados por \\n\\n",',
    '  "sinais": [{ "rotulo": "o sinal, curto", "evidencia": "o trecho que prova" }],',
    '  "objecoes": [{ "rotulo": "a objeção", "evidencia": "o trecho", "desfecho": "como terminou, ou \'em aberto\'" }],',
    '  "pontasSoltas": ["o que ficou combinado ou prometido e ninguém retomou"],',
    '  "proximaAcao": "o que fazer agora, uma frase, concreta",',
    '  "proximaAcaoPorque": "por que essa e não outra, uma frase",',
    '  "urgencia": "critical|high|medium|low",',
    '  "mensagemSugerida": "a mensagem de WhatsApp para mandar agora, no máximo 3 frases"',
    '}',
    '',
    'Sobre a CLASSIFICAÇÃO: use "customer" quando a conversa mostra que a pessoa',
    'comprou, mesmo que o CRM não tenha a venda registrada. Use "unqualified" só',
    'quando não houve conversa de verdade.',
    '',
    'Sobre o SCORE: para quem comprou, é a chance de comprar de novo. Para quem',
    'não comprou, é a chance de fechar. Não é nota de simpatia.',
    '',
    'Listas vazias são respostas válidas. Conversa de três mensagens produz',
    'ficha de três linhas, e está certo.',
    '',
    GABARITO,
  ].join('\n')
}

/**
 * O modelo às vezes embrulha o JSON em ```json. Isso não é erro dele a ponto
 * de valer uma rodada perdida — é formatação, e desembrulhar custa uma linha.
 */
function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(limpo)
  } catch {
    // Última tentativa: o primeiro { até o último } da resposta.
    const i = limpo.indexOf('{')
    const j = limpo.lastIndexOf('}')
    if (i < 0 || j <= i) return null
    try { return JSON.parse(limpo.slice(i, j + 1)) } catch { return null }
  }
}

const CLASSES: Classification[] = ['customer', 'hot', 'warm', 'followup', 'stalled', 'lost', 'unqualified']
const URGENCIAS = ['critical', 'high', 'medium', 'low'] as const

const texto = (v: unknown, teto: number): string =>
  typeof v === 'string' ? v.trim().slice(0, teto) : ''

const numero = (v: unknown, padrao: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : padrao
}

/**
 * VALIDAR NÃO É DESCONFIAR DO MODELO — É IMPEDIR QUE A TELA QUEBRE.
 *
 * O que vem daqui vai direto para o React. Um `sinais` que voltou string em
 * vez de lista derruba a página inteira do lead com "s.map is not a function",
 * e o vendedor vê tela branca. Tudo que não couber no formato vira o valor
 * seguro; o que sobreviver é o que a tela mostra.
 */
function validar(bruto: unknown): PerfilIA | null {
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as Record<string, unknown>

  const relato = texto(o.relato, 4_000)
  const diagnostico = texto(o.diagnostico, 600)
  // Sem relato nem diagnóstico não há ficha — devolver um esqueleto vazio
  // seria pior que assumir a falha e deixar o motor antigo aparecer.
  if (!relato && !diagnostico) return null

  const lista = <T,>(v: unknown, f: (x: Record<string, unknown>) => T | null, teto: number): T[] =>
    Array.isArray(v)
      ? v.filter((x) => x && typeof x === 'object')
        .map((x) => f(x as Record<string, unknown>))
        .filter((x): x is T => x !== null)
        .slice(0, teto)
      : []

  const classificacao = CLASSES.includes(o.classificacao as Classification)
    ? (o.classificacao as Classification)
    : 'followup'

  return {
    classificacao,
    score: numero(o.score, 50),
    riscoPerda: numero(o.riscoPerda, 0),
    perfil: texto(o.perfil, 40) || '—',
    diagnostico,
    relato,
    sinais: lista(o.sinais, (x) => {
      const rotulo = texto(x.rotulo, 60)
      return rotulo ? { rotulo, evidencia: texto(x.evidencia, 240) } : null
    }, 8),
    objecoes: lista(o.objecoes, (x) => {
      const rotulo = texto(x.rotulo, 60)
      return rotulo ? { rotulo, evidencia: texto(x.evidencia, 240), desfecho: texto(x.desfecho, 160) } : null
    }, 6),
    pontasSoltas: Array.isArray(o.pontasSoltas)
      ? o.pontasSoltas.map((x) => texto(x, 240)).filter(Boolean).slice(0, 5)
      : [],
    proximaAcao: texto(o.proximaAcao, 400),
    proximaAcaoPorque: texto(o.proximaAcaoPorque, 400),
    urgencia: (URGENCIAS as readonly string[]).includes(String(o.urgencia))
      ? (o.urgencia as PerfilIA['urgencia'])
      : 'medium',
    mensagemSugerida: texto(o.mensagemSugerida, 900),
  }
}

export type ResultadoPerfil =
  | { ok: true; perfil: PerfilIA; ms: number }
  | { ok: false; status: number; erro: string }

/** Gera a ficha. NÃO grava — quem chama decide isso. */
export async function gerarPerfil(opts: {
  empresaId: number
  lead: Lead
  ficha: Ficha
  travou: Travou | null
  nomeDaLoja: string
  kanban: string | null
  temVendaRegistrada: boolean
  valorVenda: number | null
  diasAteVenda: number | null
}): Promise<ResultadoPerfil> {
  const t0 = Date.now()
  const r = await perguntarIA({
    empresaId: opts.empresaId,
    system: regras(opts.nomeDaLoja),
    mensagens: [{ role: 'user', content: contextoDoPerfil(opts) }],
    origem: 'perfil',
  })
  if (!r.ok) return { ok: false, status: r.status, erro: r.erro }

  const perfil = validar(extrairJson(r.texto))
  if (!perfil) {
    console.error('[zapintel/perfil] resposta fora do formato:', r.texto.slice(0, 400))
    return { ok: false, status: 502, erro: 'A IA respondeu fora do formato. Tente de novo.' }
  }
  return { ok: true, perfil, ms: Date.now() - t0 }
}

export interface PerfilGuardado {
  perfil: PerfilIA
  geradoEm: string
  modelo: string | null
  /** A ficha foi escrita para a conversa como ela está AGORA? */
  atual: boolean
}

/**
 * Lê o que está guardado — e diz se ainda vale.
 *
 * Nunca gera. A tela precisa abrir instantânea com o que existe, mesmo velho,
 * e decidir ela mesma se pede uma nova. Uma função que "lê ou gera" faria a
 * abertura do lead esperar 8 segundos pela IA na primeira vez, que é
 * exatamente o que guardar veio evitar.
 */
export async function lerPerfil(
  db: SupabaseClient,
  empresaId: number,
  leadId: number,
  marca: MarcaDaConversa,
): Promise<PerfilGuardado | null> {
  const { data } = await db
    .from('zapintel_lead_perfil')
    .select('perfil, marca, mensagens, transcritos, versao, modelo, gerado_em')
    .eq('empresa_id', empresaId).eq('lead_id', leadId)
    .maybeSingle()
  if (!data) return null

  const linha = data as {
    perfil: unknown; marca: number; mensagens: number; transcritos: number
    versao: string; modelo: string | null; gerado_em: string
  }
  const perfil = validar(linha.perfil)
  if (!perfil) return null

  return {
    perfil,
    geradoEm: linha.gerado_em,
    modelo: linha.modelo,
    atual: linha.versao === VERSAO_DO_PERFIL
      && Number(linha.marca) === marca.marca
      && linha.mensagens === marca.mensagens
      && linha.transcritos === marca.transcritos,
  }
}

export async function guardarPerfil(
  db: SupabaseClient,
  empresaId: number,
  leadId: number,
  marca: MarcaDaConversa,
  perfil: PerfilIA,
  modelo: string | null,
  ms: number,
): Promise<void> {
  const { error } = await db
    .from('zapintel_lead_perfil')
    .upsert({
      lead_id: leadId,
      empresa_id: empresaId,
      perfil: perfil as unknown as Record<string, unknown>,
      marca: marca.marca,
      mensagens: marca.mensagens,
      transcritos: marca.transcritos,
      modelo,
      versao: VERSAO_DO_PERFIL,
      ms,
      gerado_em: new Date().toISOString(),
    } as never, { onConflict: 'lead_id' })
  // Falhar ao guardar não pode derrubar a resposta: a ficha já está pronta e
  // é o que o vendedor pediu. Perde-se o cache, não o trabalho.
  if (error) console.error('[zapintel/perfil] nao guardou:', error.message)
}

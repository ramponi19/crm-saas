import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { mensagemDoProvedor } from '@/lib/assistente-erros'

/**
 * A ÚNICA PORTA DE IA DO ZAPINTEL.
 *
 * (A rota `/zapintel/api/analyze`, o Copiloto e o Relatório saíram em
 * 15/10/2026 — eram os chamadores do motor antigo.)
 *
 * ══ POR QUE ISTO VIROU UM MÓDULO ═══════════════════════════════════════════
 *
 * Em 11/10/2026 esta plumbing nasceu dentro de `/zapintel/api/analyze`, porque
 * havia um chamador só. Depois vieram outros — a ficha por IA, a sugestão no
 * ponto de travamento — e um segundo caminho significaria:
 * desligar a IA no painel e uma das telas continuar chamando; trocar o modelo
 * e uma ficar no antigo; consumo que não aparece na conta. É exatamente a
 * duplicidade que este módulo passou a semana removendo.
 *
 * ══ O QUE ELA GARANTE, EM TODO CHAMADOR ════════════════════════════════════
 *
 *   `assistente_config.ativo` ..... a chave-geral de desligar a IA do CRM
 *   `assistente_config.modelo` .... o modelo que o superadmin escolhe na tela
 *   `mensagemDoProvedor()` ........ traduz o erro do provedor para o balcão
 *   `assistente_uso` .............. a contabilidade de tokens, por empresa
 *
 * ══ UM PROVEDOR SÓ: ANTHROPIC (desde 16/10/2026) ═══════════════════════════
 *
 * Até 16/10 esta porta escolhia o provedor pelo nome do modelo e mandava ao
 * Google tudo o que não começasse com `claude-`. Saiu porque:
 *
 *   - a chave do Gemini deste projeto era do plano GRATUITO (20 chamadas por
 *     dia no `gemini-3.6-flash`, medido em 14/10) — e o gratuito do Google usa
 *     o que recebe para treinar, com conversas que têm CPF e endereço;
 *   - em produção não havia `GEMINI_API_KEY`, então o caminho existia só para
 *     falhar com 503;
 *   - dois provedores são duas traduções de erro, dois formatos de uso e duas
 *     regras de raciocínio para manter de acordo.
 *
 * A regra agora (ver `modeloDoZapintel`): modelo vazio → `claude-haiku-5-5`;
 * modelo `claude-…` → ele; QUALQUER outro → 503 com a instrução de trocar em
 * /superadmin/assistente. Nunca outro provedor, nem por engano.
 *
 * O assistente (`/api/assistente`, `/api/assistente/meu-dia`) usa o mesmo
 * `assistente_config.modelo` e continua no Gemini por `fetch` — fora deste
 * módulo e fora do escopo desta troca.
 *
 * ══ O TETO DE TOKENS É DE SEGURANÇA, NUNCA DE FORMATAÇÃO ═══════════════════
 *
 * Erro meu, pego em produção em 13/10/2026 (ainda no Gemini): pedi 4 frases e
 * pus um teto de 400 tokens achando que limitava o TAMANHO da resposta. O
 * pensamento do modelo é cobrado do mesmo saldo, os 400 acabaram no meio do
 * raciocínio, e a tela recebeu meia frase em inglês. Vale igual no Claude.
 *
 * **O tamanho se controla pelo PROMPT** ("no máximo 2 frases"), que o modelo
 * obedece. O teto existe só para um modelo em loop não prender a função.
 *
 * ══ O ERRO NUNCA É SÓ `false` ══════════════════════════════════════════════
 *
 * Devolve `{ ok: false, status, erro }` com a mensagem JÁ traduzida, porque
 * quem lê é um vendedor no balcão. A rota repassa; o cru vai para o log do
 * servidor, onde serve.
 */

/** Modelo do ZapIntel quando `assistente_config.modelo` está vazio. */
export const MODELO_PADRAO_ZAPINTEL = 'claude-haiku-5-5'

export const ERRO_MODELO_NAO_CLAUDE =
  'Modelo de IA não configurado; defina um modelo Claude em /superadmin/assistente'

/**
 * O modelo que a ficha e a sugestão vão usar — ou `null` se o configurado não
 * é da Anthropic. Ver o cabeçalho: não existe "outro provedor" para cair.
 */
export function modeloDoZapintel(configurado: string | null | undefined): string | null {
  const m = (configurado ?? '').trim()
  if (!m) return MODELO_PADRAO_ZAPINTEL
  return m.startsWith('claude-') ? m : null
}

/**
 * QUANTO A FUNÇÃO ESPERA PELA IA — e por que estes números.
 *
 * As duas rotas que chamam daqui (`/zapintel/api/perfil` e `/sugestao`) têm
 * `maxDuration = 60`. O plano da Vercel deste projeto é o Hobby, e com Fluid
 * Compute o teto dele é 300 s (documentação de limites, conferida em
 * 16/10/2026) — dava para subir. Não subi, de propósito:
 *
 *   - quem pede a ficha é um vendedor no balcão olhando um botão girar. Uma
 *     resposta que leva mais de 50 s já fracassou como ajuda; esticar o teto
 *     só alonga a espera antes da mesma mensagem de erro;
 *   - a ficha normal (Haiku, ~2.400 tokens de entrada e ~1.500 de saída)
 *     volta em poucos segundos. 25 s por tentativa é folga de várias vezes;
 *   - o robô de fichas pede uma de cada vez: uma chamada presa 5 minutos
 *     segura a fila inteira.
 *
 * Então: 25 s por tentativa, UMA repetição (o SDK repete sozinho em 408, 409,
 * 429, 5xx e queda de conexão), e um prazo TOTAL de 50 s por cima de tudo.
 *
 * O prazo total existe porque o SDK (0.133) obedece o cabeçalho `retry-after`
 * do provedor sem teto: um 429 com `retry-after: 40` faria 25 + 40 + 25 s e
 * a função morreria em 60 s sem dizer por quê. Com o prazo, o pior caso é
 * 50 s de IA mais a leitura do banco, dentro dos 60.
 *
 * Risco aceito: Sonnet e Opus escrevem mais devagar e podem passar de 25 s
 * numa conversa longa. Se o superadmin trocar para um deles e as fichas
 * começarem a voltar "demorou demais", o log `zapintel.ia.falha` com
 * `motivo: "timeout"` mostra — e o número a mexer é este.
 */
/*
 * 20/10/2026 — 25/50 s virou 90/110 s. Medido com conversas reais e o
 * Haiku: ele escreve ~100 tokens/s e a ficha sai com 2.000 a 4.800 tokens
 * (o raciocínio conta), não os ~1.500 da conta acima. Com 25 s, uma conversa
 * longa estourava a primeira tentativa até com o prompt antigo, e a segunda
 * recomeçava do zero; com o prompt de diretor, 2 de 5 fichas de teste
 * voltavam "demorou demais". Uma ficha que falha custa mais espera que uma
 * que leva 50 s. As rotas subiram para `maxDuration = 120` junto.
 */
const TIMEOUT_POR_TENTATIVA_MS = 90_000
const REPETICOES = 1
const PRAZO_TOTAL_MS = 110_000

export const ERRO_DEMOROU = 'A análise demorou demais, tente novamente'

export interface MensagemIA { role: string; content: string }

export type ResultadoIA =
  /**
   * `modelo` volta junto porque quem GUARDA a resposta precisa registrar quem
   * a escreveu. A ficha do lead (`lib/zapintel/perfil.ts`) fica meses no
   * banco, e o superadmin pode trocar o modelo na tela a qualquer momento —
   * sem este campo, uma ficha ruim não teria como ser atribuída ao modelo que
   * a produziu.
   */
  | { ok: true; texto: string; modelo: string }
  | { ok: false; status: number; erro: string }

export async function perguntarIA(opts: {
  empresaId: number
  system?: string
  mensagens: MensagemIA[]
  /**
   * Teto de SEGURANÇA, não de formatação. Ver o cabeçalho: o pensamento do
   * modelo é cobrado deste mesmo saldo, e um teto apertado trunca a resposta
   * no meio do raciocínio. Para encurtar a saída, peça isso no `system`.
   */
  maxTokens?: number
  /** Aparece no log junto do erro cru, para saber QUEM chamou. */
  origem: string
  /**
   * Modelo a usar NESTA chamada, por cima do que o superadmin configurou.
   *
   * Existe para o lote de fichas (`scripts/perfil-zapintel.mts --modelo`),
   * que roda na máquina do Lucas. Vale a mesma regra do configurado: só
   * `claude-…`. Nenhuma rota do CRM passa este campo.
   */
  modelo?: string
}): Promise<ResultadoIA> {
  const { empresaId, system, mensagens, maxTokens, origem } = opts

  if (!mensagens.length) {
    return { ok: false, status: 400, erro: 'Nada a analisar.' }
  }

  const svc = createServiceClient()
  const { data: cfg } = await svc
    .from('assistente_config').select('ativo, modelo').eq('id', 1).maybeSingle()
  if (cfg && cfg.ativo === false) {
    return { ok: false, status: 503, erro: 'A IA está temporariamente desativada.' }
  }

  const pedido = opts.modelo || (cfg?.modelo as string | null | undefined)
  const modelo = modeloDoZapintel(pedido)
  if (!modelo) {
    console.error(JSON.stringify({ evento: 'zapintel.ia.falha', motivo: 'modelo_nao_claude', origem, modelo: pedido }))
    return { ok: false, status: 503, erro: ERRO_MODELO_NAO_CLAUDE }
  }

  return perguntarAnthropic({ svc, empresaId, system, mensagens, maxTokens, origem, modelo })
}

/**
 * A IA do CRM vai responder? Chave da Anthropic, modelo Claude (ou vazio) e a
 * chave-geral do superadmin — as mesmas condições que `perguntarIA` checa,
 * perguntadas antes, numa consulta, em vez de descobertas lead a lead por uma
 * função inteira que já nasce morta. É o `iaDisponivel` que a tela e o robô
 * de fichas leem.
 */
export async function iaDoCrmLigada(): Promise<boolean> {
  const { data: cfg } = await createServiceClient()
    .from('assistente_config').select('ativo, modelo').eq('id', 1).maybeSingle()
  return !!process.env.ANTHROPIC_API_KEY
    && !!modeloDoZapintel(cfg?.modelo as string | null | undefined)
    && cfg?.ativo !== false
}

/**
 * ══ AS ESCOLHAS DA CHAMADA ═════════════════════════════════════════════════
 *
 * - **Sem `temperature`.** No Claude Haiku 5.5 um valor diferente do padrão
 *   é recusado com 400.
 * - **`effort: 'low'`**: o trabalho aqui é redação sobre fatos já separados,
 *   não raciocínio. O padrão do Haiku 5.5 é `medium`, e por isso vai explícito.
 * - **O `system` vai com `cache_control`.** Regras + gabarito são idênticos
 *   em toda ficha; a partir da segunda chamada a Anthropic cobra ~10% por
 *   esse trecho. Abaixo do mínimo cacheável do modelo ele simplesmente não
 *   cacheia — não há erro, só não há desconto.
 * - **Repetição vem do SDK**, uma vez (ver `TIMEOUT_POR_TENTATIVA_MS`).
 */
async function perguntarAnthropic(o: {
  svc: ReturnType<typeof createServiceClient>
  empresaId: number
  system?: string
  mensagens: MensagemIA[]
  maxTokens?: number
  origem: string
  modelo: string
}): Promise<ResultadoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, status: 503, erro: 'A IA ainda não foi configurada neste CRM. Avise o responsável.' }
  }

  const client = new Anthropic({ apiKey, timeout: TIMEOUT_POR_TENTATIVA_MS, maxRetries: REPETICOES })
  const prazo = AbortSignal.timeout(PRAZO_TOTAL_MS)
  const t0 = Date.now()
  const falha = (motivo: string, extra: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({
      evento: 'zapintel.ia.falha', motivo, origem: o.origem, modelo: o.modelo, ms: Date.now() - t0, ...extra,
    }))

  /**
   * TODA CHAMADA À ANTHROPIC VIRA UMA LINHA EM `assistente_uso` (17/10/2026).
   *
   * Antes, só a que voltava com texto: recusa, resposta vazia, timeout e erro da
   * API sumiam da conta do superadmin — e algumas dessas a Anthropic cobra (a
   * recusa e a resposta vazia vêm com `usage`). Agora grava no `finally`, com os
   * tokens quando a resposta chegou e `null` quando não chegou (não dá para
   * saber o que foi cobrado num timeout). Vale para as rotas e para o lote do
   * script, que passam por aqui. Erro ao gravar não derruba a resposta: vai
   * para o log (`zapintel.ia.uso_nao_gravado`).
   */
  let usoRecebido: Anthropic.Usage | null = null
  const gravarUso = async () => {
    const u = usoRecebido
    try {
      const { error } = await o.svc.from('assistente_uso').insert({
        empresa_id: o.empresaId,
        tokens_in: u ? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : null,
        tokens_out: u ? u.output_tokens ?? null : null,
      } as never) as { error: { message: string } | null }
      if (error) throw new Error(error.message)
    } catch (e) {
      console.error(JSON.stringify({
        evento: 'zapintel.ia.uso_nao_gravado', origem: o.origem, empresa_id: o.empresaId, erro: e instanceof Error ? e.message : String(e),
      }))
    }
  }

  try {
    const r = await client.messages.create({
      model: o.modelo,
      // Teto de SEGURANÇA: o pensamento sai deste saldo. O tamanho da
      // resposta se pede no `system`.
      max_tokens: o.maxTokens ?? 16_000,
      ...(o.system
        ? { system: [{ type: 'text' as const, text: o.system, cache_control: { type: 'ephemeral' as const } }] }
        : {}),
      messages: o.mensagens.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      output_config: { effort: 'low' },
    }, { signal: prazo })
    usoRecebido = r.usage ?? null

    if (r.stop_reason === 'refusal') {
      falha('recusa', { categoria: r.stop_details?.category ?? null })
      return { ok: false, status: 502, erro: 'A IA não conseguiu analisar esta conversa.' }
    }

    const texto = r.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    // Parar em max_tokens antes de escrever texto também devolve vazio.
    if (!texto.trim()) {
      falha('resposta_vazia', { stop_reason: r.stop_reason })
      return { ok: false, status: 502, erro: 'A IA não conseguiu responder agora. Tente de novo.' }
    }

    return { ok: true, texto: texto.trim(), modelo: o.modelo }
  } catch (e) {
    /**
     * DEMOROU ≠ O PROVEDOR RECUSOU — e o log diz qual dos dois.
     *
     * A ordem importa: `APIConnectionTimeoutError` e `APIUserAbortError` são
     * subclasses de `APIError`. Testar `APIError` primeiro faria todo estouro
     * de tempo aparecer como "provedor recusou", sem status, e ninguém saberia
     * que o número a mexer é o timeout. O abort aqui só pode ser o nosso
     * `PRAZO_TOTAL_MS` — nenhum chamador passa outro sinal.
     */
    if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError || prazo.aborted) {
      falha('timeout', { limite_ms: prazo.aborted ? PRAZO_TOTAL_MS : TIMEOUT_POR_TENTATIVA_MS })
      return { ok: false, status: 504, erro: ERRO_DEMOROU }
    }
    if (e instanceof Anthropic.APIError) {
      falha('erro_api', { status: e.status ?? null, erro: e.message })
      return { ok: false, status: 502, erro: mensagemDoProvedor(e.status ?? 500, e.message) }
    }
    falha('erro_inesperado', { erro: e instanceof Error ? e.message : String(e) })
    return {
      ok: false,
      status: 500,
      erro: 'A IA está indisponível neste momento. Tente de novo em alguns minutos.',
    }
  } finally {
    await gravarUso()
  }
}

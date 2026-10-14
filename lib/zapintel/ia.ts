import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { mensagemDoProvedor, MODELO_PADRAO } from '@/lib/assistente-erros'

/**
 * A ÚNICA PORTA DE IA DO ZAPINTEL.
 *
 * ══ POR QUE ISTO VIROU UM MÓDULO ═══════════════════════════════════════════
 *
 * Em 11/10/2026 esta plumbing nasceu dentro de `/zapintel/api/analyze`, porque
 * havia um chamador só. Hoje há três — o Copiloto, a sugestão no ponto de
 * travamento e o parágrafo do dia — e um segundo caminho significaria:
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
 * ══ O TETO DE TOKENS É DE SEGURANÇA, NUNCA DE FORMATAÇÃO ═══════════════════
 *
 * Este foi um erro meu, pego em produção em 13/10/2026. Pedi 4 frases e pus
 * `maxOutputTokens: 400` achando que estava limitando o TAMANHO da resposta. O
 * que voltou para a tela do Lucas foi isto:
 *
 *     Sales conversion: 32 (1.4%)
 *         *
 *
 * Em inglês, truncado, com um asterisco solto. A documentação do Gemini
 * explica por quê, e desaconselha exatamente o que eu fiz:
 *
 *   "max_output_tokens ... sets the maximum number of tokens a response can
 *    generate, INCLUDING THOUGHT TOKENS. If the model hits this limit while
 *    reasoning, it stops generating with status 'incomplete' and returns
 *    truncated or empty output (while still billing for any thinking tokens
 *    generated). To reduce cost or latency without truncating responses,
 *    lower thinking_level instead of setting a small max_output_tokens."
 *
 * O modelo deste CRM é `gemini-3.6-flash` (escolhido em `assistente_config`),
 * que pensa em nível `medium` por padrão. Os 400 tokens acabavam no meio do
 * raciocínio e a resposta nascia pela metade.
 *
 * **O tamanho se controla pelo PROMPT** ("no máximo 4 frases"), que o modelo
 * obedece. O teto aqui existe só para que um modelo em loop não prenda a
 * função até o limite da plataforma. Medido com 8.000: as mesmas 4 frases, em
 * português, só com os números do briefing.
 *
 * ══ O ERRO NUNCA É SÓ `false` ══════════════════════════════════════════════
 *
 * Devolve `{ ok: false, status, erro }` com a mensagem JÁ traduzida, porque
 * quem lê é um vendedor no balcão. A rota repassa; o cru vai para o log do
 * servidor, onde serve. "Quota exceeded for metric generativelanguage..." na
 * tela é texto que manda o lojista para a documentação de uma API que não é
 * dele.
 */

/**
 * Folga suficiente para o modelo pensar e ainda escrever. Não é o tamanho da
 * resposta — esse se pede no `system`. Ver o cabeçalho.
 */
const TETO_DE_SEGURANCA = 8_000

/**
 * QUANTO O MODELO PENSA ANTES DE ESCREVER.
 *
 * Medido em produção em 13/10/2026: com o padrão (`medium` no
 * `gemini-3.6-flash`), o resumo do dia **estourou 20 s de timeout** — duas
 * vezes seguidas, com o briefing completo da JM. O log registrou
 * `TimeoutError` e a tela mostrou "a IA está indisponível".
 *
 * A documentação do Gemini diz que é por aqui que se corta tempo e custo, e
 * não pelo teto de saída:
 *
 *   "To reduce cost or latency without truncating responses, lower
 *    thinking_level (low or medium) instead of setting a small
 *    max_output_tokens."
 *
 * `low` é o certo para o que este módulo pede: escrever em frase números que
 * já vêm calculados, e redigir uma mensagem de WhatsApp. Nenhuma das duas é
 * tarefa de raciocínio — é redação. Raciocínio aqui é tempo e cota gastos
 * para chegar na mesma frase.
 *
 * Níveis que o 3.6 aceita: minimal, low, medium, high.
 */
const NIVEL_DE_RACIOCINIO = 'low'

export interface MensagemIA { role: string; content: string }

export type ResultadoIA =
  /**
   * `modelo` volta junto porque quem GUARDA a resposta precisa registrar quem
   * a escreveu. A ficha do lead (`lib/zapintel/perfil.ts`) fica meses no
   * banco, e o superadmin pode trocar o modelo na tela a qualquer momento —
   * sem este campo, uma ficha ruim não teria como ser atribuída ao modelo que
   * a produziu, e a comparação entre dois modelos viraria memória de quem
   * estava na sala.
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
   * Existe para o lote de fichas (`scripts/perfil-zapintel.mts --modelo`):
   * ele roda na máquina do Lucas com outro provedor enquanto a produção
   * continua no modelo configurado. Trocar `assistente_config.modelo` para
   * isso derrubaria toda a IA do CRM em produção, que não tem a chave do
   * outro provedor. Nenhuma rota do CRM passa este campo.
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
  const modelo = opts.modelo || cfg?.modelo || process.env.GEMINI_MODEL || MODELO_PADRAO

  if (provedorDo(modelo) === 'anthropic') {
    return perguntarAnthropic({ svc, empresaId, system, mensagens, maxTokens, origem, modelo })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, status: 503, erro: 'A IA ainda não foi configurada neste CRM. Avise o responsável.' }
  }

  const corpo = (comThinking: boolean) => JSON.stringify({
    // O Gemini separa a instrução de sistema das mensagens, e chama
    // "model" o que a Anthropic chama "assistant".
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents: mensagens.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: maxTokens ?? TETO_DE_SEGURANCA,
      ...(comThinking ? { thinkingConfig: { thinkingLevel: NIVEL_DE_RACIOCINIO } } : {}),
    },
  })

  const chamar = (comThinking: boolean) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo(comThinking),
      // Provedor lento prende a função até o limite da plataforma e o usuário
      // fica olhando um botão girar. 45 s porque 20 s não bastavam: ver
      // NIVEL_DE_RACIOCINIO.
      signal: AbortSignal.timeout(45_000),
    },
  )

  try {
    let r = await chamar(true)
    let j = await r.json()

    /**
     * O MODELO PODE NÃO CONHECER `thinkingLevel` — e aí a culpa não é do pedido.
     *
     * `assistente_config.modelo` é escolhido pelo superadmin numa lista que vem
     * da própria API do Google, então amanhã pode estar lá um modelo antigo que
     * recusa o campo com 400. Sem esta volta, UMA escolha de modelo na tela de
     * configuração derrubaria TODA a IA do CRM — assistente, copiloto, sugestão
     * e resumo do dia — com um erro que não diz o que houve.
     *
     * Então: se o 400 fala do campo, repete sem ele. Uma vez só, e o log diz
     * que aconteceu, para ninguém descobrir isso de novo do zero.
     */
    if (!r.ok && r.status === 400 && /thinking/i.test(String(j?.error?.message ?? ''))) {
      console.warn(`[zapintel/ia:${origem}] ${modelo} recusou thinkingLevel; repetindo sem ele`)
      r = await chamar(false)
      j = await r.json()
    }

    /**
     * 503 DO GOOGLE É PICO DE DEMANDA, E ELE MESMO DIZ QUE PASSA.
     *
     *   "This model is currently experiencing high demand. Spikes in demand
     *    are usually temporary. Please try again later."
     *
     * Visto várias vezes em 13/10/2026 no `gemini-3.6-flash`, intercalado com
     * respostas boas — 6 de 6 numa medição, 2 recusas na seguinte. Desistir na
     * primeira faz uma funcionalidade que funciona parecer quebrada.
     *
     * Uma tentativa, depois de dois segundos. Mais que isso vira espera longa
     * para alguém que está olhando a tela, e o erro traduzido já diz o que
     * fazer.
     */
    if (!r.ok && r.status === 503) {
      console.warn(`[zapintel/ia:${origem}] ${modelo} em alta demanda; tentando de novo`)
      await new Promise((ok) => setTimeout(ok, 2_000))
      r = await chamar(true)
      j = await r.json()
    }

    if (!r.ok) {
      const cru = (j?.error?.message as string) ?? `HTTP ${r.status}`
      console.error(`[zapintel/ia:${origem}] provedor recusou:`, r.status, modelo, cru)
      return { ok: false, status: 502, erro: mensagemDoProvedor(r.status, cru) }
    }

    const texto = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('')

    const uso = j?.usageMetadata
    await svc.from('assistente_uso').insert({
      empresa_id: empresaId,
      tokens_in: uso?.promptTokenCount ?? null,
      tokens_out: uso?.candidatesTokenCount ?? null,
    } as never)

    return { ok: true, texto: texto.trim(), modelo }
  } catch (e) {
    console.error(`[zapintel/ia:${origem}]`, e)
    return {
      ok: false,
      status: 500,
      erro: 'A IA está indisponível neste momento. Tente de novo em alguns minutos.',
    }
  }
}

/**
 * DE QUEM É O MODELO — decidido pelo nome, não por configuração à parte.
 *
 * Um campo "provedor" separado de "modelo" seria duas coisas para manter de
 * acordo, e a primeira vez que alguém trocasse uma sem a outra o CRM mandaria
 * um nome de modelo do Google para a Anthropic. O nome já diz: os da
 * Anthropic começam com `claude-`.
 */
export function provedorDo(modelo: string): 'anthropic' | 'gemini' {
  return modelo.startsWith('claude-') ? 'anthropic' : 'gemini'
}

/**
 * Existe chave para o provedor deste modelo? É o que a tela pergunta antes de
 * pedir uma ficha — ver `iaDisponivel` em `/zapintel/api/conversa`.
 */
export function iaConfigurada(modelo: string): boolean {
  return provedorDo(modelo) === 'anthropic'
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.GEMINI_API_KEY
}

/**
 * O MESMO CONTRATO, PELA ANTHROPIC.
 *
 * ══ POR QUE EXISTE ═════════════════════════════════════════════════════════
 *
 * Medido em 14/10/2026: a chave do Gemini deste projeto é do plano GRATUITO,
 * com limite de **20 chamadas por dia** no `gemini-3.6-flash`. O lote de
 * ~1.800 fichas parou na sexta chamada com "Quota exceeded ... limit: 20".
 * Além do limite, o gratuito do Google usa os dados para treinar — e estas
 * conversas têm CPF, endereço e e-mail de cliente.
 *
 * O Lucas já tinha decidido o caminho: *"se o free do gemini nao for
 * suficiente irei de anthropic mesmo"*.
 *
 * ══ AS DIFERENÇAS QUE IMPORTAM ═════════════════════════════════════════════
 *
 * - **Sem `temperature`.** No Claude Haiku 5.5 um valor diferente do padrão
 *   é recusado com 400 — copiar o corpo do Gemini quebraria toda chamada.
 * - **`effort: 'low'`** no lugar do `thinkingLevel` do Gemini, pelo mesmo
 *   motivo de lá: o trabalho aqui é redação sobre fatos já separados, não
 *   raciocínio. O padrão do Haiku 5.5 é `medium`, e por isso vai explícito.
 * - **O `system` vai com `cache_control`.** Regras + gabarito são idênticos
 *   em toda ficha; a partir da segunda chamada a Anthropic cobra ~10% por
 *   esse trecho. Abaixo do mínimo cacheável do modelo ele simplesmente não
 *   cacheia — não há erro, só não há desconto.
 * - **Repetição já vem do SDK** para 429, 529 (sobrecarga) e 5xx. Aqui fica
 *   só a tradução do erro para quem está no balcão.
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

  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 3 })

  try {
    const r = await client.messages.create({
      model: o.modelo,
      // Teto de SEGURANÇA, como no Gemini: o pensamento sai deste saldo.
      // O tamanho da resposta se pede no `system`.
      max_tokens: o.maxTokens ?? 16_000,
      ...(o.system
        ? { system: [{ type: 'text' as const, text: o.system, cache_control: { type: 'ephemeral' as const } }] }
        : {}),
      messages: o.mensagens.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      output_config: { effort: 'low' },
    })

    if (r.stop_reason === 'refusal') {
      console.error(`[zapintel/ia:${o.origem}] ${o.modelo} recusou:`, r.stop_details?.category ?? '?')
      return { ok: false, status: 502, erro: 'A IA não conseguiu analisar esta conversa.' }
    }

    const texto = r.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    const u = r.usage
    await o.svc.from('assistente_uso').insert({
      empresa_id: o.empresaId,
      tokens_in: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      tokens_out: u.output_tokens ?? null,
    } as never)

    return { ok: true, texto: texto.trim(), modelo: o.modelo }
  } catch (e) {
    // Do mais específico para o mais geral. `APIError` carrega o status HTTP,
    // que é o que `mensagemDoProvedor` usa para escolher a frase.
    if (e instanceof Anthropic.APIError) {
      console.error(`[zapintel/ia:${o.origem}] provedor recusou:`, e.status, o.modelo, e.message)
      return { ok: false, status: 502, erro: mensagemDoProvedor(e.status ?? 500, e.message) }
    }
    console.error(`[zapintel/ia:${o.origem}]`, e)
    return {
      ok: false,
      status: 500,
      erro: 'A IA está indisponível neste momento. Tente de novo em alguns minutos.',
    }
  }
}

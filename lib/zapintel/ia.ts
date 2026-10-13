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
  | { ok: true; texto: string }
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
}): Promise<ResultadoIA> {
  const { empresaId, system, mensagens, maxTokens, origem } = opts

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, status: 503, erro: 'A IA ainda não foi configurada neste CRM. Avise o responsável.' }
  }
  if (!mensagens.length) {
    return { ok: false, status: 400, erro: 'Nada a analisar.' }
  }

  const svc = createServiceClient()
  const { data: cfg } = await svc
    .from('assistente_config').select('ativo, modelo').eq('id', 1).maybeSingle()
  if (cfg && cfg.ativo === false) {
    return { ok: false, status: 503, erro: 'A IA está temporariamente desativada.' }
  }
  const modelo = cfg?.modelo || process.env.GEMINI_MODEL || MODELO_PADRAO

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

    return { ok: true, texto: texto.trim() }
  } catch (e) {
    console.error(`[zapintel/ia:${origem}]`, e)
    return {
      ok: false,
      status: 500,
      erro: 'A IA está indisponível neste momento. Tente de novo em alguns minutos.',
    }
  }
}

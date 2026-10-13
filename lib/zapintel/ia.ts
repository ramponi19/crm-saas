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
 * ══ O ERRO NUNCA É SÓ `false` ══════════════════════════════════════════════
 *
 * Devolve `{ ok: false, status, erro }` com a mensagem JÁ traduzida, porque
 * quem lê é um vendedor no balcão. A rota repassa; o cru vai para o log do
 * servidor, onde serve. "Quota exceeded for metric generativelanguage..." na
 * tela é texto que manda o lojista para a documentação de uma API que não é
 * dele.
 */

export interface MensagemIA { role: string; content: string }

export type ResultadoIA =
  | { ok: true; texto: string }
  | { ok: false; status: number; erro: string }

export async function perguntarIA(opts: {
  empresaId: number
  system?: string
  mensagens: MensagemIA[]
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

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // O Gemini separa a instrução de sistema das mensagens, e chama
          // "model" o que a Anthropic chama "assistant".
          ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
          contents: mensagens.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens ?? 1200 },
        }),
        // Sem isto, provedor lento prende a função até o limite da plataforma e
        // o usuário fica olhando um botão girando sem saber se ainda há algo
        // acontecendo.
        signal: AbortSignal.timeout(20_000),
      },
    )

    const j = await r.json()
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

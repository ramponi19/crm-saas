import { NextRequest, NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { createServiceClient } from '@/lib/supabase/service'
import { mensagemDoProvedor, MODELO_PADRAO } from '@/lib/assistente-erros'

/**
 * A IA DO ZAPINTEL — pela mesma porta do assistente do CRM.
 *
 * ══ ESTAVA MORTA, E CALADA ═════════════════════════════════════════════════
 *
 * Esta rota chamava a Anthropic direto, exigindo `ANTHROPIC_API_KEY`. Conferido
 * na Vercel em 11/10/2026: **essa variável não existe em nenhum ambiente** —
 * nem produção, nem preview, nem development. Então três funcionalidades eram
 * botões que sempre devolviam 500:
 *
 *   · o Copiloto de Vendas, na tela do lead
 *   · a sugestão de abordagem, na Agenda (tela já removida)
 *   · o Relatório Semanal
 *
 * A chave que EXISTE é `GEMINI_API_KEY`, em produção e preview, usada pelo
 * assistente do CRM desde sempre.
 *
 * ══ POR QUE REUSAR A PLUMBING DO ASSISTENTE, E NÃO SÓ TROCAR A URL ═════════
 *
 * Porque o CRM já resolveu, uma vez, tudo que esta rota precisaria resolver de
 * novo:
 *
 *   `assistente_config.ativo` ..... a chave-geral de desligar a IA
 *   `assistente_config.modelo` .... o modelo que o superadmin escolhe na tela
 *   `mensagemDoProvedor()` ........ traduz o erro do provedor para o balcão
 *   `assistente_uso` .............. a contabilidade de tokens
 *
 * Um segundo caminho de IA significaria: desligar a IA no painel e o ZapIntel
 * continuar chamando; trocar o modelo e o ZapIntel ficar no antigo; o vendedor
 * ver "Quota exceeded for metric generativelanguage..." numa tela e a mensagem
 * traduzida na outra; e consumo que não aparece na conta. É exatamente a
 * duplicidade que este módulo passou a semana removendo.
 *
 * ══ O CONTRATO NÃO MUDOU ═══════════════════════════════════════════════════
 *
 * Entra `{ system?, max_tokens?, messages: [{role, content}] }`, sai
 * `{ text }`. Os três chamadores continuam iguais — o formato da Anthropic
 * virou a interface interna, e traduzi-lo aqui é mais barato que mexer em
 * followUp.ts e no Relatório.
 */
export const dynamic = 'force-dynamic'

interface Mensagem { role: string; content: string }

export async function POST(req: NextRequest) {
  // A empresa vem da sessão. Além de identificar o tenant para a contabilidade,
  // é o que impede esta rota de virar um proxy de IA aberto para quem souber
  // a URL — ela estava sem nenhuma verificação de sessão.
  const { empresaId } = await zapintelEmpresa()

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'A IA ainda não foi configurada neste CRM. Avise o responsável.' },
      { status: 503 },
    )
  }

  const svc = createServiceClient()
  const { data: cfg } = await svc
    .from('assistente_config').select('ativo, modelo').eq('id', 1).maybeSingle()
  if (cfg && cfg.ativo === false) {
    return NextResponse.json(
      { error: 'A IA está temporariamente desativada.' },
      { status: 503 },
    )
  }
  const modelo = cfg?.modelo || process.env.GEMINI_MODEL || MODELO_PADRAO

  try {
    const body = (await req.json()) as {
      system?: string
      max_tokens?: number
      messages?: Mensagem[]
    }
    const mensagens = body.messages ?? []
    if (!mensagens.length) {
      return NextResponse.json({ error: 'nada a analisar' }, { status: 400 })
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // O Gemini separa a instrução de sistema das mensagens, e chama
          // "model" o que a Anthropic chama "assistant".
          ...(body.system ? { system_instruction: { parts: [{ text: body.system }] } } : {}),
          contents: mensagens.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.5, maxOutputTokens: body.max_tokens ?? 1200 },
        }),
        // Mesmo teto das outras rotas de IA do CRM. Sem ele, provedor lento
        // prende a função até o limite da plataforma e o usuário fica olhando
        // um botão girando sem saber se ainda há algo acontecendo.
        signal: AbortSignal.timeout(20_000),
      },
    )

    const j = await r.json()
    if (!r.ok) {
      // Cru no log, traduzido na tela — mesmo tratamento do assistente.
      const cru = (j?.error?.message as string) ?? `HTTP ${r.status}`
      console.error('[zapintel/analyze] provedor recusou:', r.status, modelo, cru)
      return NextResponse.json({ error: mensagemDoProvedor(r.status, cru) }, { status: 502 })
    }

    const texto = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('')

    const uso = j?.usageMetadata
    await svc.from('assistente_uso').insert({
      empresa_id: empresaId,
      tokens_in: uso?.promptTokenCount ?? null,
      tokens_out: uso?.candidatesTokenCount ?? null,
    } as never)

    return NextResponse.json({ text: texto.trim() })
  } catch (e) {
    console.error('[zapintel/analyze]', e)
    return NextResponse.json(
      { error: 'A IA está indisponível neste momento. Tente de novo em alguns minutos.' },
      { status: 500 },
    )
  }
}

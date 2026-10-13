import { NextRequest, NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { perguntarIA } from '@/lib/zapintel/ia'

/**
 * A IA DO ZAPINTEL — pela mesma porta do assistente do CRM.
 *
 * ══ ESTAVA MORTA, E CALADA ═════════════════════════════════════════════════
 *
 * Esta rota chamava a Anthropic direto, exigindo `ANTHROPIC_API_KEY`. Conferido
 * na Vercel em 11/10/2026: **essa variável não existe em nenhum ambiente** —
 * nem produção, nem preview, nem development. Então o Copiloto de Vendas e o
 * Relatório Semanal eram botões que sempre devolviam 500.
 *
 * ══ A PLUMBING SAIU DAQUI ══════════════════════════════════════════════════
 *
 * O que fala com o Gemini mora em `lib/zapintel/ia.ts` desde 12/10/2026, para
 * que a sugestão no ponto de travamento e o parágrafo do dia não abram um
 * segundo caminho. Ver o cabeçalho de lá para o que isso garante.
 *
 * ══ O CONTRATO NÃO MUDOU ═══════════════════════════════════════════════════
 *
 * Entra `{ system?, max_tokens?, messages: [{role, content}] }`, sai
 * `{ text }`. O formato da Anthropic virou a interface interna, e traduzi-lo
 * aqui é mais barato que mexer em `followUp.ts` e no Relatório.
 */
export const dynamic = 'force-dynamic'

/**
 * A função pode esperar até 45 s pelo provedor (ver `lib/zapintel/ia.ts`), e o
 * padrão da plataforma é menor que isso — sem esta linha a função morreria
 * antes do `fetch` desistir, e o log não diria por quê.
 *
 * Não ameaça o teto de CPU da conta: no modelo da Vercel, função PARADA
 * esperando rede não é Active CPU. O que custa é processar, e aqui quem
 * processa é o Google.
 */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // A empresa vem da sessão. Além de identificar o tenant para a contabilidade,
  // é o que impede esta rota de virar um proxy de IA aberto para quem souber
  // a URL — ela estava sem nenhuma verificação de sessão.
  const { empresaId } = await zapintelEmpresa()

  const body = (await req.json()) as {
    system?: string
    max_tokens?: number
    messages?: { role: string; content: string }[]
  }

  const r = await perguntarIA({
    empresaId,
    system: body.system,
    mensagens: body.messages ?? [],
    maxTokens: body.max_tokens,
    origem: 'analyze',
  })

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ text: r.texto })
}

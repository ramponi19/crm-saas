import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Assistente de ajuda do CRM (Gemini Flash), com streaming. Meta-safe: só responde
// no chat da tela — nunca envia mensagem a canal nem executa ação no sistema.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const LIMITE_POR_MIN = 20 // por empresa — segura abuso do tier grátis compartilhado

const SEGMENTO_CTX: Record<string, string> = {
  varejo: 'loja de varejo/celulares (PDV, estoque, produtos, garantia, assistência, orçamentos)',
  assistencia: 'assistência técnica (ordens de serviço, garantia, orçamentos)',
  servicos: 'prestador de serviços',
  imobiliaria: 'imobiliária (imóveis, proprietários, chaves, visitas na Agenda)',
  saude: 'clínica/saúde (agendamento de consultas na Agenda)',
  food: 'restaurante/food (cardápio, cozinha/KDS)',
  concessionaria: 'loja de veículos (avaliações, consulta FIPE, financiamento)',
}

function systemPrompt(segmento: string | null): string {
  const ctx = SEGMENTO_CTX[segmento ?? ''] ?? 'pequeno negócio'
  return `Você é o assistente do Nexus, um CRM. Esta empresa é uma ${ctx}.
Ajude o usuário a USAR o sistema: onde encontrar telas e como executar tarefas (vender no PDV, lançar orçamento, cadastrar produto/lead/cliente, gerar contrato, ver relatórios, etc.).
Regras:
- Responda em português do Brasil, curto e direto. Use **negrito** para nomes de menus/botões e listas numeradas para passos.
- Você NÃO tem acesso aos dados da empresa. Se pedirem números/relatórios específicos, oriente em qual menu ver (ex.: "veja em **Relatórios**").
- Não invente funcionalidades. Se não souber, diga que não tem certeza e sugira onde procurar.
- Nunca ofereça enviar mensagens por você; você só orienta.`
}

interface Msg { role: 'user' | 'model'; text: string }

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Assistente ainda não configurado (defina GEMINI_API_KEY).' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { mensagens?: Msg[]; contexto?: string }
  const mensagens = (Array.isArray(body.mensagens) ? body.mensagens : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
  if (mensagens.length === 0) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  // Rate-limit por empresa (service client — bypassa RLS da tabela de uso).
  const svc = createServiceClient()
  const desdeIso = new Date(Date.now() - 60_000).toISOString()
  const { count } = await svc.from('assistente_uso').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).gte('created_at', desdeIso)
  if ((count ?? 0) >= LIMITE_POR_MIN) {
    return NextResponse.json({ error: 'Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente de novo.' }, { status: 429 })
  }
  await svc.from('assistente_uso').insert({ empresa_id: empresaId } as never)

  // Contexto do segmento p/ respostas mais úteis.
  const { data: emp } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  let systemText = systemPrompt((emp as { segmento?: string | null } | null)?.segmento ?? null)
  if (body.contexto) systemText += `\n\nContexto: o usuário está na tela "${String(body.contexto).slice(0, 60)}".`

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents: mensagens.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!upstream.ok || !upstream.body) {
      const j = await upstream.json().catch(() => ({}))
      return NextResponse.json({ error: j?.error?.message ?? 'Erro no assistente' }, { status: 502 })
    }

    // Reencaminha só o TEXTO dos chunks SSE do Gemini como um stream de texto puro.
    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buf = ''
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) { controller.close(); return }
        buf += decoder.decode(value, { stream: true })
        const linhas = buf.split('\n')
        buf = linhas.pop() ?? ''
        for (const linha of linhas) {
          const l = linha.trim()
          if (!l.startsWith('data:')) continue
          const payload = l.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const obj = JSON.parse(payload)
            const txt = obj?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
            if (txt) controller.enqueue(encoder.encode(txt))
          } catch { /* chunk parcial — ignora */ }
        }
      },
      cancel() { reader.cancel().catch(() => {}) },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no assistente' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Assistente de ajuda do CRM (Gemini Flash). Meta-safe: só responde no chat da
// tela — nunca envia mensagem a canal nem executa ação no sistema.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

const SYSTEM = `Você é o assistente do Nexus, um CRM para pequenos negócios (loja de celulares, imobiliária, clínica, restaurante, loja de veículos).
Ajude o usuário a USAR o sistema: onde encontrar telas, como fazer uma venda no PDV, lançar orçamento, cadastrar produto/lead/cliente, gerar contrato, etc.
Regras:
- Responda em português do Brasil, de forma curta e direta (2–5 frases). Use passos numerados quando fizer sentido.
- Você NÃO tem acesso aos dados da empresa. Se pedirem números/relatórios específicos, oriente em qual menu ver (ex.: "veja em Relatórios" / "no Histórico").
- Não invente funcionalidades. Se não souber, diga que não tem certeza e sugira onde procurar.
- Nunca ofereça enviar mensagens por você; você só orienta.`

interface Msg { role: 'user' | 'model'; text: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Assistente ainda não configurado (defina GEMINI_API_KEY).' }, { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as { mensagens?: Msg[]; contexto?: string }
  const mensagens = (Array.isArray(body.mensagens) ? body.mensagens : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-12) // mantém só as últimas trocas (custo/latência)
  if (mensagens.length === 0) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const systemText = body.contexto ? `${SYSTEM}\n\nContexto: o usuário está na tela "${String(body.contexto).slice(0, 60)}".` : SYSTEM

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents: mensagens.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
          generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(20000),
      }
    )
    const j = await r.json()
    if (!r.ok) {
      const msg = j?.error?.message ?? 'Erro no assistente'
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    const resposta = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    if (!resposta.trim()) return NextResponse.json({ error: 'Sem resposta do assistente' }, { status: 502 })
    return NextResponse.json({ resposta })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no assistente' }, { status: 500 })
  }
}

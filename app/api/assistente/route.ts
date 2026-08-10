import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mensagemDoProvedor, MODELO_PADRAO } from '@/lib/assistente-erros'

// Assistente de ajuda do CRM (Gemini Flash), com streaming. Meta-safe: só responde
// no chat da tela — nunca envia mensagem a canal nem executa ação no sistema.
const SEGMENTO_CTX: Record<string, string> = {
  varejo: 'loja de varejo/celulares (PDV, estoque, produtos, garantia, assistência, orçamentos)',
  assistencia: 'assistência técnica (ordens de serviço, garantia, orçamentos)',
  servicos: 'prestador de serviços',
  imobiliaria: 'imobiliária (imóveis, proprietários, chaves, visitas na Agenda)',
  saude: 'clínica/saúde (agendamento de consultas na Agenda)',
  food: 'restaurante/food (cardápio, cozinha/KDS)',
  concessionaria: 'loja de veículos (avaliações, consulta FIPE, financiamento)',
}

function systemPrompt(segmento: string | null, extra: string | null): string {
  const ctx = SEGMENTO_CTX[segmento ?? ''] ?? 'pequeno negócio'
  return `Você é o assistente do Nexus, um CRM. Esta empresa é uma ${ctx}. Você faz DUAS coisas:

1) AJUDA DE USO — orienta onde encontrar telas e como executar tarefas (vender no PDV, lançar orçamento, cadastrar produto/lead/cliente, gerar contrato, ver relatórios, etc.).

2) CRIAÇÃO DE CONTEÚDO — a partir do que o usuário te informar, você escreve:
   - descrição de produto (para catálogo/anúncio),
   - post/legenda para Instagram ou Facebook (com emojis e hashtags quando fizer sentido),
   - rascunho de mensagem para o cliente (WhatsApp) — o lojista COPIA e envia; você nunca envia,
   - melhora/encurta/ajusta o tom de um texto que ele colar.
   Se faltar informação (ex.: preço, características), pergunte de forma objetiva antes de escrever.

Regras:
- Responda em português do Brasil, direto ao ponto. Use **negrito** para nomes de menus/botões e listas numeradas para passos.
- Você NÃO tem acesso aos dados da empresa (clientes, vendas, estoque). Se pedirem números/relatórios, oriente em qual menu ver (ex.: "veja em **Relatórios**"). Para criar conteúdo, use apenas o que o usuário fornecer.
- Não invente funcionalidades nem dados. Se não souber, diga e sugira onde procurar.
- Nunca ofereça enviar mensagens por você; você só gera o texto pronto para o lojista usar.${extra ? `\n${extra}` : ''}`
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

  const svc = createServiceClient()

  // Config global (superadmin): liga/desliga, limite/min e modelo.
  const { data: cfg } = await svc.from('assistente_config').select('ativo, limite_por_min, modelo, system_extra').eq('id', 1).maybeSingle()
  const ativo = cfg?.ativo ?? true
  const limite = cfg?.limite_por_min ?? 20
  const modelo = cfg?.modelo || process.env.GEMINI_MODEL || MODELO_PADRAO
  if (!ativo) return NextResponse.json({ error: 'O assistente está temporariamente desativado.' }, { status: 503 })

  // Rate-limit por empresa (service client — bypassa RLS da tabela de uso).
  const desdeIso = new Date(Date.now() - 60_000).toISOString()
  const { count } = await svc.from('assistente_uso').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).gte('created_at', desdeIso)
  if ((count ?? 0) >= limite) {
    return NextResponse.json({ error: 'Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente de novo.' }, { status: 429 })
  }
  const { data: uso } = await svc.from('assistente_uso').insert({ empresa_id: empresaId } as never).select('id').single()
  const usoId = (uso as { id?: number } | null)?.id ?? null

  // Contexto do segmento p/ respostas mais úteis.
  const { data: emp } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  let systemText = systemPrompt((emp as { segmento?: string | null } | null)?.segmento ?? null, cfg?.system_extra ?? null)
  if (body.contexto) systemText += `\n\nContexto: o usuário está na tela "${String(body.contexto).slice(0, 60)}".`

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:streamGenerateContent?alt=sse&key=${apiKey}`,
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
      const cru = (j?.error?.message as string) ?? `HTTP ${upstream.status}`
      // Cru no log (é onde serve para diagnosticar), traduzido na tela.
      console.error('[assistente] provedor recusou:', upstream.status, modelo, cru)
      return NextResponse.json(
        { error: mensagemDoProvedor(upstream.status, cru) },
        { status: 502 },
      )
    }

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buf = ''
    let tokIn = 0, tokOut = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          // Registra os tokens do uso (para o dashboard do superadmin).
          if (usoId && (tokIn || tokOut)) {
            await svc.from('assistente_uso').update({ tokens_in: tokIn, tokens_out: tokOut } as never).eq('id', usoId)
          }
          controller.close(); return
        }
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
            const um = obj?.usageMetadata
            if (um) { tokIn = um.promptTokenCount ?? tokIn; tokOut = um.candidatesTokenCount ?? tokOut }
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

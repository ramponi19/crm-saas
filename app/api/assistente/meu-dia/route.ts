import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// "Iniciar o dia": roteiro priorizado a partir das demandas do usuário logado.
// Free-safe: envia ao Gemini só CONTAGENS (sem nomes/dados de cliente).
export async function POST() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  const svc = createServiceClient()
  const { data: cfg } = await svc.from('assistente_config').select('ativo, modelo').eq('id', 1).maybeSingle()
  if (cfg && cfg.ativo === false) return NextResponse.json({ error: 'O assistente está temporariamente desativado.' }, { status: 503 })
  const modelo = cfg?.modelo || process.env.GEMINI_MODEL || 'gemini-2.0-flash'

  const now = new Date()
  const inicioHoje = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const fimHoje = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()

  const uid = user.id
  const head = { count: 'exact' as const, head: true }
  const [atrasadas, hoje, leadsResp, fila, visitas] = await Promise.all([
    supabase.from('tarefas').select('*', head).eq('empresa_id', empresaId).eq('responsavel_id', uid).eq('concluida', false).lt('vencimento', inicioHoje),
    supabase.from('tarefas').select('*', head).eq('empresa_id', empresaId).eq('responsavel_id', uid).eq('concluida', false).gte('vencimento', inicioHoje).lt('vencimento', fimHoje),
    supabase.from('leads').select('*', head).eq('empresa_id', empresaId).eq('responsavel_id', uid).eq('ativo', true).gt('msgs_nao_lidas', 0),
    supabase.from('cadencia_inscricoes').select('*', head).eq('empresa_id', empresaId).eq('responsavel_id', uid).eq('status', 'ativa').lte('proxima_acao_em', fimHoje),
    supabase.from('visitas').select('*', head).eq('empresa_id', empresaId).eq('corretor_id', uid).gte('data_hora', inicioHoje).lt('data_hora', fimHoje),
  ])

  const n = {
    tarefasAtrasadas: atrasadas.count ?? 0,
    tarefasHoje: hoje.count ?? 0,
    leadsAguardando: leadsResp.count ?? 0,
    filaDoDia: fila.count ?? 0,
    visitasHoje: visitas.count ?? 0,
  }

  // Sem chave: devolve um roteiro determinístico (sem IA), ainda útil.
  if (!apiKey) {
    const linhas: string[] = []
    if (n.leadsAguardando) linhas.push(`Responder **${n.leadsAguardando}** lead(s) aguardando no chat (**Leads**).`)
    if (n.filaDoDia) linhas.push(`Fazer os **${n.filaDoDia}** contato(s) da **Fila do dia**.`)
    if (n.tarefasAtrasadas) linhas.push(`Resolver **${n.tarefasAtrasadas}** tarefa(s) atrasada(s) (**Tarefas**).`)
    if (n.tarefasHoje) linhas.push(`Concluir **${n.tarefasHoje}** tarefa(s) de hoje.`)
    if (n.visitasHoje) linhas.push(`Preparar **${n.visitasHoje}** visita(s)/compromisso(s) de hoje (**Agenda**).`)
    const roteiro = linhas.length
      ? `Bom dia! Seu roteiro:\n${linhas.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
      : 'Bom dia! Você está em dia — nenhuma pendência urgente. Que tal prospectar novos leads? 🚀'
    return NextResponse.json({ roteiro, counts: n })
  }

  const fatos = `Tarefas atrasadas: ${n.tarefasAtrasadas}. Tarefas para hoje: ${n.tarefasHoje}. Leads aguardando resposta: ${n.leadsAguardando}. Contatos na Fila do dia: ${n.filaDoDia}. Compromissos/visitas hoje: ${n.visitasHoje}.`
  const prompt = `Você é o assistente do Nexus. Monte um ROTEIRO DO DIA curto, priorizado e motivador para o operador, a partir destes números (não invente dados além destes):
${fatos}
Regras: comece pelo mais urgente (leads aguardando e fila do dia costumam vir primeiro). Máximo 6 itens numerados, uma linha cada. Use **negrito** no nome do menu onde agir (Leads, Fila do dia, Tarefas, Agenda). Se estiver tudo zerado, parabenize e sugira prospectar. Português do Brasil.`

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 500 } }),
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json()
    if (!r.ok) return NextResponse.json({ error: j?.error?.message ?? 'Erro no assistente' }, { status: 502 })
    const roteiro = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const um = j?.usageMetadata
    await svc.from('assistente_uso').insert({ empresa_id: empresaId, tokens_in: um?.promptTokenCount ?? null, tokens_out: um?.candidatesTokenCount ?? null } as never)
    return NextResponse.json({ roteiro: roteiro.trim() || 'Não consegui montar o roteiro agora.', counts: n })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no assistente' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Automações (Tracker) — gatilho + ações. Gerenciamento real e persistido.
 * A execução ao vivo (worker) roda à parte; aqui ficam o cadastro e o ciclo de vida.
 */
export const dynamic = 'force-dynamic'

const GATILHOS = ['nova_oportunidade', 'lead_parado', 'formulario', 'etapa_mudou']

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const { data } = await db.from('tracker_automacao')
    .select('id, nome, ativo, gatilho, gatilho_config, acoes, execucoes, criado_em')
    .eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(100)
  return NextResponse.json({ automacoes: data ?? [] })
}

export async function POST(req: Request) {
  const { empresaId, userId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const nome = String(body.nome ?? '').trim()
  const gatilho = String(body.gatilho ?? '')
  if (!nome) return NextResponse.json({ error: 'nome_obrigatorio' }, { status: 400 })
  if (!GATILHOS.includes(gatilho)) return NextResponse.json({ error: 'gatilho_invalido' }, { status: 400 })

  const acoes = Array.isArray(body.acoes) ? body.acoes : []
  const db = rastrDb()
  const { data, error } = await db.from('tracker_automacao').insert({
    empresa_id: empresaId, criado_por: userId, nome, gatilho,
    gatilho_config: body.gatilho_config ?? {}, acoes, ativo: true,
  }).select('id, nome, ativo, gatilho, gatilho_config, acoes, execucoes, criado_em').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ automacao: data })
}

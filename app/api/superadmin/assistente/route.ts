import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { MODELO_PADRAO } from '@/lib/assistente-erros'

// Uso do assistente (agregado, filtrável por empresa/período) — só superadmin.
export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const svc = createServiceClient()

  const dias = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('dias')) || 30))
  const empresaParam = req.nextUrl.searchParams.get('empresa')
  const empresaId = empresaParam ? Number(empresaParam) : null
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  let q = svc.from('assistente_uso').select('empresa_id, created_at, tokens_in, tokens_out').gte('created_at', desde).limit(20000)
  if (empresaId) q = q.eq('empresa_id', empresaId)
  const { data: rows } = q ? await q : { data: [] }

  const linhas = (rows ?? []) as Array<{ empresa_id: number; created_at: string; tokens_in: number | null; tokens_out: number | null }>

  let total = 0, tokensIn = 0, tokensOut = 0
  const porEmp = new Map<number, { perguntas: number; tin: number; tout: number }>()
  const porDia = new Map<string, number>()
  for (const l of linhas) {
    total++
    tokensIn += l.tokens_in ?? 0
    tokensOut += l.tokens_out ?? 0
    const e = porEmp.get(l.empresa_id) ?? { perguntas: 0, tin: 0, tout: 0 }
    e.perguntas++; e.tin += l.tokens_in ?? 0; e.tout += l.tokens_out ?? 0
    porEmp.set(l.empresa_id, e)
    const dia = l.created_at.slice(0, 10)
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }

  // Nomes das empresas
  const ids = [...porEmp.keys()]
  const nomes = new Map<number, string>()
  if (ids.length) {
    const { data: emps } = await svc.from('empresas').select('id, nome').in('id', ids)
    for (const e of (emps ?? []) as Array<{ id: number; nome: string }>) nomes.set(e.id, e.nome)
  }
  const porEmpresa = [...porEmp.entries()]
    .map(([id, v]) => ({ empresa_id: id, nome: nomes.get(id) ?? `Empresa ${id}`, perguntas: v.perguntas, tokensIn: v.tin, tokensOut: v.tout }))
    .sort((a, b) => b.perguntas - a.perguntas)
  const serie = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, perguntas]) => ({ dia, perguntas }))

  return NextResponse.json({ total, tokensIn, tokensOut, empresasAtivas: porEmp.size, porEmpresa, serie })
}

// Salva a config global do assistente — só superadmin.
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const svc = createServiceClient()

  const b = (await req.json().catch(() => ({}))) as { ativo?: boolean; limite_por_min?: number; modelo?: string; system_extra?: string }
  const patch = {
    id: 1,
    ativo: !!b.ativo,
    limite_por_min: Math.min(1000, Math.max(1, Number(b.limite_por_min) || 20)),
    modelo: (b.modelo || MODELO_PADRAO).trim().slice(0, 60),
    system_extra: b.system_extra?.trim() ? b.system_extra.trim().slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await svc.from('assistente_config').upsert(patch as never, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

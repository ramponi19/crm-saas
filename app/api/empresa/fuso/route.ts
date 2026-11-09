import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { CHAVE_FUSO, fusoDaEmpresa, valorDoFuso } from '@/lib/fuso-empresa'
import { FUSO_PADRAO } from '@/lib/datas'

/**
 * O fuso horário da empresa (Configurações → Horário), 10/11/2026.
 *
 * Mora em `configuracoes_sistema` (chave `fuso`), sem coluna nova. O servidor confere
 * o papel (dono ou admin) e o NOME do fuso (IANA, conhecido pelo Intl) antes de
 * gravar: um fuso inválido faria todas as telas e relatórios caírem no padrão sem
 * aviso. Voltar ao padrão (Brasília) apaga a linha — sem linha, vale o padrão, igual
 * para todas as empresas de hoje.
 */
export async function GET() {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const fuso = await fusoDaEmpresa(auth.supabase, auth.empresaId)
  return NextResponse.json({ fuso, padrao: FUSO_PADRAO })
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const body = (await req.json().catch(() => ({}))) as { fuso?: unknown }
  const valor = valorDoFuso(body.fuso)
  if (!valor) return NextResponse.json({ error: 'Fuso horário inválido' }, { status: 400 })

  const svc = createServiceClient()
  if (valor.fuso === FUSO_PADRAO) {
    const { error } = await svc.from('configuracoes_sistema').delete()
      .eq('empresa_id', auth.empresaId).eq('chave', CHAVE_FUSO)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, fuso: FUSO_PADRAO })
  }
  const { data, error } = await svc.from('configuracoes_sistema')
    .upsert({ empresa_id: auth.empresaId, chave: CHAVE_FUSO, valor }, { onConflict: 'empresa_id,chave' })
    .select('empresa_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nada foi gravado' }, { status: 500 })
  return NextResponse.json({ ok: true, fuso: valor.fuso })
}

import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { usuariosOnline, JANELA_ONLINE_MIN } from '@/lib/presenca'

/**
 * Quem está no CRM agora — consultado de tempos em tempos pela tela de Equipe.
 *
 * Mesma régua de acesso da própria tela (dono e admin): saber quem está online
 * é informação de gestão, não de colega sobre colega.
 *
 * Devolve só ids. Nome, papel e o resto a tela já tem — mandar de novo a cada
 * minuto seria trafegar a equipe inteira para saber quem acendeu a bolinha.
 */
export async function GET() {
  const sessao = await requireEmpresaRoleApi(['owner', 'admin'])
  if (sessao.error) return sessao.error

  const online = await usuariosOnline(sessao.supabase, sessao.empresaId)
  return NextResponse.json({ online, janelaMin: JANELA_ONLINE_MIN })
}

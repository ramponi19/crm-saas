import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { sinaisDePresenca, JANELA_ONLINE_MIN } from '@/lib/presenca'

/**
 * Presença da equipe — a REDE DE SEGURANÇA do realtime, não o caminho normal.
 *
 * A tela escuta `acessos` por websocket e não pergunta nada de tempos em
 * tempos. Isto aqui existe para o momento em que a conexão cai e volta: no
 * reconecte, a tela perdeu os eventos do intervalo e precisa de uma foto do
 * estado atual para não ficar mostrando alguém que já saiu.
 *
 * Mesma régua de acesso da própria tela (dono e admin): saber quem está online
 * é informação de gestão, não de colega sobre colega.
 */
export async function GET() {
  const sessao = await requireEmpresaRoleApi(['owner', 'admin'])
  if (sessao.error) return sessao.error

  const sinais = await sinaisDePresenca(sessao.supabase, sessao.empresaId)
  return NextResponse.json({ sinais, janelaMin: JANELA_ONLINE_MIN })
}

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * CONFIGURAÇÕES › DISTRIBUIÇÃO, POR LOJA (5b, 26/11/2026; migração 20261126001100). Grava na SESSÃO de quem salva,
 * pelas funções do banco, que conferem dono/administrador, só aceitam quem enxerga a loja e auditam cada mudança.
 *
 * PATCH { acao: 'lista', filialId, lista: 'roleta' | 'liberacao' | 'reserva_posvenda', usuarios: uuid[] }  (na ordem)
 *       { acao: 'comissao', usuarioId, filialId }
 *       { acao: 'liberacao', filialId, valor: { ativo, por_vendedor, dias_cliente, pular_primeiro_dia } }
 */
const ERROS: Record<string, number> = {
  SEM_PERMISSAO: 403, LOJA_NAO_VISIVEL: 422, SOMENTE_LEITURA: 403, SEM_EMPRESA: 400,
  USUARIO_NAO_ENCONTRADO: 404, LOJA_INVALIDA: 400, LISTA_INVALIDA: 400,
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

function doBanco(e: { message: string }) {
  const codigo = (e.message.match(/^([A-Z_]+):/) ?? [])[1] ?? ''
  const status = ERROS[codigo]
  if (!status) return erro('Erro ao salvar a distribuição', 500)
  return NextResponse.json({ error: e.message.replace(/^[A-Z_]+:\s*/, ''), codigo }, { status })
}

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return erro('Corpo inválido')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return erro('Não autenticado', 401)
  const filialId = Number(b.filialId)
  if (!Number.isInteger(filialId) || filialId <= 0) return erro('Informe a loja')

  if (b.acao === 'lista') {
    if (!['roleta', 'liberacao', 'reserva_posvenda'].includes(String(b.lista))) return erro('Lista inválida')
    const usuarios = Array.isArray(b.usuarios) ? b.usuarios.map(String) : null
    if (!usuarios || usuarios.some((u) => !UUID.test(u))) return erro('Lista de pessoas inválida')
    const { data, error } = await supabase.rpc('distribuicao_salvar', { p_filial: filialId, p_lista: b.lista, p_usuarios: usuarios })
    return error ? doBanco(error) : NextResponse.json({ ok: true, ...(data as object) })
  }

  if (b.acao === 'comissao') {
    if (!UUID.test(String(b.usuarioId))) return erro('Pessoa inválida')
    const { data, error } = await supabase.rpc('comissao_loja_salvar', { p_usuario: b.usuarioId, p_filial: filialId })
    return error ? doBanco(error) : NextResponse.json({ ok: true, ...(data as object) })
  }

  if (b.acao === 'liberacao') {
    const v = (b.valor ?? {}) as Record<string, unknown>
    const porVendedor = Number(v.por_vendedor), dias = Number(v.dias_cliente)
    if (typeof v.ativo !== 'boolean' || !Number.isInteger(porVendedor) || porVendedor < 0 || porVendedor > 200
      || !Number.isInteger(dias) || dias < 1 || dias > 365) return erro('Valores da liberação inválidos', 422)
    const valor = { ativo: v.ativo, por_vendedor: porVendedor, dias_cliente: dias, pular_primeiro_dia: v.pular_primeiro_dia === true }
    const { data, error } = await supabase.rpc('config_salvar', { p_modulo: 'distribuicao', p_chave: 'liberacao_diaria', p_valor: valor, p_filial: filialId })
    if (error) return /SEM_PERMISSAO|SOMENTE_LEITURA/.test(error.message) ? erro('Só o dono ou um administrador altera a distribuição.', 403) : erro(error.message)
    return NextResponse.json({ ok: true, valor: data })
  }

  return erro('Ação desconhecida')
}

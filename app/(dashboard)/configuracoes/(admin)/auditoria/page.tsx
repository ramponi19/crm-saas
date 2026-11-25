import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { instanteLocal, somarDias } from '@/lib/datas'
import { lerFiltroAuditoria, POR_PAGINA, type EventoAuditoria } from '@/lib/auditoria'
import { AuditoriaView } from '@/components/modules/auditoria/auditoria-view'

export const metadata = { title: 'Auditoria' }

/**
 * CONFIGURAÇÕES › AUDITORIA (etapa 1.1a, 25/11/2026; docs/etapa-1.1-plano.md §1.3).
 * Quem, quando, o quê, antes e depois. Leitura pela sessão: a RLS de auditoria_eventos só devolve a empresa
 * atual e só para quem pode ver a auditoria (dono/admin na 1.1a; a permissão auditoria.ver na 1.1b). O layout
 * do grupo (admin) já barra os outros papéis antes de chegar aqui.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [supabase, empresaId, sp] = await Promise.all([createClient(), getEmpresaId(), searchParams])
  if (!empresaId) redirect('/dashboard')
  const filtro = lerFiltroAuditoria(sp)
  const fuso = await fusoDaEmpresa(supabase, empresaId)
  // auditoria_eventos é nova e ainda não está em types/database.gerado.ts (gerado da produção)
  const db = supabase as unknown as SupabaseClient

  let q = db.from('auditoria_eventos')
    .select('id, criado_em, usuario_id, impersonado_por, entidade, entidade_id, acao, antes, depois, motivo, origem, filial_id', { count: 'exact' })
    .eq('empresa_id', empresaId)
  if (filtro.pessoa) q = q.eq('usuario_id', filtro.pessoa)
  if (filtro.entidade) q = q.eq('entidade', filtro.entidade)
  if (filtro.acao) q = q.eq('acao', filtro.acao)
  if (filtro.plataforma) q = q.not('impersonado_por', 'is', null)
  if (filtro.de) q = q.gte('criado_em', instanteLocal(filtro.de, '00:00', fuso).toISOString())
  if (filtro.ate) q = q.lt('criado_em', instanteLocal(somarDias(filtro.ate, 1), '00:00', fuso).toISOString())
  const inicio = (filtro.pagina - 1) * POR_PAGINA
  const [{ data, count, error }, { data: equipe }] = await Promise.all([
    q.order('criado_em', { ascending: false }).order('id', { ascending: false }).range(inicio, inicio + POR_PAGINA - 1),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios(nome)').eq('empresa_id', empresaId),
  ])

  type Membro = { usuario_id: string; usuarios: { nome: string | null } | { nome: string | null }[] | null }
  const pessoas = ((equipe ?? []) as unknown as Membro[]).map((m) => ({
    id: m.usuario_id, nome: (Array.isArray(m.usuarios) ? m.usuarios[0]?.nome : m.usuarios?.nome) ?? 'Sem nome',
  })).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <>
      <Topbar title="Auditoria" />
      <AuditoriaView
        eventos={(data ?? []) as EventoAuditoria[]}
        total={count ?? 0}
        filtro={filtro}
        pessoas={pessoas}
        fuso={fuso}
        erro={error ? 'Não foi possível carregar a auditoria.' : null}
      />
    </>
  )
}

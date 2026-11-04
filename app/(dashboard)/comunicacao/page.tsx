import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { carregarConfigEmpresa, perfilDoLead } from '@/lib/empresa-config'
import { Topbar } from '@/components/layout/topbar'
import { InboxView, type EtapaDoCard } from '@/components/modules/comunicacao/inbox-view'
import type { Motivo } from '@/components/modules/leads/types'

export const metadata = { title: 'Comunicação' }

/**
 * COMUNICAÇÃO — A INBOX ÚNICA (04/11/2026).
 *
 * WhatsApp, Instagram e Messenger numa coluna, a conversa ao lado. O servidor
 * manda só a moldura (equipe, etapas e motivos para o card do lead abrir daqui);
 * a lista, a conversa, as notas e o tempo real são lidos pelo navegador direto do
 * core (lib/inbox/consultas.ts), com a RLS da sessão — a loja é a do topo.
 * Nada aqui lê a view `leads` nem a `lead_mensagens`.
 */
export default async function ComunicacaoPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  if (!empresaId) redirect('/login')

  const [{ data: usuarios }, { data: etapasRaw }, { data: motivosRaw }, { data: funisRaw }, cfg, { data: { user } }] = await Promise.all([
    supabase.from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('funil_etapas').select('slug, label, cor, tipo, ordem, funil_id, campos_obrigatorios')
      .eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('motivos_perda').select('id, label').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('funis').select('id, padrao').eq('empresa_id', empresaId),
    carregarConfigEmpresa(supabase, empresaId),
    supabase.auth.getUser(),
  ])
  if (!user) redirect('/login')

  type UsuarioVinculoRow = { usuario_id: string; role: string | null; usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const equipe = ((usuarios ?? []) as unknown as UsuarioVinculoRow[]).map((eu) => {
    const u = Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios
    return { id: eu.usuario_id, nome: u?.nome ?? '', role: eu.role ?? '' }
  })

  type EtapaRow = { slug: string; label: string; cor: string; tipo: string; funil_id: number | null; campos_obrigatorios: unknown }
  const etapas: EtapaDoCard[] = ((etapasRaw ?? []) as EtapaRow[]).map((e) => ({
    id: e.slug, label: e.label, color: e.cor,
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
    funilId: e.funil_id ?? undefined,
    camposObrigatorios: Array.isArray(e.campos_obrigatorios) ? (e.campos_obrigatorios as string[]) : [],
  }))
  const funilPadrao = ((funisRaw ?? []) as { id: number; padrao: boolean }[]).find((f) => f.padrao)?.id ?? null

  return (
    <>
      <Topbar title="Comunicação" />
      <InboxView
        empresaId={empresaId}
        meuId={user.id}
        usuarios={equipe}
        etapas={etapas}
        funilPadrao={funilPadrao}
        motivos={(motivosRaw ?? []) as Motivo[]}
        perfil={perfilDoLead(cfg)}
      />
    </>
  )
}

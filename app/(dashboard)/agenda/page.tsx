import { redirect } from 'next/navigation'
import { VitrineDoModulo } from '@/components/modulos/vitrine-do-modulo'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { carregarConfigEmpresa, ligadosDaEmpresa, vocabulario } from '@/lib/empresa-config'
import AgendaView from './agenda-view'
import type { Tables } from '@/types/database'
import { consultaClientes } from '@/lib/clientes'
import { embedLead, leadsParaEscolher } from '@/lib/leads'

export const metadata = { title: 'Agenda' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function AgendaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cfg = await carregarConfigEmpresa(supabase, empresaId)
  /**
   * Gate pelo MÓDULO, não por quem a empresa é (23/10/2026).
   *
   * Até 22/10 a página perguntava se o preset declarava agenda de visitas ou de
   * clínica; os presets que declaravam são exatamente os que ligam /agenda, então
   * a pergunta agora é a da Central: o módulo Agenda está ligado? Desligado, a
   * vitrine (etapa 0) — não o dashboard: quem abriu fica sabendo o que é a Agenda.
   */
  const ligados = ligadosDaEmpresa(cfg)
  if (!ligados.has('/agenda')) return <VitrineDoModulo href="/agenda" />

  const { data: vinculo } = await supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).maybeSingle()
  const isGestor = ['owner', 'admin'].includes(vinculo?.role ?? '')

  /**
   * O gestor carrega a agenda da equipe (a aba Supervisão vive disso); quem não
   * gerencia só recebe a própria. O corte é aqui, no servidor: filtrar na tela
   * mandaria o compromisso do colega para o navegador de quem não pode ver.
   */
  // O lead da visita é o negócio (visitas.lead_id); nome/telefone vêm do contato.
  const SELECT_VISITA: string = `*, ${embedLead('visitas_lead_id_fkey', 'nome, telefone')}, clientes:contatos!cliente_id(nome), imoveis:imoveis_imoveis(titulo, codigo, bairro)`
  let q = supabase.from('visitas')
    .select(SELECT_VISITA)
    .eq('empresa_id', empresaId)
  if (!isGestor) q = q.eq('corretor_id', user.id)

  const [{ data: visitasRaw }, leads, { data: clientes }, { data: imoveis }, { data: membros }] = await Promise.all([
    q.order('data_hora', { ascending: true }),
    // Os de conversa mais recente primeiro (era `leads` por ultima_mensagem_at).
    leadsParaEscolher(supabase, empresaId, 200),
    consultaClientes(supabase, 'id, nome').eq('empresa_id', empresaId).order('nome').limit(300),
    supabase.from('imoveis_imoveis').select('id, titulo, codigo').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(300),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type VisitaRow = Tables<'visitas'> & {
    leads: Embed<{ nome: string | null; telefone: string | null }>
    clientes: Embed<{ nome: string | null }>
    imoveis: Embed<{ titulo: string | null; codigo: string | null; bairro: string | null }>
  }
  const visitas = ((visitasRaw ?? []) as unknown as VisitaRow[]).map(v => {
    const l = one(v.leads), c = one(v.clientes), im = one(v.imoveis)
    return {
      ...v,
      lead_nome: l?.nome ?? null,
      lead_tel: l?.telefone ?? null,
      cliente_nome: c?.nome ?? null,
      imovel_nome: im ? (im.titulo || im.codigo) : null,
      imovel_bairro: im?.bairro ?? null,
    }
  })
  const usuarios = ((membros ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
    .map(m => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return (
    <AgendaView
      inicial={visitas}
      leads={leads}
      clientes={clientes ?? []}
      imoveis={(imoveis ?? []).map(i => ({ id: i.id, nome: i.titulo || i.codigo || `#${i.id}` }))}
      usuarios={usuarios}
      empresaId={empresaId}
      meuId={user.id}
      isGestor={isGestor}
      rotulos={cfg.vocabulario.agenda}
      equipe={vocabulario(cfg).equipe}
      comImoveis={ligados.has('/imoveis')}
    />
  )
}

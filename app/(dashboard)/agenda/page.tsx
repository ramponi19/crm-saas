import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import AgendaView from './agenda-view'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Agenda' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function AgendaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  const cap = SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades
  /**
   * Gate por CAPACIDADE, não por nome de segmento.
   *
   * A versão anterior comparava o NOME do segmento (imobiliária ou saúde), o acoplamento que a
   * arquitetura de segmentos existe para evitar: uma locadora com agenda de visitas
   * precisaria editar esta página. Quem marca compromisso é quem declara
   * `agendaVisitas` ou `agendaClinica`.
   */
  if (!cap.agendaVisitas && !cap.agendaClinica) redirect('/dashboard')

  const { data: vinculo } = await supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).maybeSingle()
  const isGestor = ['owner', 'admin'].includes(vinculo?.role ?? '')

  /**
   * O gestor carrega a agenda da equipe (a aba Supervisão vive disso); quem não
   * gerencia só recebe a própria. O corte é aqui, no servidor: filtrar na tela
   * mandaria o compromisso do colega para o navegador de quem não pode ver.
   */
  let q = supabase.from('visitas')
    .select('*, leads(nome, telefone), clientes(nome), imoveis(titulo, codigo, bairro)')
    .eq('empresa_id', empresaId)
  if (!isGestor) q = q.eq('corretor_id', user.id)

  const [{ data: visitasRaw }, { data: leads }, { data: clientes }, { data: imoveis }, { data: membros }] = await Promise.all([
    q.order('data_hora', { ascending: true }),
    supabase.from('leads').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('ultima_mensagem_at', { ascending: false }).limit(200),
    supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).order('nome').limit(300),
    supabase.from('imoveis').select('id, titulo, codigo').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(300),
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
      leads={leads ?? []}
      clientes={clientes ?? []}
      imoveis={(imoveis ?? []).map(i => ({ id: i.id, nome: i.titulo || i.codigo || `#${i.id}` }))}
      usuarios={usuarios}
      empresaId={empresaId}
      meuId={user.id}
      isGestor={isGestor}
      segmento={empresa?.segmento ?? null}
    />
  )
}

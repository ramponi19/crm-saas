import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { resumoNps } from '@/lib/posvenda/chamados'
import { inicioDoDiaHaDias } from '@/lib/datas'
import { ChamadosView, type ChamadoLinha } from './chamados-view'

export const metadata = { title: 'Chamados' }

/**
 * CHAMADOS DO PÓS-VENDA (C7 bloco 4, 24/11/2026). O responsável vê os dele; dono e administrador, todos (RLS da C1).
 * Abertos (do prazo mais apertado ao mais folgado) e resolvidos; o NPS dos últimos 90 dias no topo.
 */
export default async function ChamadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')
  const service = createServiceClient()
  if (!(await posvendaLigado(service, empresaId))) redirect('/pos-venda')
  const s = semTipo(supabase)
  const desde = inicioDoDiaHaDias(90).toISOString()  // NPS dos últimos 90 dias

  const [{ data: ch }, { data: st }, { data: vinc }, { data: eu }, { data: equipe }, { data: notas }] = await Promise.all([
    s.from('posvenda_chamados').select(`id, numero, titulo, descricao, prioridade, origem, aberto_em, primeira_resposta_em, resolvido_em,
        sla_resposta_vence, sla_resolucao_vence, responsavel_id, negocio_id,
        contato:contatos!contato_id(nome, telefone), categoria:posvenda_chamado_categorias!categoria_id(nome),
        status:posvenda_chamado_status!status_id(id, nome, tipo)`)
      .eq('empresa_id', empresaId).order('aberto_em', { ascending: false }).limit(300),
    s.from('posvenda_chamado_status').select('id, nome, tipo, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    service.from('empresa_usuarios').select('role').eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
    service.from('empresa_usuarios').select('usuario_id, usuarios(nome)').eq('empresa_id', empresaId).eq('ativo', true).eq('conta_servico', false),
    s.from('posvenda_respostas').select('nota').eq('empresa_id', empresaId).gte('respondida_em', desde).limit(5000),
  ])
  type Membro = { usuario_id: string; usuarios: { nome: string | null } | { nome: string | null }[] | null }
  const pessoas = ((equipe ?? []) as unknown as Membro[]).map((m) => ({
    id: m.usuario_id, nome: (Array.isArray(m.usuarios) ? m.usuarios[0]?.nome : m.usuarios?.nome) ?? 'Sem nome',
  })).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <ChamadosView
      chamados={(ch ?? []) as unknown as ChamadoLinha[]}
      status={(st ?? []) as { id: number; nome: string; tipo: string }[]}
      equipe={pessoas}
      meuId={user.id}
      podeRepassar={!!eu?.is_super_admin || ['owner', 'admin'].includes(vinc?.role ?? '')}
      nps={resumoNps(((notas ?? []) as { nota: number }[]).map((n) => n.nota))}
    />
  )
}

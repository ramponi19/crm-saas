import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ImportarContatos } from '@/components/modules/configuracoes/importar-contatos'

export const metadata = { title: 'Importar contatos' }

/**
 * Importação de contatos e leads por planilha (18/11/2026, core). Só dono e admin (o layout do grupo
 * confere). Os funis, etapas e a equipe vêm pela sessão (RLS da empresa); o histórico, de `importacoes`.
 */
export default async function Page() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: funis }, { data: etapas }, { data: membros }, { data: historico }] = await Promise.all([
    supabase.from('funis').select('id, nome, padrao').eq('empresa_id', empresaId!).eq('interno', false).order('padrao', { ascending: false }).order('id'),
    supabase.from('funil_etapas').select('id, label, funil_id, ordem').eq('empresa_id', empresaId!).eq('ativo', true).order('ordem'),
    supabase.from('empresa_usuarios').select('usuario_id, usuario:usuarios(nome)').eq('empresa_id', empresaId!).eq('ativo', true),
    supabase.from('importacoes').select('id, arquivo, total, contatos_novos, contatos_existentes, leads_criados, recusadas, created_at')
      .eq('empresa_id', empresaId!).order('created_at', { ascending: false }).limit(10),
  ])
  return (
    <>
      <Topbar title="Importar contatos" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[980px] space-y-4">
          <ImportarContatos
            funis={(funis ?? []).map((f) => ({
              id: f.id, nome: f.nome, padrao: f.padrao,
              etapas: (etapas ?? []).filter((e) => e.funil_id === f.id).map((e) => ({ id: e.id, nome: e.label })),
            }))}
            equipe={((membros ?? []) as unknown as { usuario_id: string; usuario: { nome: string | null } | null }[])
              .map((m) => ({ id: m.usuario_id, nome: m.usuario?.nome ?? 'Sem nome' }))}
            historico={(historico ?? []).map((h) => ({
              id: h.id, arquivo: h.arquivo, total: h.total, novos: h.contatos_novos, existentes: h.contatos_existentes,
              leads: h.leads_criados, recusadas: Array.isArray(h.recusadas) ? h.recusadas.length : 0, em: h.created_at,
            }))}
          />
        </div>
      </main>
    </>
  )
}

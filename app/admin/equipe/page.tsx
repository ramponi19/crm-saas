import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { janelaDoPeriodo } from '@/lib/ranking'
import EquipeView from '@/app/(dashboard)/equipe/components/equipe-view'
import { UsoEquipe } from '@/components/admin/uso-equipe'
import { carregarUsoDaEquipe } from '@/lib/uso-equipe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Equipe' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

// Mesma carga de dados da tela /equipe, reaproveitada dentro do painel /admin.
export default async function AdminEquipePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  // Uso da equipe: aba deste painel, e só dele. Na tela /equipe do CRM o
  // vendedor não recebe a prop, então não existe aba nenhuma para ele — horário
  // de colega não é assunto de quem trabalha ao lado.
  const sp = await searchParams
  const dias = Math.min(90, Math.max(1, Number(sp.dias) || 14))
  const uso = await carregarUsoDaEquipe(supabase as unknown as SupabaseClient, empresaId, dias)

  const mesAtual = new Date().toISOString().slice(0, 7)
  // Janela pela função única — ver janelaDoPeriodo: o cálculo anterior dava 3h.
  const { ini: inicioMes, fim: fimMes } = janelaDoPeriodo(mesAtual)

  const [{ data: usuarios }, { data: metas }, { data: vendasMes }, { data: comissoesMes }, { data: filiais }] = await Promise.all([
    supabase
      .from('empresa_usuarios')
      .select('role, ativo, filial_id, usuarios!empresa_usuarios_usuario_public_fkey(*)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('usuario_id'),
    supabase.from('metas_comissoes').select('*').eq('empresa_id', empresaId).eq('mes_ano', mesAtual),
    supabase.from('vendas')
      .select('vendedor_id, valor_venda, status, grupo_pdv')
      .eq('empresa_id', empresaId)
      .gte('data_venda', inicioMes)
      .lt('data_venda', fimMes)
      .eq('status', 'concluida'),
    supabase.from('comissoes')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', inicioMes)
      .lt('created_at', fimMes)
      .eq('status', 'pago'),
    /**
     * Lojas da empresa — so este painel carrega.
     *
     * A tela /equipe do CRM nao recebe a lista, entao nao mostra campo de loja
     * nenhum: quem define onde a pessoa trabalha e o dono, aqui. Mesma convencao da
     * aba "Uso da equipe".
     */
    supabase.from('filiais').select('id, nome, cidade')
      .eq('empresa_id', empresaId).eq('ativo', true)
      .order('matriz', { ascending: false }).order('nome'),
  ])

  type VinculoRow = { role: string | null; ativo: boolean | null; filial_id: number | null; usuarios: Embed<Tables<'usuarios'>> }
  const usuariosMapped = ((usuarios ?? []) as unknown as VinculoRow[])
    .map(eu => {
      const u = one(eu.usuarios)
      return u ? { ...u, role: eu.role, filial_id: eu.filial_id } : null
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  return (
    <EquipeView
      usuarios={usuariosMapped}
      metasIniciais={metas ?? []}
      vendasMes={vendasMes ?? []}
      comissoesPagas={comissoesMes ?? []}
      mesAtual={mesAtual}
      uso={<UsoEquipe sessoes={uso.sessoes} resumo={uso.resumo} dias={dias} />}
      filiais={(filiais ?? []) as { id: number; nome: string; cidade: string | null }[]}
    />
  )
}

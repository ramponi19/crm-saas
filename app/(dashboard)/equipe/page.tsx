import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { limitesDoMes, mesNoFuso } from '@/lib/datas'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { sinaisDePresenca } from '@/lib/presenca'
import EquipeView from './components/equipe-view'
import type { Tables } from '@/types/database'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function EquipePage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  // O mês da loja ("2026-06") e a janela dele no fuso da empresa (lib/datas): no
  // servidor UTC o mês virava no último dia às 21h de Brasília.
  const fuso = await fusoDaEmpresa(supabase, empresaId)
  const mesAtual = mesNoFuso(undefined, fuso)
  const janela = limitesDoMes(mesAtual, fuso)
  const inicioMes = janela.de.toISOString()
  const fimMes = janela.ate.toISOString()

  const [{ data: usuarios }, { data: metas }, { data: vendasMes }, { data: comissoesMes }] = await Promise.all([
    supabase
      .from('empresa_usuarios')
      .select('role, ativo, usuarios!empresa_usuarios_usuario_public_fkey(*)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('usuario_id'),
    supabase.from('metas_comissoes').select('*').eq('empresa_id', empresaId).eq('mes_ano', mesAtual),
    supabase.from('vendas_vendas')
      .select('vendedor_id, valor_venda, status, grupo_pdv')
      .eq('empresa_id', empresaId)
      .gte('data_venda', inicioMes)
      .lt('data_venda', fimMes)
      .eq('status', 'concluida'),
    supabase.from('vendas_comissoes')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', inicioMes)
      .lt('created_at', fimMes)
      .eq('status', 'pago'),
  ])

  type VinculoRow = { role: string | null; ativo: boolean | null; usuarios: Embed<Tables<'usuarios'>> }
  const usuariosMapped = ((usuarios ?? []) as unknown as VinculoRow[])
    .map(eu => {
      const u = one(eu.usuarios)
      return u ? { ...u, role: eu.role } : null
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  // Estado do primeiro desenho. Depois quem manda é o realtime — isto evita a
  // bolinha aparecer só quando o primeiro evento chegar, que pode demorar
  // cinco minutos se ninguém entrar ou sair nesse meio-tempo.
  const sinais = await sinaisDePresenca(supabase, empresaId!)

  return (
    <EquipeView
      usuarios={usuariosMapped}
      sinaisIniciais={sinais}
      metasIniciais={metas ?? []}
      vendasMes={vendasMes ?? []}
      comissoesPagas={comissoesMes ?? []}
      mesAtual={mesAtual}
    />
  )
}

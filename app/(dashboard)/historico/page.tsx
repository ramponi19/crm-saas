import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import { Topbar } from '@/components/layout/topbar'
import { HistoricoView } from '@/components/modules/historico/historico-view'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'

export const metadata = { title: 'Histórico de Vendas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function HistoricoPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: vinculo }, { data: usuario }, { data: membrosRaw }, { data: empresaPerm }] = await Promise.all([
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).maybeSingle(),
  ])
  const isAdmin = !!((usuario as { is_super_admin?: boolean } | null)?.is_super_admin || (vinculo as { role?: string } | null)?.role === 'owner' || (vinculo as { role?: string } | null)?.role === 'admin')
  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const vendedores = ((membrosRaw ?? []) as unknown as MembroRow[]).map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  // Cada vendedor vê as próprias vendas. Papel desconhecido (super admin
  // impersonando, que não tem vínculo) vê tudo — mesma regra do funil.
  const papel = (vinculo as { role?: string } | null)?.role ?? ''
  const soMinhas = !isAdmin && !!papel && !!user
    && !permsDoPapel(papel, (empresaPerm?.permissoes ?? null) as PermissoesMap | null).verVendasOutros

  const baseVendas = supabase
    .from('vendas')
    .select(`
      id, data_venda, valor_venda, lucro, forma_pagamento,
      canal_venda, status, parcelas, cliente_id, produto_id, numero_serie, desconto_valor, observacoes, quantidade, grupo_pdv,
      clientes!cliente_id(nome),
      produtos!produto_id(nome),
      usuarios!vendedor_id(nome)
    `)
    .eq('empresa_id', empresaId)
    .order('data_venda', { ascending: false })
    .limit(500)

  const [{ data: vendasRaw }, { data: empresa }] = await Promise.all([
    soMinhas ? baseVendas.eq('vendedor_id', user!.id) : baseVendas,
    supabase.from('empresas').select('nome, cnpj, telefone, wl_logo_url').eq('id', empresaId).maybeSingle(),
  ])

  type VendaRow = {
    id: number; data_venda: string | null; valor_venda: number; lucro: number | null
    forma_pagamento: string | null; canal_venda: string | null; status: string | null; parcelas: number | null
    cliente_id: number | null; produto_id: number | null; numero_serie: string | null; desconto_valor: number | null; observacoes: string | null
    quantidade: number | null; grupo_pdv: string | null
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
  }
  const linhasVenda = (vendasRaw ?? []) as unknown as VendaRow[]

  // As formas de pagamento reais. Ficam gravadas na PRIMEIRA venda do fechamento
  // (o PDV cria uma venda por item), então a busca é por id e o resultado é
  // compartilhado com as outras vendas do mesmo `grupo_pdv` — senão a segunda
  // linha da mesma compra apareceria sem pagamento nenhum.
  const idsVenda = linhasVenda.map((v) => v.id)
  const { data: pagosRaw } = idsVenda.length
    ? await supabase.from('vendas_pagamentos')
        .select('venda_id, forma_pagamento, valor_pago, parcelas')
        .in('venda_id', idsVenda).order('id')
    : { data: [] }

  type PagoRow = { venda_id: number | null; forma_pagamento: string; valor_pago: number; parcelas: number | null }
  const grupoDaVenda = new Map(linhasVenda.map((v) => [v.id, v.grupo_pdv ?? `v:${v.id}`]))
  const pagosPorGrupo = new Map<string, PagoRow[]>()
  for (const p of (pagosRaw ?? []) as PagoRow[]) {
    const chave = p.venda_id != null ? grupoDaVenda.get(p.venda_id) : null
    if (!chave) continue
    if (!pagosPorGrupo.has(chave)) pagosPorGrupo.set(chave, [])
    pagosPorGrupo.get(chave)!.push(p)
  }

  const vendas = linhasVenda.map(v => ({
    id:            v.id,
    data_venda:    v.data_venda,
    valor_venda:   Number(v.valor_venda),
    lucro:         v.lucro != null ? Number(v.lucro) : null,
    forma_pagamento: v.forma_pagamento,
    canal_venda:   v.canal_venda,
    status:        v.status,
    parcelas:      v.parcelas,
    cliente_id:    v.cliente_id,
    produto_id:    v.produto_id,
    observacoes:   v.observacoes,
    quantidade:    v.quantidade ?? 1,
    numero_serie:  v.numero_serie,
    desconto_valor: v.desconto_valor != null ? Number(v.desconto_valor) : null,
    cliente_nome:  one(v.clientes)?.nome  ?? null,
    produto_nome:  one(v.produtos)?.nome  ?? null,
    vendedor_nome: one(v.usuarios)?.nome  ?? null,
    pagamentos: (pagosPorGrupo.get(v.grupo_pdv ?? `v:${v.id}`) ?? [])
      .map((p) => ({ forma_pagamento: p.forma_pagamento, valor_pago: Number(p.valor_pago), parcelas: p.parcelas })),
  }))

  const documentos = await documentosDisponiveis(supabase, empresaId!)


  return (
    <>
      <Topbar eyebrow="VENDAS · HISTÓRICO" title="Histórico de vendas" />
      <HistoricoView vendas={vendas} isAdmin={isAdmin} vendedores={vendedores} empresaId={empresaId!} documentos={documentos} />
    </>
  )
}

import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import { Topbar } from '@/components/layout/topbar'
import { HistoricoView } from '@/components/modules/historico/historico-view'
import { permissoesDoVinculo, permsDoContexto } from '@/lib/sessao'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { HREF_CELULARES } from '@/components/modules/celulares/modulo'

export const metadata = { title: 'Histórico de Vendas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function HistoricoPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: vinculo }, { data: usuario }, { data: membrosRaw }, { data: taxas }, cfgEmpresa] = await Promise.all([
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    // O "Entregar" abre a mesma tela de recebimento da aba Encomenda: parcelas e juros vêm das taxas.
    supabase.from('financeiro_taxas').select('id, forma_pagamento, bandeira, parcelas, percentual_taxa').eq('empresa_id', empresaId).eq('ativo', true),
    carregarConfigEmpresa(supabase, empresaId ?? 0),
  ])
  const isAdmin = !!((usuario as { is_super_admin?: boolean } | null)?.is_super_admin || (vinculo as { role?: string } | null)?.role === 'owner' || (vinculo as { role?: string } | null)?.role === 'admin')
  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const vendedores = ((membrosRaw ?? []) as unknown as MembroRow[]).map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  // Cada vendedor vê as próprias vendas. Papel desconhecido (super admin
  // impersonando, que não tem vínculo) vê tudo — mesma regra do funil.
  const papel = (vinculo as { role?: string } | null)?.role ?? ''
  const soMinhas = !isAdmin && !!papel && !!user
    && !permsDoContexto(await permissoesDoVinculo(supabase, empresaId, user!.id)).verVendasOutros

  const baseVendas = supabase
    .from('vendas_vendas')
    .select(`
      id, data_venda, concluida_em, valor_venda, lucro, forma_pagamento,
      canal_venda, status, parcelas, cliente_id, produto_id, numero_serie, desconto_valor, observacoes, quantidade, grupo_pdv,
      clientes:contatos!cliente_id(nome),
      produtos:estoque_produtos!produto_id(nome),
      usuarios!vendedor_id(nome)
    `)
    .eq('empresa_id', empresaId)
    .order('data_venda', { ascending: false })
    .limit(500)

  /**
   * A consulta a `empresas` saiu daqui porque o resultado nunca era usado.
   *
   * Era uma ida ao banco por abertura do Histórico, buscando nome, CNPJ,
   * telefone e logo para jogar fora — provavelmente sobra de quando esta tela
   * montava o contrato. Quem emite documento hoje é `emitirContrato`, que busca
   * os dados da loja por conta própria.
   */
  const { data: vendasRaw } = soMinhas ? await baseVendas.eq('vendedor_id', user!.id) : await baseVendas

  type VendaRow = {
    id: number; data_venda: string | null; concluida_em: string | null; valor_venda: number; lucro: number | null
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
    concluida_em:  v.concluida_em,
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
    grupo_pdv:     v.grupo_pdv,
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
      <HistoricoView vendas={vendas} isAdmin={isAdmin} vendedores={vendedores} empresaId={empresaId!} documentos={documentos}
        taxas={taxas ?? []} celulares={ligadosDaEmpresa(cfgEmpresa).has(HREF_CELULARES)} />
    </>
  )
}

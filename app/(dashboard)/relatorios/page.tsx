import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { exigirPermissao, temPermissao } from '@/lib/sessao'
import { Topbar } from '@/components/layout/topbar'
import { RelatoriosView } from '@/components/modules/relatorios/relatorios-view'
import { RelatoriosImobView } from '@/components/modules/imoveis/relatorios-imob-view'
import { exigirPlano } from '@/lib/acesso'
import { capacidades, carregarConfigEmpresa, vocabulario } from '@/lib/empresa-config'
import { JUNCAO_CUSTO_VENDA, custoDaVenda, lucro as lucroDaVenda } from '@/lib/custo'
import { resumoEmAberto, STATUS_EM_ABERTO, type LinhaEmAberto } from '@/lib/vendas-mes'
import { vendasDoPeriodo } from '@/lib/vendas-periodo'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { agora, diaNoFuso, primeiroDoMes, somarDias } from '@/lib/datas'

export const metadata = { title: 'Relatórios' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

// Roteador único de relatórios (preset com telas próprias → relatório imob;
// demais → BI genérico, plan-gated). Substitui a rota órfã /relatorios-imob.
export default async function RelatoriosPage({ searchParams }: {
  searchParams: Promise<{ de?: string; ate?: string; corretor?: string }>
}) {
  // Etapa 1.1b: a permissão do cargo decide (Dono, Administrador e Consulta, de fábrica).
  const ctx = await exigirPermissao('core.ver_relatorios')
  /**
   * Custo, lucro e margem só para quem tem estoque.ver_custo; o livro-caixa só para quem tem core.ver_financeiro
   * (o cargo Consulta abre Relatórios e não vê nenhum dos dois). O custo nem é pedido ao banco: o dado não
   * chega ao navegador. Desde a 1.1e o custo vem do satélite (vendas_vendas_custos, junção que a RLS só abre com
   * estoque.ver_custo), nunca de vendas_vendas.valor_custo/lucro; o lucro é calculado aqui.
   */
  const verCusto = temPermissao(ctx, 'estoque.ver_custo')
  const verFinanceiro = temPermissao(ctx, 'core.ver_financeiro')
  const podeExportar = temPermissao(ctx, 'core.exportar')
  const [supabase, empresaId, sp] = await Promise.all([createClient(), getEmpresaId(), searchParams])
  // Mesma capacidade do dashboard: o módulo ligado traz as próprias telas de leitura.
  const cfg = await carregarConfigEmpresa(supabase, empresaId ?? 0)
  if (capacidades(cfg).telasProprias) {
    return (
      <>
        <Topbar title="Relatórios" />
        <RelatoriosImobView de={sp.de ?? ''} ate={sp.ate ?? ''} corretor={sp.corretor ?? ''} equipe={vocabulario(cfg).equipe} />
      </>
    )
  }

  await exigirPlano('bi')

  /**
   * O período vai para o banco (lib/vendas-periodo): pelo dia da CONCLUSÃO, paginado até o fim.
   * Antes eram as 500 mais recentes pelo lançamento, filtradas no navegador — a encomenda lançada há
   * mais de 500 vendas e entregue no período sumia. Padrão: do dia 1 até hoje, no calendário da loja.
   * A busca cobre também os 7 últimos dias, que o gráfico "Vendas por dia" mostra sempre.
   */
  const fuso = await fusoDaEmpresa(supabase, empresaId)
  const hoje = diaNoFuso(agora(), fuso)
  const diaOk = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
  const de = diaOk(sp.de) ?? primeiroDoMes(hoje)
  const ate = diaOk(sp.ate) ?? hoje
  const seteDias = somarDias(hoje, -6)
  const busca = { de: de < seteDias ? de : seteDias, ate: ate > hoje ? ate : hoje }

  const [vendasRaw, { data: lancamentos }, { data: vendedoresRaw }, { data: trocasPendentes }, { data: abertasRaw }] = await Promise.all([
    vendasDoPeriodo(supabase, empresaId!,
      `id, data_venda, concluida_em, valor_venda, desconto_valor, forma_pagamento, canal_venda, status, grupo_pdv, observacoes, clientes:contatos!cliente_id(nome), produtos:estoque_produtos!produto_id(nome), usuarios!vendedor_id(nome)${verCusto ? `, ${JUNCAO_CUSTO_VENDA}` : ''}`,
      busca, fuso),
    verFinanceiro
      ? supabase
        .from('financeiro_lancamentos')
        .select('id, data_venc, descricao, categoria, tipo, valor, status')
        .eq('empresa_id', empresaId).order('data_venc', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('empresa_usuarios')
      .select('usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    // Aparelhos aceitos em troca que ainda não chegaram. Aqui NÃO tiram a venda da
    // conta — o dono precisa do número real do mês. Servem para separar quanto do
    // faturamento ainda depende de um aparelho entrar na loja.
    supabase.from('estoque_unidades').select('grupo_pdv')
      .eq('empresa_id', empresaId).eq('status', 'pendente').eq('ativo', true).not('grupo_pdv', 'is', null),
    // Encomendas e pendentes de entrega: fora do faturamento, num bloco à parte (lib/vendas-mes).
    supabase.from('vendas_vendas').select('id, valor_venda, status, grupo_pdv, pagamentos:vendas_pagamentos(valor_pago)')
      .eq('empresa_id', empresaId).in('status', [...STATUS_EM_ABERTO]),
  ])

  type VendaRow = {
    id: number; data_venda: string | null; concluida_em: string | null; valor_venda: number
    desconto_valor: number | null; forma_pagamento: string | null; canal_venda: string | null; status: string | null
    grupo_pdv: string | null; observacoes: string | null
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
    /** Só com estoque.ver_custo (a junção nem é pedida sem ela). */
    custo?: Embed<{ valor_custo: number | null }>
  }
  const gruposRetidos = new Set(
    ((trocasPendentes ?? []) as { grupo_pdv: string | null }[])
      .map((u) => u.grupo_pdv).filter((g): g is string => !!g),
  )
  const vendas = ((vendasRaw ?? []) as unknown as VendaRow[]).map(({ custo: juncao, clientes, produtos, usuarios, ...v }) => {
    // Sem a permissão a junção nem veio: custo e lucro nulos, e a tela não inventa margem.
    const custo = verCusto ? custoDaVenda({ custo: juncao }) : null
    return {
      ...v,
      valor_custo: custo,
      lucro: lucroDaVenda(v.valor_venda, custo),
      cliente_nome: one(clientes)?.nome ?? null,
      produto_nome: one(produtos)?.nome ?? null,
      vendedor_nome: one(usuarios)?.nome ?? null,
      troca_pendente: !!v.grupo_pdv && gruposRetidos.has(v.grupo_pdv),
    }
  })

  type VendedorRow = { usuarios: Embed<{ nome: string | null }> }
  const vendedores = [...new Set(
    ((vendedoresRaw ?? []) as unknown as VendedorRow[]).map((eu) => one(eu.usuarios)?.nome).filter((n): n is string => Boolean(n)),
  )]

  return (
    <>
      <Topbar title="Relatórios" />
      <RelatoriosView vendas={vendas} lancamentos={lancamentos ?? []} vendedores={vendedores} de={de} ate={ate}
        verCusto={verCusto} verFinanceiro={verFinanceiro} podeExportar={podeExportar}
        emAberto={resumoEmAberto((abertasRaw ?? []) as unknown as LinhaEmAberto[])} />
    </>
  )
}

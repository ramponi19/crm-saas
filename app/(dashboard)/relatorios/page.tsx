import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { RelatoriosView } from '@/components/modules/relatorios/relatorios-view'
import { RelatoriosImobView } from '@/components/modules/imoveis/relatorios-imob-view'
import { exigirPlano } from '@/lib/acesso'
import { capacidades, carregarConfigEmpresa, vocabulario } from '@/lib/empresa-config'
import type { Tables } from '@/types/database'
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
  await requireEmpresaRole(['owner', 'admin'])
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
      'id, data_venda, concluida_em, valor_venda, valor_custo, desconto_valor, lucro, forma_pagamento, canal_venda, status, grupo_pdv, observacoes, clientes:contatos!cliente_id(nome), produtos:estoque_produtos!produto_id(nome), usuarios!vendedor_id(nome)',
      busca, fuso),
    supabase
      .from('financeiro_lancamentos')
      .select('id, data_venc, descricao, categoria, tipo, valor, status')
      .eq('empresa_id', empresaId).order('data_venc', { ascending: false }).limit(200),
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

  type VendaRow = Tables<'vendas_vendas'> & {
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
  }
  const gruposRetidos = new Set(
    ((trocasPendentes ?? []) as { grupo_pdv: string | null }[])
      .map((u) => u.grupo_pdv).filter((g): g is string => !!g),
  )
  const vendas = ((vendasRaw ?? []) as unknown as VendaRow[]).map((v) => ({
    ...v,
    cliente_nome: one(v.clientes)?.nome ?? null,
    produto_nome: one(v.produtos)?.nome ?? null,
    vendedor_nome: one(v.usuarios)?.nome ?? null,
    troca_pendente: !!v.grupo_pdv && gruposRetidos.has(v.grupo_pdv),
  }))

  type VendedorRow = { usuarios: Embed<{ nome: string | null }> }
  const vendedores = [...new Set(
    ((vendedoresRaw ?? []) as unknown as VendedorRow[]).map((eu) => one(eu.usuarios)?.nome).filter((n): n is string => Boolean(n)),
  )]

  return (
    <>
      <Topbar title="Relatórios" />
      <RelatoriosView vendas={vendas} lancamentos={lancamentos ?? []} vendedores={vendedores} de={de} ate={ate}
        emAberto={resumoEmAberto((abertasRaw ?? []) as unknown as LinhaEmAberto[])} />
    </>
  )
}

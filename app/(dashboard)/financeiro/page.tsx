import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { mesclarTaxas, type TaxasComissao } from '@/lib/comissao-imob'
import type { NegocioComissao } from '@/components/modules/financeiro/comissoes-imob'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  const { role } = await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  /**
   * O faturamento das VENDAS entra aqui só para a tela poder AVISAR que ele não
   * está no cálculo.
   *
   * Venda concluída não gera lançamento financeiro — quem lança é a mão, o
   * orçamento por link e o webhook de pagamento. Consequência: a loja que registra
   * o aluguel e não lança as vendas vê "Resultado líquido" negativo enquanto o
   * Dashboard mostra faturamento no mesmo dia. Dois números verdadeiros que se
   * contradizem, e o dono não tem como saber qual olhar.
   *
   * A decisão de gerar receita automaticamente é de produto (risco de duplicar com
   * o lançamento manual), e está com o dono. Até lá a tela DIZ o que ela não conta,
   * em vez de deixar o número mentir sozinho.
   */
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ data: lancamentos }, { data: cobrancas }, { data: vendasMes }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').eq('empresa_id', empresaId).order('data_venc', { ascending: false }),
    supabase.from('cobrancas')
      .select('id, tipo, valor, status, descricao, created_at, link_pagamento, qr_code, linha_digitavel, vencimento, provider, os_id, venda_id, cliente_id, clientes(nome)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('vendas').select('valor_venda')
      .eq('empresa_id', empresaId).eq('status', 'concluida').gte('data_venda', inicioMes),
  ])

  const faturamentoVendas = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)

  /**
   * Comissão por negócio — só para o segmento que declara a capacidade.
   *
   * Aditivo: o livro-caixa acima continua igual para todos. A imobiliária ganha uma
   * aba a mais, e nenhum outro segmento paga por ela (a consulta nem roda).
   */
  const { data: empresaSeg } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  const cfgSeg = SEGMENTOS[normalizarSegmento(empresaSeg?.segmento)]
  let negociosComissao: NegocioComissao[] = []
  let taxasComissao: TaxasComissao | null = null

  if (cfgSeg.capacidades.comissaoPorNegocio) {
    const [{ data: negRaw }, { data: taxaRow }] = await Promise.all([
      supabase.from('negocios_imobiliarios')
        .select('id, tipo, valor, status, assinado_em, percentual, comissao_total, comissao_captador, comissao_vendedor, cashback, comissao_status, comissao_paga_em, imovel_id, lead_id, cliente_id, corretor_id, captador_id')
        .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(300),
      supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'comissao_imob').maybeSingle(),
    ])
    taxasComissao = mesclarTaxas((taxaRow?.valor ?? null) as Partial<TaxasComissao> | null)

    type NegRow = {
      id: number; tipo: string; valor: number; status: string; assinado_em: string | null
      percentual: number | null; comissao_total: number | null; comissao_captador: number | null
      comissao_vendedor: number | null; cashback: number | null; comissao_status: string | null
      comissao_paga_em: string | null; imovel_id: number; lead_id: number | null
      cliente_id: number | null; corretor_id: string | null; captador_id: string | null
    }
    const negocios = (negRaw ?? []) as NegRow[]

    /**
     * Nomes por consulta separada, de propósito.
     *
     * Seriam quatro embeds — imóvel, lead, cliente e DUAS vezes usuarios (corretor e
     * captador). Embed para a mesma tabela duas vezes exige nomear cada chave
     * estrangeira, e um nome errado esvazia a consulta INTEIRA em silêncio no
     * PostgREST. Já custou uma depuração em 12/08; não custa a segunda.
     */
    const ids = <T,>(arr: (T | null)[]) => [...new Set(arr.filter((x): x is T => x != null))]
    const [{ data: imoveisN }, { data: leadsN }, { data: clientesN }, { data: usuariosN }] = await Promise.all([
      supabase.from('imoveis').select('id, codigo, titulo').in('id', ids(negocios.map((n) => n.imovel_id))),
      supabase.from('leads').select('id, nome').in('id', ids(negocios.map((n) => n.lead_id))),
      supabase.from('clientes').select('id, nome').in('id', ids(negocios.map((n) => n.cliente_id))),
      supabase.from('usuarios').select('id, nome').in('id', ids([...negocios.map((n) => n.corretor_id), ...negocios.map((n) => n.captador_id)])),
    ])
    const mapaImovel = new Map((imoveisN ?? []).map((i) => [i.id, i.codigo || i.titulo || `#${i.id}`]))
    const mapaLead = new Map((leadsN ?? []).map((l) => [l.id, l.nome]))
    const mapaCliente = new Map((clientesN ?? []).map((c) => [c.id, c.nome]))
    const mapaUsuario = new Map((usuariosN ?? []).map((u) => [u.id, u.nome]))

    negociosComissao = negocios.map((n) => ({
      id: n.id, tipo: n.tipo, valor: Number(n.valor), status: n.status, assinado_em: n.assinado_em,
      percentual: n.percentual, comissao_total: n.comissao_total,
      comissao_captador: n.comissao_captador, comissao_vendedor: n.comissao_vendedor,
      cashback: n.cashback, comissao_status: n.comissao_status, comissao_paga_em: n.comissao_paga_em,
      imovel: mapaImovel.get(n.imovel_id) ?? null,
      cliente: (n.cliente_id ? mapaCliente.get(n.cliente_id) : null) ?? (n.lead_id ? mapaLead.get(n.lead_id) : null) ?? null,
      corretor: n.corretor_id ? mapaUsuario.get(n.corretor_id) ?? null : null,
      captador: n.captador_id ? mapaUsuario.get(n.captador_id) ?? null : null,
    }))
  }

  return (
    <FinanceiroView
      lancamentos={lancamentos ?? []}
      categorias={[]}
      cobrancas={cobrancas ?? []}
      empresaId={empresaId!}
      faturamentoVendas={faturamentoVendas}
      qtdVendas={(vendasMes ?? []).length}
      comissoesNegocio={taxasComissao ? negociosComissao : null}
      taxasComissao={taxasComissao}
      podeQuitarComissao={role === 'owner' || role === 'admin'}
    />
  )
}

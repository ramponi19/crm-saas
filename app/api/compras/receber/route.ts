import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { NADA_GRAVADO, nadaGravado } from '@/lib/linhas-afetadas'
import { exigirModuloLigado } from '@/lib/modulo-ligado'

/**
 * Marca um pedido de compra como RECEBIDO e dá ENTRADA da unidade no estoque
 * (controle/segurança). Se o pedido for de uma ENCOMENDA (venda vinculada), a
 * unidade entra como 'reservado' e é ligada à venda — que baixa ao finalizar.
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const trava = await exigirModuloLigado(empresaId, 'compras')
  if (trava) return trava

  const { pedidoId } = (await req.json().catch(() => ({}))) as { pedidoId?: number }
  if (!pedidoId) return NextResponse.json({ error: 'Pedido ausente' }, { status: 400 })

  // Sem o valor (etapa 1.1e): é custo, mora no satélite e quem recebe pode não ter `estoque.ver_custo`.
  const { data: pedido } = await supabase.from('compras_pedidos')
    .select('id, status, descricao').eq('id', pedidoId).eq('empresa_id', empresaId).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.status === 'recebido') return NextResponse.json({ ok: true, jaRecebido: true })

  // Encomenda vinculada a este pedido?
  const { data: venda } = await supabase.from('vendas_vendas')
    .select('id, unidade_id, produto_id, valor_venda').eq('pedido_compra_id', pedidoId).eq('status', 'encomenda').maybeSingle()

  // Só a ENCOMENDA gera unidade automática (reservada p/ a venda). Compra comum
  // (reposição em lote) NÃO cria unidade-fantasma — o operador dá entrada no
  // estoque com os dados reais (IMEI, cor, qtd…) pelo módulo de Estoque.
  let unidadeId: number | null = null
  if (venda) {
    // A unidade nasce SEM custo (pendente) pelo cliente do usuário — a RLS e as travas de hoje valem.
    const { data: unidade, error: eUni } = await supabase.from('estoque_unidades').insert({
      empresa_id: empresaId,
      produto_id: venda.produto_id ?? null,
      condicao: 'novo',
      tipo: 'compra',
      status: 'reservado',
      preco_venda: venda.valor_venda ?? null,
      observacoes: `Entrada por encomenda #${pedido.id}${pedido.descricao ? ` — ${pedido.descricao}` : ''}.`,
      ativo: true,
    } as never).select('id, filial_id').single()
    if (eUni) return NextResponse.json({ error: eUni.message }, { status: 500 })
    const criada = unidade as { id?: number; filial_id?: number | null } | null
    unidadeId = criada?.id ?? null
    /**
     * O CUSTO DA UNIDADE É O VALOR DO PEDIDO (etapa 1.1e). Os dois satélites não têm escrita pelo navegador nem
     * leitura sem `estoque.ver_custo`; aqui é o servidor que copia um para o outro, com a chave de serviço, e o
     * valor não volta na resposta. O pedido já foi conferido acima (empresa da sessão, pela RLS). Valor não
     * informado: a unidade fica com custo pendente, e aparece na lista de pendentes do dono.
     */
    if (unidadeId) {
      const svc = createServiceClient() as unknown as SupabaseClient
      const { data: custoPedido } = await svc.from('compras_pedidos_custos')
        .select('valor_total').eq('pedido_id', pedido.id).maybeSingle()
      const valorPedido = (custoPedido as { valor_total: number | null } | null)?.valor_total ?? null
      // Zero é "não informado" (a encomenda criava o pedido com 0 até a 1.1e): não vira custo zero de verdade.
      if (valorPedido != null && valorPedido > 0) {
        const { error: eCusto } = await svc.from('estoque_unidades_custos').upsert({
          unidade_id: unidadeId, empresa_id: empresaId, filial_id: criada?.filial_id ?? null,
          preco_custo: valorPedido, custo_origem: 'compra',
        }, { onConflict: 'unidade_id' })
        // Não desfaz a entrada: a peça chegou. O custo fica pendente e o dono informa pela lista de pendentes.
        if (eCusto) console.error('[compras/receber] custo da unidade não gravado', unidadeId, eCusto.message)
      }
    }
    if (unidadeId && !venda.unidade_id) {
      await supabase.from('vendas_vendas').update({ unidade_id: unidadeId } as never).eq('id', venda.id)
    }
  }

  const { data: recebido, error: ePed } = await supabase.from('compras_pedidos').update({ status: 'recebido' } as never).eq('id', pedidoId).select('id')
  if (ePed) return NextResponse.json({ error: ePed.message }, { status: 500 })
  if (nadaGravado(recebido)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })

  return NextResponse.json({ ok: true, unidadeId, encomenda: !!venda })
}

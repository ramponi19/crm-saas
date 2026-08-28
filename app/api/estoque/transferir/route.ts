import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { rotuloDaFilial } from '@/lib/filiais'

/**
 * Manda unidades do estoque para outra loja da rede.
 *
 * A transferência é EM DUAS PONTAS, e não uma troca de campo: aqui a unidade sai
 * da loja de origem e chega na de destino como `pendente`; quem recebe confirma
 * fisicamente em "Confirmar chegada" (`/api/estoque/confirmar-chegada`), que já
 * existia para as trocas do PDV e faz exatamente isto.
 *
 * Por que não deixar disponível na hora: entre Mogi Guaçu e Jaguariúna há uma
 * viagem. Se o aparelho já aparecesse vendável no destino, as duas lojas
 * poderiam vendê-lo no mesmo dia — uma com a peça na mão e a outra com uma
 * promessa. `pendente` fica fora do PDV, então enquanto viaja ninguém vende, que
 * é a verdade física da coisa.
 *
 * O rastro fica em `movimentacao_estoque` com DUAS linhas: a saída pertence à
 * loja de origem e a entrada à de destino. Uma linha só ficaria visível a apenas
 * uma das lojas — a outra veria a peça sumir sem explicação.
 */

/** Só o que está na prateleira viaja. Reservado, vendido ou em reparo, não. */
const TRANSFERIVEL = 'disponivel'

export async function POST(req: NextRequest) {
  const sessao = await requireEmpresaRoleApi(['owner', 'admin'])
  if (sessao.error) return sessao.error
  const { supabase, empresaId, userId } = sessao

  let body: { ids?: unknown; filialDestino?: unknown; observacoes?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }

  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : []
  const destinoId = Number(body.filialDestino)
  const observacoes = typeof body.observacoes === 'string' ? body.observacoes.trim().slice(0, 300) : ''

  if (ids.length === 0) return NextResponse.json({ error: 'Nenhuma unidade selecionada.' }, { status: 400 })
  if (!Number.isFinite(destinoId) || destinoId <= 0) return NextResponse.json({ error: 'Loja de destino inválida.' }, { status: 400 })

  const { data: destino } = await supabase
    .from('filiais').select('id, nome, cidade')
    .eq('id', destinoId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()
  if (!destino) return NextResponse.json({ error: 'Loja de destino não encontrada nesta rede.' }, { status: 404 })

  /**
   * A leitura passa pela RLS de propósito: quem transfere só pode mover o que
   * enxerga. Com uma loja selecionada no topo, é o estoque dela; em "Rede", o de
   * todas. Não há caminho para mexer no estoque de uma loja que a pessoa não vê.
   */
  const { data: unidades, error: erroLeitura } = await supabase
    .from('inventario_unidades')
    .select('id, filial_id, produto_id, quantidade, status')
    .in('id', ids).eq('empresa_id', empresaId).eq('ativo', true)
  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 400 })

  const alvos = (unidades ?? []) as Array<{
    id: number; filial_id: number | null; produto_id: number | null; quantidade: number | null; status: string | null
  }>

  const paradas = alvos.filter(u => u.status !== TRANSFERIVEL)
  if (paradas.length) {
    return NextResponse.json(
      { error: `${paradas.length === 1 ? 'Uma unidade não está' : `${paradas.length} unidades não estão`} disponível para transferir — reservada, vendida ou em reparo.` },
      { status: 409 },
    )
  }

  const jaLa = alvos.filter(u => u.filial_id === destinoId)
  if (jaLa.length) {
    return NextResponse.json({ error: 'Essas unidades já estão na loja de destino.' }, { status: 409 })
  }

  const encontradas = alvos.map(u => u.id)
  if (encontradas.length !== ids.length) {
    return NextResponse.json({ error: 'Alguma unidade não foi encontrada no estoque que você enxerga.' }, { status: 404 })
  }

  const agora = new Date().toISOString()
  const nomeDestino = rotuloDaFilial(destino as { nome: string; cidade: string | null })

  /**
   * `status` volta a `pendente` e o recebimento é ZERADO.
   *
   * Sem limpar `recebido_em`, uma unidade que já chegou uma vez carregaria a data
   * antiga e a tela mostraria uma peça "recebida" que está na estrada.
   *
   * O filtro por `status` no próprio UPDATE torna a operação idempotente: dois
   * cliques, ou duas pessoas ao mesmo tempo, não transferem duas vezes nem
   * atropelam uma venda que aconteceu no meio.
   */
  const { data: movidas, error: erroUpdate } = await supabase
    .from('inventario_unidades')
    .update({
      filial_id: destinoId,
      status: 'pendente',
      recebido_em: null,
      recebido_por: null,
    })
    .in('id', encontradas)
    .eq('empresa_id', empresaId)
    .eq('status', TRANSFERIVEL)
    .select('id')
  if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 400 })

  const movidasIds = ((movidas ?? []) as { id: number }[]).map(m => m.id)
  if (movidasIds.length === 0) {
    return NextResponse.json({ error: 'Nada foi transferido — o estoque mudou enquanto você decidia.' }, { status: 409 })
  }

  const nota = observacoes ? ` · ${observacoes}` : ''
  const linhas = alvos
    .filter(u => movidasIds.includes(u.id))
    .flatMap(u => {
      const qtd = Math.max(1, u.quantidade ?? 1)
      return [
        {
          empresa_id: empresaId, filial_id: u.filial_id, produto_id: u.produto_id, usuario_id: userId,
          tipo_movimento: 'transferencia_saida', quantidade: -qtd,
          observacoes: `Transferido para ${nomeDestino}${nota}`,
        },
        {
          empresa_id: empresaId, filial_id: destinoId, produto_id: u.produto_id, usuario_id: userId,
          tipo_movimento: 'transferencia_entrada', quantidade: qtd,
          observacoes: `Recebido em transferência${nota}`,
        },
      ]
    })

  /**
   * O registro do movimento não desfaz a transferência se falhar.
   *
   * A peça já mudou de loja — é isso que precisa estar certo. Perder a linha do
   * histórico é ruim; reverter a unidade e deixar o físico e o sistema em
   * desacordo é pior.
   */
  const { error: erroMov } = await supabase.from('movimentacao_estoque').insert(linhas)

  return NextResponse.json({
    ok: true,
    transferidas: movidasIds.length,
    destino: nomeDestino,
    aviso: erroMov ? 'A transferência foi feita, mas o histórico não registrou.' : undefined,
    ids: movidasIds,
    transferidoEm: agora,
  })
}

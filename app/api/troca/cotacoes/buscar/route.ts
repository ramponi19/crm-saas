import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { nomeCompleto } from '@/lib/troca-modelos'

/**
 * Resolve o CÓDIGO da cotação para o abatimento do PDV.
 *
 * O vendedor digita o número na seção "Aparelho(s) na troca" e recebe o
 * aparelho, o IMEI e o valor já calculado. Sem isso ele redigita o valor de um
 * aparelho usado com o cliente na frente — e é aí que o número muda "sem
 * querer", sempre para cima.
 *
 * ══ POR QUE GET E POR QUE POR `numero` ═════════════════════════════════════
 *
 * `numero` é único POR EMPRESA, e a RLS já limita a busca à empresa da sessão —
 * então o código da JM nunca resolve para a cotação de outro tenant, mesmo
 * digitado igual. Não passo `empresa_id` no filtro por escolha: se um dia a
 * política mudar, quero que a consulta pare de achar em vez de achar demais.
 * (`empresa_id` está no `eq` de propósito redundante abaixo — cinto e suspensório
 * em cima de dinheiro.)
 *
 * ══ A COTAÇÃO JÁ USADA NÃO É ERRO — É AVISO ════════════════════════════════
 *
 * Devolvo os dados mesmo assim, com `ja_usada` e em qual venda. Recusar seria
 * pior: existe caso legítimo (venda cancelada e refeita) e o vendedor precisa
 * ver o valor para decidir. Quem decide é ele; a tela avisa.
 */
export async function GET(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const cru = new URL(req.url).searchParams.get('numero') ?? ''
  // Aceita "42", "#42" e "TR-42": o vendedor lê o código de onde estiver escrito.
  const numero = Number(cru.replace(/\D/g, ''))
  if (!Number.isInteger(numero) || numero <= 0) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
  }

  const { data } = await supabase.from('troca_cotacoes')
    .select('id, numero, modelo, armazenamento, imei, valor_final, na_troca, descontos_total, bonus, avarias, cliente_nome, usada_em, venda_id, created_at')
    .eq('empresa_id', empresaId).eq('numero', numero)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: `Não achei a cotação #${numero}` }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    numero: data.numero,
    /** Pronto para o campo "Aparelho" do PDV. */
    aparelho: nomeCompleto(data.modelo, data.armazenamento ?? ''),
    imei: data.imei ?? '',
    valor: Number(data.valor_final) || 0,
    base: Number(data.na_troca) || 0,
    descontos: Number(data.descontos_total) || 0,
    bonus: Number(data.bonus) || 0,
    avarias: (data.avarias ?? []) as string[],
    cliente_nome: data.cliente_nome,
    ja_usada: data.usada_em != null,
    venda_id: data.venda_id,
    criada_em: data.created_at,
  })
}

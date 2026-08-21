import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escolherResponsavel } from '@/lib/distribuicao'
import { excedeuLimite } from '@/lib/rate-limit'
import { carregarConfig, leadDoPayload, type LeadC2S } from '@/lib/c2s'

/**
 * Webhook INBOUND do Contact2Sale.
 *
 * URL: /api/webhook/c2s/{slug}?token={token de entrada}
 *
 * O C2S não assina o corpo (não existe `X-Hub-Signature` como na Meta), então a
 * autenticação é a URL secreta — mesmo desenho do webhook dos portais.
 *
 * DEVOLVE 200 SEMPRE QUE ENTENDEU o pedido, mesmo ignorando o lead. Parceiro que
 * recebe erro reenvia, e reenvio de um lead que já existe viraria fila infinita de
 * retentativa por um caso que é NORMAL: `on_update_lead` dispara a cada alteração
 * registrada lá. Erro (4xx/5xx) fica para o que ele precisa reenviar de verdade.
 *
 * Todo evento entra em `integracao_eventos` com o payload cru — é o que torna
 * "o lead não chegou" depurável, e é a tela que o CRM dele tem e o nosso não tinha.
 */

// Verificação de URL: o C2S (e qualquer um) pode bater aqui para ver se responde.
export async function GET() {
  return NextResponse.json({ ok: true })
}

type Svc = ReturnType<typeof createServiceClient>

async function registrar(
  svc: Svc,
  empresaId: number,
  dados: { acao: string | null; status: 'sucesso' | 'erro' | 'ignorado'; leadId?: number | null; externoId?: string | null; detalhes: string; payload: unknown },
) {
  await svc.from('integracao_eventos').insert({
    empresa_id: empresaId,
    origem: 'contact2sale',
    acao: dados.acao,
    status: dados.status,
    lead_id: dados.leadId ?? null,
    externo_id: dados.externoId ?? null,
    detalhes: dados.detalhes.slice(0, 500),
    payload: (dados.payload ?? null) as never,
  } as never)
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const token = new URL(req.url).searchParams.get('token')
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const cfg = await carregarConfig(svc, empresa.id)
  if (!cfg.entrada || token !== cfg.entrada) {
    // Sem log: token errado é tentativa de fora, e gravar o payload de quem não se
    // identificou é encher a tela do lojista com ruído de terceiro.
    return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  }

  /**
   * Teto por IP, como nas outras rotas abertas.
   *
   * Um parceiro em laço de retentativa não pode virar milhares de leads na base —
   * foi o que a auditoria de 18/08 fechou nas rotas públicas.
   */
  if (await excedeuLimite(svc, `c2s:${empresa.id}`, req, 300, 60)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let payload: unknown = null
  try { payload = await req.json() } catch { payload = null }

  const acao = (() => {
    const p = payload as Record<string, unknown> | null
    const a = p?.hook_action ?? p?.action ?? p?.event
    return typeof a === 'string' ? a : null
  })()

  const lead: LeadC2S | null = leadDoPayload(payload)
  if (!lead) {
    await registrar(svc, empresa.id, {
      acao, status: 'erro', detalhes: 'Payload sem cliente identificável (sem telefone, e-mail e id).', payload,
    })
    return NextResponse.json({ ok: false, error: 'payload_incompleto' }, { status: 200 })
  }

  /**
   * Repetição é o caso normal, não erro.
   *
   * `on_update_lead` dispara a cada log do lead lá. Casamos por `origem_id` — a
   * mesma convenção que o webhook da Meta e o dos portais usam — e ATUALIZAMOS o
   * que pode ter mudado, sem criar um segundo lead nem tocar na etapa do funil:
   * quem manda no funil daqui é o corretor daqui.
   */
  let leadId: number | null = null
  let status: 'sucesso' | 'ignorado' = 'sucesso'
  let detalhes = ''

  const { data: existente } = lead.externoId
    ? await svc.from('leads').select('id').eq('empresa_id', empresa.id).eq('origem_id', lead.externoId).maybeSingle()
    : { data: null }

  const observacao = [
    lead.produto ? `Imóvel: ${lead.produto}` : null,
    lead.origem ? `Fonte: ${lead.origem}` : null,
    lead.canal ? `Canal: ${lead.canal}` : null,
    lead.vendedorNome ? `Vendedor no C2S: ${lead.vendedorNome}` : null,
    lead.observacao,
  ].filter(Boolean).join(' · ')

  if (existente) {
    /**
     * Atualizacao SO SOBRESCREVE o que veio com valor.
     *
     * O primeiro teste pegou o estrago: `on_update_lead` mandou um payload enxuto
     * (so nome e preco) e o CRM zerou o imovel de interesse e a observacao que o
     * evento de criacao havia trazido. Payload parcial e o caso normal la — ele
     * dispara a cada log do lead — entao ausencia de campo significa "nao mudou",
     * nunca "apagou".
     */
    const patch: Record<string, unknown> = {}
    if (lead.nome) patch.nome = lead.nome
    if (lead.telefone) patch.telefone = lead.telefone
    if (lead.valor != null) patch.valor_estimado = lead.valor
    if (lead.produto) patch.produto_interessado = lead.produto
    if (observacao) patch.observacoes = observacao
    const { error } = Object.keys(patch).length
      ? await svc.from('leads').update(patch as never).eq('id', existente.id)
      : { error: null }
    leadId = existente.id
    status = 'ignorado'
    detalhes = error ? `Lead já existia; falha ao atualizar: ${error.message}` : 'Lead já existia — dados atualizados, etapa preservada.'
  } else {
    /**
     * Responsável: o vendedor do C2S, se ele existir aqui pelo MESMO e-mail.
     *
     * Sem casar por e-mail, todo lead cairia na roleta e o cliente trocaria de
     * corretor ao atravessar os sistemas — o que a imobiliária sente como
     * "o CRM novo embaralhou minha carteira". Sem par, aí sim vale a distribuição.
     */
    let responsavel: string | null = null
    if (lead.vendedorEmail) {
      const { data: u } = await svc.from('usuarios').select('id').eq('email', lead.vendedorEmail).maybeSingle()
      if (u) {
        const { data: vinculo } = await svc.from('empresa_usuarios')
          .select('usuario_id').eq('empresa_id', empresa.id).eq('usuario_id', u.id).eq('ativo', true).maybeSingle()
        if (vinculo) responsavel = u.id
      }
    }
    if (!responsavel) {
      responsavel = await escolherResponsavel(svc, empresa.id, { origem: 'contact2sale', valor_estimado: lead.valor })
    }

    const { data: novo, error } = await svc.from('leads').insert({
      empresa_id: empresa.id,
      nome: lead.nome,
      telefone: lead.telefone,
      origem: 'contact2sale',
      origem_id: lead.externoId,
      kanban_status: 'novo',
      ativo: true,
      responsavel_id: responsavel,
      responsavel_desde: responsavel ? new Date().toISOString() : null,
      valor_estimado: lead.valor,
      produto_interessado: lead.produto,
      observacoes: observacao || null,
      ultima_mensagem_at: new Date().toISOString(),
    } as never).select('id').single<{ id: number }>()

    if (error || !novo) {
      await registrar(svc, empresa.id, {
        acao, status: 'erro', externoId: lead.externoId,
        detalhes: `Falha ao criar lead: ${error?.message ?? 'sem retorno'}`, payload,
      })
      // 500 aqui é proposital: foi NOSSA falha, e o reenvio dele é desejável.
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    leadId = novo.id
    detalhes = `Lead criado${responsavel ? '' : ' sem responsável (nenhuma regra de distribuição atendeu)'}.`

    /**
     * Região de interesse vira perfil de busca — é o que alimenta o Match de
     * imóveis e a coluna "Região" da Gestão de Leads. Sem isto, o bairro que o
     * C2S já sabe morreria dentro de uma observação em texto.
     */
    if (lead.bairro || lead.cidade) {
      await svc.from('lead_perfil_busca').insert({
        empresa_id: empresa.id,
        lead_id: novo.id,
        bairros: lead.bairro ? [lead.bairro] : [],
        cidades: lead.cidade ? [lead.cidade] : [],
        ativo: true,
      } as never)
    }
  }

  await registrar(svc, empresa.id, { acao, status, leadId, externoId: lead.externoId, detalhes, payload })
  return NextResponse.json({ ok: true, leadId }, { status: 200 })
}

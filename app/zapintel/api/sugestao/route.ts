import { NextResponse } from 'next/server'
import { zapintelAcesso, lojaVisivel, leadDeFunilInterno } from '@/lib/zapintel/ctx'
import { excedeuLimiteDoUsuario } from '@/lib/rate-limit'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'
import { ondeTravou, contextoDaSugestao } from '@/lib/zapintel/travou'
import { montarFicha } from '@/lib/zapintel/ficha'
import { papelDoSegmento } from '@/lib/zapintel/papel'
import { perguntarIA } from '@/lib/zapintel/ia'

/**
 * A PRÓXIMA MENSAGEM, para o ponto em que a conversa travou.
 *
 * ══ POR QUE NO SERVIDOR, E NÃO NO NAVEGADOR ════════════════════════════════
 *
 * Porque o prompt precisa saber de que empresa estamos falando, e isso é FATO
 * do banco — não algo que a tela manda. Se o cliente montasse o prompt, quem
 * soubesse a URL escolheria o que a IA do CRM responde, pagando com a chave do
 * Lucas. A conversa também é lida aqui: o navegador nunca precisou dela
 * inteira para isso.
 *
 * ══ A ARMADILHA MULTI-TENANT QUE ESTE PROMPT DESVIA ════════════════════════
 *
 * O prompt do Copiloto (`lib/zapintel/insights/followUp.ts`) tem escrito no
 * código: *"Loja: JM Store, Mogi Guaçu SP. Vendedor: Pedro. Dono: Matheus."* e
 * "iPhones seminovos e perfumes importados". Para a Imobiliária, a IA do CRM
 * se apresenta como vendedor de iPhone de outra cidade.
 *
 * É o mesmo defeito do `STORE_PHONE` e da lista de nomes dos vendedores, que
 * já morreram em 10/10. Aqui o contexto vem de onde ele mora:
 *
 *     nome da loja ..... `carregarConversas` (tabela `empresas`)
 *     papel ............ `papelDoSegmento(segmento)`: Vendedor, Corretor…
 *
 * ══ POR QUE A IA NÃO PODE INVENTAR NÚMERO ══════════════════════════════════
 *
 * A mensagem vai ser enviada a um cliente de verdade. Um modelo que "ajuda"
 * oferecendo 10% de desconto ou um prazo que a loja não pratica cria uma
 * promessa que alguém vai ter que honrar ou desdizer. O prompt proíbe, a tela
 * avisa que é rascunho, e nada é enviado sem alguém clicar.
 */
export const dynamic = 'force-dynamic'

/**
 * A IA tem prazo total de 50 s (25 s por tentativa, uma repetição — ver
 * `TIMEOUT_POR_TENTATIVA_MS` em `lib/zapintel/ia.ts`), e o resto é a leitura
 * do banco. O Hobby permitiria até 300 s; 60 é escolha, não teto, e a razão
 * está lá. Estourou o prazo, a tela recebe "A análise demorou demais".
 *
 * Não ameaça o teto de CPU da conta: no modelo da Vercel, função PARADA
 * esperando rede não é Active CPU.
 */
export const maxDuration = 60

export async function POST(req: Request) {
  const acesso = await zapintelAcesso()
  if (!acesso) {
    return NextResponse.json({ erro: 'Sem acesso ao ZapIntel (só dono, admin ou empresa com o complemento ativo).' }, { status: 403 })
  }
  const { empresaId, userId } = acesso

  const body = ((await req.json().catch(() => null)) ?? {}) as { lead?: unknown }
  const id = Number(body.lead)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ erro: 'lead invalido' }, { status: 400 })
  }

  const db = rastrDb()
  // A empresa vem da sessão, não do corpo: pedir a conversa de um lead de outra
  // empresa não encontra nada, porque a busca é feita dentro da sua.
  const { analisados, porId, nomeDaLoja, segmento } = await carregarConversas(db, empresaId, [id])
  const lead = analisados[0]
  if (!lead || !lojaVisivel(acesso, porId.get(id)?.filial_id)) {
    return NextResponse.json({ erro: 'conversa nao encontrada' }, { status: 404 })
  }

  const { data: ponte } = await db
    .from('zapintel_venda_lead').select('venda_id')
    .eq('empresa_id', empresaId).eq('lead_id', id).limit(1).maybeSingle()

  const travou = ondeTravou(lead, !!ponte)
  if (!travou) {
    return NextResponse.json(
      { erro: 'Esta conversa não tem um ponto de travamento para retomar.' },
      { status: 422 },
    )
  }

  const papel = papelDoSegmento(segmento)

  /**
   * ⚠ O RAMO DO SEGMENTO SAIU DAQUI, e a razão está na tela.
   *
   * O prompt dizia `Sobre o negócio: ${getSegment(segmentId).followupContext}`.
   * Medido em produção em 13/10/2026, foi isto que a IA escreveu para clientes
   * que queriam iPhone:
   *
   *     "ainda tenho suas PEÇAS separadinhas aqui"
   *     "garantir aquele ITEM com a gente"
   *
   * Vocabulário de loja de roupa. A JM tem `segmento = 'varejo'` no CRM, e
   * `CRM_TO_ZAPINTEL` manda varejo → `ecommerce`, cujo `followupContext` é
   * "Atendente de loja de moda/varejo". O mapa não distingue varejo de celular
   * de varejo de roupa, e o ZapIntel tem um segmento `celulares` que ninguém
   * alcança.
   *
   * O conserto não é corrigir o mapa aqui: é parar de deduzir o negócio.
   * `contextoDaSugestao` passa o que o CLIENTE pediu NESTA conversa e a última
   * oferta que a loja fez — fato, e descreve o negócio melhor que o rótulo.
   *
   * O `papel` fica: "Vendedor"/"Corretor"/"Atendente" erra bem menos, e é só
   * uma palavra.
   */
  const ficha = montarFicha(lead, {
    leadId: id,
    filialId: lead.crm?.filialId ?? null,
    canal: lead.crm?.canal ?? 'whatsapp',
    comprou: !!ponte,
    valorVenda: null,
    diasAteVenda: null,
  })

  const system = [
    `Você escreve a próxima mensagem de WhatsApp para ${papel.toLowerCase()} de ${nomeDaLoja}.`,
    '',
    'REGRAS, todas obrigatórias:',
    '- Escreva em português brasileiro informal e caloroso, como gente de loja fala.',
    '- No máximo 2 frases. É mensagem de WhatsApp, não e-mail.',
    '- Trate a pessoa pelo primeiro nome. Se o nome for "Cliente", ele não é',
    '  conhecido: não use nome nenhum (nada de "Oi, Cliente").',
    '- Trechos como [CPF], [TELEFONE], [E-MAIL] ou [Nº] foram ocultados de',
    '  propósito: não os escreva na mensagem nem tente adivinhar o que havia.',
    '- NUNCA invente preço, desconto, parcela, prazo ou condição que não esteja',
    '  escrito no contexto. Prometer o que a loja não disse cria dívida que',
    '  alguém vai ter que honrar ou desdizer.',
    '- Fale do produto pelo nome que aparece no contexto. Se não houver nenhum,',
    '  não invente categoria ("suas peças", "aquele item"): fale do pedido dele.',
    '- Não se desculpe pela demora mais de uma vez, e não use "prezado",',
    '  "venho por meio desta" nem emoji em excesso (no máximo um).',
    '- Responda SOMENTE com o texto da mensagem, sem aspas e sem explicação.',
  ].join('\n')

  const prompt = [
    'Esta conversa travou. Escreva a mensagem que retoma dali.',
    '',
    contextoDaSugestao(lead, travou, ficha),
  ].join('\n')

  if (await leadDeFunilInterno(db, empresaId, id)) {
    return NextResponse.json({ erro: 'Conversa de funil interno (equipe ou candidatos) fica fora das análises do ZapIntel.' }, { status: 422 })
  }

  // Chamada paga e sem cache (cada clique escreve de novo): teto por pessoa.
  if (await excedeuLimiteDoUsuario(db, 'zapintel-sugestao', userId, 40)) {
    return NextResponse.json({ erro: 'Muitas sugestões nesta hora. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  const r = await perguntarIA({
    empresaId,
    system,
    mensagens: [{ role: 'user', content: prompt }],
    // Sem teto apertado: ele é cobrado do mesmo saldo que o pensamento do
    // modelo e truncaria a mensagem no meio. Quem segura o tamanho é a regra
    // das 2 frases no `system`. Ver `lib/zapintel/ia.ts`.
    origem: 'sugestao',
  })

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
  return NextResponse.json({ mensagem: r.texto, travou })
}

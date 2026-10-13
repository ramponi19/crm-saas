import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'
import { ondeTravou, contextoDaSugestao } from '@/lib/zapintel/travou'
import { getRole, getSegment } from '@/lib/zapintel/segments/segments'
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
 *     papel ............ `getRole(segmentId)`: Vendedor, Corretor, Atendente…
 *     o negócio ........ `getSegment(segmentId).followupContext`
 *
 * ══ POR QUE A IA NÃO PODE INVENTAR NÚMERO ══════════════════════════════════
 *
 * A mensagem vai ser enviada a um cliente de verdade. Um modelo que "ajuda"
 * oferecendo 10% de desconto ou um prazo que a loja não pratica cria uma
 * promessa que alguém vai ter que honrar ou desdizer. O prompt proíbe, a tela
 * avisa que é rascunho, e nada é enviado sem alguém clicar.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { empresaId } = await zapintelEmpresa()

  const body = (await req.json().catch(() => ({}))) as { lead?: number }
  const id = Number(body.lead)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: 'lead invalido' }, { status: 400 })
  }

  const db = rastrDb()
  // A empresa vem da sessão, não do corpo: pedir a conversa de um lead de outra
  // empresa não encontra nada, porque a busca é feita dentro da sua.
  const { analisados, nomeDaLoja, segmentId } = await carregarConversas(db, empresaId, [id])
  const lead = analisados[0]
  if (!lead) return NextResponse.json({ erro: 'conversa nao encontrada' }, { status: 404 })

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

  const seg = getSegment(segmentId)
  const papel = getRole(segmentId)

  const system = [
    `Você escreve a próxima mensagem de WhatsApp para ${papel.toLowerCase()} de ${nomeDaLoja}.`,
    `Sobre o negócio: ${seg.followupContext}`,
    '',
    'REGRAS, todas obrigatórias:',
    '- Escreva em português brasileiro informal e caloroso, como gente de loja fala.',
    '- No máximo 2 frases. É mensagem de WhatsApp, não e-mail.',
    '- Trate a pessoa pelo primeiro nome.',
    '- NUNCA invente preço, desconto, parcela, prazo ou condição que não esteja',
    '  escrito no contexto. Prometer o que a loja não disse cria dívida que',
    '  alguém vai ter que honrar ou desdizer.',
    '- Não se desculpe pela demora mais de uma vez, e não use "prezado",',
    '  "venho por meio desta" nem emoji em excesso (no máximo um).',
    '- Responda SOMENTE com o texto da mensagem, sem aspas e sem explicação.',
  ].join('\n')

  const prompt = [
    'Esta conversa travou. Escreva a mensagem que retoma dali.',
    '',
    contextoDaSugestao(lead, travou),
  ].join('\n')

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

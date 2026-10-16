import { NextResponse } from 'next/server'
import { zapintelAcesso, lojaVisivel, leadDeFunilInterno, logFalhaFunilInterno, MENSAGEM_FALHA_FUNIL } from '@/lib/zapintel/ctx'
import { excedeuLimiteDoUsuario } from '@/lib/rate-limit'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'
import { montarFicha } from '@/lib/zapintel/ficha'
import { ondeTravou } from '@/lib/zapintel/travou'
import { gerarPerfil, guardarPerfil, lerPerfil, marcaDaConversa } from '@/lib/zapintel/perfil'

/**
 * A FICHA DO LEAD, ESCRITA POR IA.
 *
 * ══ POR QUE NO SERVIDOR ════════════════════════════════════════════════════
 *
 * Pelo mesmo motivo da sugestão: o prompt precisa saber de que empresa se
 * trata, e isso é fato do banco. O Copiloto monta o prompt NO NAVEGADOR, com
 * "Loja: JM Store, Mogi Guaçu SP. Vendedor: Pedro" escrito no código — quem
 * souber a URL escolhe o que a IA do CRM responde, pagando com a chave do
 * Lucas. Aqui a conversa é lida no servidor e o prompt nasce aqui.
 *
 * ══ LÊ-OU-GERA, NUNCA GERA-SEMPRE ══════════════════════════════════════════
 *
 * A mesma tela é aberta várias vezes por dia pela mesma pessoa, e a conversa
 * quase nunca mudou entre uma abertura e outra. Gerar de novo seria pagar
 * duas vezes pela mesma frase e deixar alguém olhando um spinner.
 *
 * `forcar: true` existe para o botão "refazer análise" — e é o único caminho
 * que ignora o que está guardado.
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

  // `?? {}`: o corpo pode ser o JSON literal `null`, e `null.lead` derrubava a
  // rota com 500. `forcar` só vale como booleano — a string "false" é verdadeira.
  const body = ((await req.json().catch(() => null)) ?? {}) as { lead?: unknown; forcar?: unknown }
  const id = Number(body.lead)
  const forcar = body.forcar === true
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ erro: 'lead invalido' }, { status: 400 })
  }

  const db = rastrDb()
  // A empresa vem da sessão, não do corpo: pedir a ficha de um lead de outra
  // empresa não encontra nada, porque a busca é feita dentro da sua.
  const { analisados, porId, nomeDaLoja, indisponivel } = await carregarConversas(db, empresaId, [id])
  const lead = analisados[0]
  const banco = porId.get(id)
  if (!lead || !banco || !lojaVisivel(acesso, banco.filial_id)) {
    return NextResponse.json({ erro: 'conversa nao encontrada' }, { status: 404 })
  }

  const marca = marcaDaConversa(lead)

  if (!forcar) {
    const guardado = await lerPerfil(db, empresaId, id, marca)
    if (guardado?.atual) {
      return NextResponse.json({ ...guardado, doCache: true })
    }
  }

  // Não deu para checar: bloqueia (503). Liberar seria gastar IA com conversa
  // da equipe justamente quando o banco está instável.
  let interno: boolean
  try { interno = await leadDeFunilInterno(db, empresaId, id) } catch (e) {
    logFalhaFunilInterno('perfil', empresaId, id, e)
    return NextResponse.json({ erro: MENSAGEM_FALHA_FUNIL }, { status: 503 })
  }
  if (interno) {
    return NextResponse.json({ erro: 'Conversa de funil interno (equipe ou candidatos) fica fora das análises do ZapIntel.' }, { status: 422 })
  }

  // Daqui para baixo é chamada PAGA ao provedor. Teto por pessoa: o robô gera
  // um lead por vez e "Refazer análise" ignora o guardado — sem teto, um laço
  // no console gastava a chave da empresa sem limite. 120/h cobre o robô
  // esvaziando a fila de um dia normal (~60) com folga.
  if (await excedeuLimiteDoUsuario(db, 'zapintel-perfil', userId, 120)) {
    return NextResponse.json({ erro: 'Muitas análises nesta hora. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  // Comprou? Vem da ponte, não de palavra na conversa. O prompt recebe os dois
  // lados — o registro e a conversa — e é instruído a dizer quando divergem,
  // em vez de escolher um e calar o outro.
  const { data: ponte, error: erroPonte } = await db
    .from('zapintel_venda_lead')
    .select('venda_id, dias_ate_venda')
    .eq('empresa_id', empresaId).eq('lead_id', id)
    .order('dias_ate_venda', { ascending: true })
    .limit(1).maybeSingle()

  // Falhou ao ler? O prompt recebe "informação indisponível", nunca o padrão
  // ("não há venda ligada"), que a IA leria como fato do CRM.
  const faltou = [...indisponivel]
  if (erroPonte) faltou.push('venda')
  let valorVenda: number | null = null
  if (ponte?.venda_id) {
    const { data: venda, error: erroVenda } = await db
      .from('vendas').select('valor_venda').eq('id', ponte.venda_id).maybeSingle()
    if (erroVenda) faltou.push('valor_venda')
    valorVenda = venda?.valor_venda != null ? Number(venda.valor_venda) : null
  }
  if (faltou.length) {
    console.error(JSON.stringify({ evento: 'zapintel.prompt.dado_indisponivel', rota: 'perfil', empresa_id: empresaId, lead_id: id, dados: faltou }))
  }

  const ficha = montarFicha(lead, {
    leadId: id,
    filialId: banco.filial_id,
    canal: banco.origem ?? 'whatsapp',
    comprou: !!ponte,
    valorVenda,
    diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
  })

  const r = await gerarPerfil({
    empresaId,
    lead,
    ficha,
    travou: ondeTravou(lead, !!ponte),
    nomeDaLoja,
    kanban: banco.kanban_status,
    temVendaRegistrada: !!ponte,
    valorVenda,
    diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
    indisponivel: faltou,
  })

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

  // O modelo que ESCREVEU, devolvido pela chamada — não o configurado, que
  // pode ter mudado entre um e outro.
  await guardarPerfil(db, empresaId, id, marca, r.perfil, r.modelo, r.ms)

  return NextResponse.json({
    perfil: r.perfil,
    geradoEm: new Date().toISOString(),
    modelo: r.modelo,
    atual: true,
    doCache: false,
  })
}

import type { Lead, RawMessage } from '@/types/zapintel'
import type { LeadBanco, MsgBanco } from '@/lib/zapintel/conversas'

/**
 * O LEAD, MONTADO DIRETO DAS TABELAS DO CRM.
 *
 * ══ O QUE ISTO SUBSTITUIU ══════════════════════════════════════════════════
 *
 * Até 10/10/2026 o caminho era este:
 *
 *     leads + lead_mensagens  →  vira CSV em texto  →  parseia o CSV  →  Lead
 *
 * Sobra da época em que o ZapIntel comia planilha exportada de conversa. Quando
 * ele passou a se alimentar do CRM, ninguém tirou o funil: o dado saía do banco
 * estruturado, virava texto e era re-parseado para virar estrutura de novo.
 *
 * ══ POR QUE ISSO NÃO ERA SÓ DESPERDÍCIO ════════════════════════════════════
 *
 * O CSV tinha COLUNAS FIXAS. Tudo que não coubesse nelas era estruturalmente
 * impossível de carregar — e a tabela `leads` tem 33 colunas, das quais o
 * ZapIntel lia 7. O que ficava de fora, e que ele então ADIVINHAVA:
 *
 *     origem ................. 2.072 leads   adivinhava o canal pelo telefone
 *     kanban_status .......... 2.072         inventava a própria classificação
 *     motivo_perda ............. 124         deduzia "lost" por palavra-chave (21)
 *     anuncio .................. 416         ignorava de onde o lead veio
 *     produto_interessado ...... 213         deduzia o produto do texto da loja
 *     responsavel_id ............ 89         deduzia o vendedor por "me chamo X"
 *     convertido_em .............. 12        ignorava
 *
 * E ainda custava CPU: montar e parsear 55 mil linhas era parte dos 2,76 s por
 * recálculo que o dia inteiro foi gasto economizando.
 *
 * ══ UMA ARMADILHA MULTI-TENANT QUE MORREU JUNTO ════════════════════════════
 *
 * O parser decidia quem era a loja comparando o telefone com
 * `STORE_PHONE = "5519998862028"` — o número da JM, escrito no código. Para a
 * Imobiliária ou para qualquer tenant novo, NENHUMA mensagem seria reconhecida
 * como da loja, e toda métrica de atendimento sairia zerada em silêncio.
 * Aqui quem diz é `lead_mensagens.direcao`, que o banco grava por tenant.
 */

const DIA_MS = 86_400_000

/*
 * O MOTOR DE AGOSTO SAIU DAQUI EM 15/10/2026: sinais e objeções por palavra
 * ("nf" casava com "co-NF-irma"), classificação, score, perfil, próxima ação e
 * o vendedor deduzido do texto ("Pedroe", "hoje"). O que o lead É agora vem da
 * análise de IA (`perfil.ts`); daqui sai só o que a conversa mede: quantas
 * mensagens, de quem, quando. O vendedor é o responsável do CRM — fato — ou
 * nenhum.
 */


/**
 * O RELÓGIO DA LOJA — e por que isto não podia ficar como estava.
 *
 * ══ O BUG, MEDIDO EM 12/10/2026 ════════════════════════════════════════════
 *
 * `hora()` fazia `new Date(iso).getHours()`, que devolve a hora no fuso do
 * PROCESSO. Na máquina do Lucas isso é São Paulo e sai certo; nas funções da
 * Vercel é **UTC**, e sai três horas adiantado. Como o painel é calculado lá e
 * guardado, a tela mostrava o relógio errado para todo mundo:
 *
 *     pico real (no banco, fuso de SP) ....... 11h (3.499 mensagens)
 *     pico que o painel guardou .............. 14h (3.235)
 *
 * E não parava no gráfico: a hora de cada mensagem no histórico da conversa
 * aparecia adiantada, e `dia()` — que era `iso.slice(0, 10)`, a data em UTC —
 * jogava tudo que a loja falou depois das 21h para o dia seguinte.
 *
 * O defeito era invisível justamente onde se desenvolve: rodar local dava o
 * número certo. É o mesmo formato das duas falhas mudas que este módulo já
 * teve (análise truncada, canal de tempo real sem linha).
 *
 * ══ POR QUE UM FUSO FIXO, E NÃO UM POR EMPRESA ═════════════════════════════
 *
 * Porque não existe campo de fuso em `empresas`, e inventar um agora seria
 * coluna sem quem a preencha. Os três tenants são do Brasil e o país não tem
 * horário de verão desde 2019, então Brasília está certo para todos hoje. No
 * dia em que entrar tenant de outro fuso, o lugar de consertar é aqui — uma
 * linha — e não espalhado por quem formata data.
 */
const FUSO_DA_LOJA = 'America/Sao_Paulo'

/**
 * `sv-SE` porque é o locale que formata como `YYYY-MM-DD HH:MM` — o mesmo
 * formato que as telas e a ficha já esperam. `h23` para meia-noite sair como
 * `00` e não `24`.
 */
const RELOGIO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO_DA_LOJA,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** `YYYY-MM-DD` e `HH:MM` no fuso da loja, numa formatação só. */
const dataEHora = (iso: string): [string, string] => {
  const s = RELOGIO.format(new Date(iso))
  return [s.slice(0, 10), s.slice(11, 16)]
}

/**
 * Dias de CALENDÁRIO, no fuso da loja, entre a mensagem e hoje. Era em blocos
 * de 24 h, e a ficha dizia "última mensagem: hoje" para quem falou às 18h34
 * de ontem (lead 5784, 15/10).
 */
const diasAte = (iso: string | null): number => {
  if (!iso || Number.isNaN(Date.parse(iso))) return 999
  const dia = (d: Date) => Date.parse(`${RELOGIO.format(d).slice(0, 10)}T12:00:00Z`)
  return Math.max(0, Math.round((dia(new Date()) - dia(new Date(iso))) / DIA_MS))
}

/**
 * Monta os leads analisados a partir das linhas do banco.
 *
 * `msgs` precisa vir em ordem cronológica — `carregarConversas` garante isso
 * ordenando em memória depois de ler por `id` (a paginação paralela exige
 * ordem total, e `created_at` empata porque o webhook grava em lote).
 */
export function montarLeads(porId: Map<number, LeadBanco>, msgs: MsgBanco[]): Lead[] {
  const porLead = new Map<number, RawMessage[]>()

  for (const m of msgs) {
    const banco = porId.get(m.lead_id)
    if (!banco) continue
    const lista = porLead.get(m.lead_id) ?? []
    const [dataMsg, horaMsg] = dataEHora(m.created_at)
    lista.push({
      date: dataMsg,
      time: horaMsg,
      // O telefone na mensagem serve só para exibição; quem decide o lado é
      // `direcao`. Ver a armadilha multi-tenant no cabeçalho.
      phone: banco.telefone ?? banco.origem_id ?? '',
      name: m.direcao === 'enviada' ? 'Loja' : (banco.nome ?? ''),
      /**
       * ÁUDIO TRANSCRITO ENTRA COMO FALA.
       *
       * Medido em 13/10/2026: **35% do que a loja fala é áudio** (10.201 de
       * 29.135 mensagens enviadas) e 9,4% do que o cliente fala. Enquanto o
       * `conteudo` era só `[audio]`, todo motor daqui media dois terços da
       * conversa e apresentava o resultado como se fosse a conversa inteira:
       *
       *   · `perguntasDaLoja` conta "?" no texto — áudio nunca teve "?"
       *   · a frase antes do silêncio descartava áudio de propósito
       *   · `ultimaOferta` procura R$ — oferta falada não entrava
       *   · o vendedor virava "Loja" se ele se apresentou falando
       *   · as objeções do cliente perdiam 9,4% das falas dele
       *
       * O marcador `[audio]` fica como `mediaType`, então quem precisa saber
       * que a mensagem foi falada continua sabendo. O que muda é que agora há
       * texto para ler.
       */
      body: (m.transcricao?.trim() || m.conteudo) ?? '',
      // A tela precisa distinguir o que foi falado do que foi digitado; os
      // motores, não. Ver `RawMessage.transcrito`.
      transcrito: !!m.transcricao?.trim(),
      mediaType: m.tipo && m.tipo !== 'texto' ? m.tipo : '',
      mediaCaption: '',
      quotedMessage: '',
      isStore: m.direcao === 'enviada',
    })
    porLead.set(m.lead_id, lista)
  }

  const fora: Lead[] = []

  for (const [leadId, mensagens] of porLead) {
    const banco = porId.get(leadId)!
    const doLead = mensagens.filter((m) => !m.isStore)
    const daLoja = mensagens.filter((m) => m.isStore)

    const primeira = mensagens[0]
    const ultima = mensagens[mensagens.length - 1]
    const firstDate = primeira?.date ?? ''
    const lastDate = ultima?.date ?? ''

    const daysInactive = diasAte(banco.ultima_mensagem_at ?? null)
    const conversationDays = firstDate && lastDate
      ? Math.max(0, Math.round((Date.parse(`${lastDate}T12:00:00`) - Date.parse(`${firstDate}T12:00:00`)) / DIA_MS))
      : 0


    const contact = banco.nome || banco.telefone || banco.origem_id || `Lead ${leadId}`

    fora.push({
      // O id É o id do CRM. Antes era um contador do parser (`lead-0`,
      // `lead-1`…), então a URL da tela do lead não tinha relação com o lead
      // do CRM — e `idDoLead` precisava decodificar o `filename` para achar.
      id: `lead-${leadId}`,
      filename: `lead-${leadId}`,
      contact,
      phone: banco.telefone ?? banco.origem_id ?? '',
      sellerName: banco.responsavel_nome ?? null,
      messages: mensagens,
      daysInactive,
      conversationDays,
      firstDate,
      lastDate,
      totalMessages: mensagens.length,
      leadMessages: doLead.length,
      storeMessages: daLoja.length,
      _channel: banco.origem === 'instagram' ? 'instagram' : 'whatsapp',
      crm: {
        leadId,
        filialId: banco.filial_id,
        canal: banco.origem ?? 'whatsapp',
        kanbanStatus: banco.kanban_status ?? null,
        motivoPerda: banco.motivo_perda ?? null,
        perdidoEm: banco.perdido_em ?? null,
        produtoInteressado: banco.produto_interessado ?? null,
        responsavelId: banco.responsavel_id ?? null,
        convertidoEm: banco.convertido_em ?? null,
        anuncio: (banco.anuncio as Record<string, unknown> | null) ?? null,
        criadoEm: banco.created_at,
      },
    })
  }

  return fora
}

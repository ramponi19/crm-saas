import type { Painel } from '@/lib/zapintel/painel'

/**
 * O PARÁGRAFO DO DIA — o painel contado em português, não em cartões.
 *
 * ══ DE ONDE VEIO ESTA IDEIA ════════════════════════════════════════════════
 *
 * Do Lucas, em 12/10/2026, depois de olhar a tela reconstruída: *"construiu
 * construiu construiu mas olho a mesma coisa"*. Cinco dias de trabalho tinham
 * ido para a fundação — ponte venda↔conversa, motores lendo o CRM direto, três
 * tickets inventados mortos — e a home continuava a mesma fileira de cartões.
 *
 * Um cartão escrito "2.108 conversas" não diz a ninguém o que fazer hoje. Esta
 * é a parte em que a IA ganha da regra escrita à mão: ligar oito fatos numa
 * frase que uma pessoa lê em cinco segundos.
 *
 * ══ A REGRA QUE SEGURA ISTO DE PÉ ══════════════════════════════════════════
 *
 * **A IA não vê a conversa, não vê o banco e não calcula nada.** Ela recebe os
 * números já calculados por `montarPainel` e tem uma tarefa só: escrevê-los em
 * frase. É o contrário de pedir análise — é pedir redação.
 *
 * Isso não é timidez: é o que torna o texto conferível. Todo número que
 * aparecer no parágrafo está no briefing, e o briefing sai do mesmo cálculo
 * que alimenta a tela. Se a IA inventar, dá para apontar o dedo — e o prompt
 * proíbe explicitamente, porque modelo que "ajuda" preenchendo lacuna é
 * exatamente o que produziu os R$ 1,2 milhão de pipeline que passamos a semana
 * removendo.
 *
 * ══ POR QUE SAI CARO SE FOR FEITO ERRADO ═══════════════════════════════════
 *
 * Se isto rodasse a cada abertura de tela, seria uma chamada de IA por
 * visita — e o Gemini free tier não publica mais o teto (medido em 12/10:
 * a tabela saiu do ar e a página manda olhar a conta). Por isso o texto é
 * guardado em `zapintel_painel.relato` e só é refeito quando o painel muda.
 */

const naoZero = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const tempo = (min: number): string =>
  min < 60 ? `${Math.round(min)} min` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)} dias`

/**
 * Os FATOS do dia, em texto compacto. É tudo que a IA recebe.
 *
 * Só entra linha cujo número existe: briefing com "objeção mais comum:
 * nenhuma" ensina o modelo a escrever sobre o nada, e ele escreve.
 */
export function briefingDoDia(p: Painel): string {
  const g = p.agregados.geral
  if (!g) return ''

  const s = g.stats
  const perf = g.performance
  const leads = p.leads

  // ── O que está esperando AGORA ──────────────────────────────────────────
  const esperando = leads.filter((l) => l.aguardandoLoja && !l.fantasma)
  const esperandoMuito = esperando.filter((l) => l.daysInactive >= 2)
  const quentesEsperando = esperando.filter((l) => l.classification === 'hot')

  const linhas: string[] = []

  linhas.push(`Loja: ${p.empresaNome}`)
  if (p.lojas.length > 1) {
    linhas.push(`Unidades: ${p.lojas.filter((x) => x.id != null).map((x) => `${x.nome} (${x.leads})`).join(', ')}`)
  }
  linhas.push(`Conversas na base: ${s.total}. Dessas, ${s.hot} quentes e ${s.warm} mornas.`)

  if (esperando.length) {
    linhas.push(`Esperando resposta da loja AGORA: ${esperando.length}` +
      (esperandoMuito.length ? `, sendo ${esperandoMuito.length} há 2 dias ou mais` : '') +
      (quentesEsperando.length ? ` e ${quentesEsperando.length} classificadas como quentes` : '') + '.')
  }

  if (naoZero(s.avgDaysInactive)) {
    linhas.push(`Inatividade média: ${s.avgDaysInactive} dias.`)
  }
  if (naoZero(perf.avgSpeedToLead)) {
    linhas.push(`Tempo médio até a primeira resposta: ${tempo(perf.avgSpeedToLead)}. ` +
      `${perf.pctRespondedUnder5min}% das conversas foram atendidas em menos de 5 minutos.`)
  }

  // ── O que foi vendido, medido contra o CRM ──────────────────────────────
  if (naoZero(s.ticketMedido) && s.vendasNaConta > 0) {
    linhas.push(`Ticket médio REAL: ${dinheiro(s.ticketMedido)}, medido em ${s.vendasNaConta} vendas do CRM.`)
  }
  if (s.compradoresComprovados > 0) {
    linhas.push(`Conversas que viraram venda comprovada: ${s.compradoresComprovados} (${s.conversionRate}%).`)
  }
  if (naoZero(s.pipelineValue)) {
    linhas.push(`Pipeline estimado pelas taxas medidas: ${dinheiro(s.pipelineValue)}.`)
  }

  // ── Onde trava ──────────────────────────────────────────────────────────
  if (s.topObjections.length) {
    linhas.push(`Objeções mais frequentes: ${s.topObjections.slice(0, 3).map((o) => `${o.label} (${o.count})`).join(', ')}.`)
  }
  if (naoZero(s.mostExpensiveObjection?.leads)) {
    linhas.push(`A objeção que mais trava negócio é "${s.mostExpensiveObjection.label}", em ${s.mostExpensiveObjection.leads} conversas.`)
  }
  if (s.topModels.length) {
    linhas.push(`Mais pedidos: ${s.topModels.slice(0, 3).map((m) => `${m.model} (${m.count})`).join(', ')}.`)
  }
  if (s.peakHours.length) {
    /**
     * ⚠ `peakHours` é um HISTOGRAMA, ordenado por hora — não um ranking.
     * `peakHours[0]` é a hora mais cedo do dia, não a mais movimentada. Peguei
     * essa armadilha na primeira execução: o briefing dizia "pico às 00h"
     * numa loja cujo pico medido no banco é 9h.
     */
    const pico = [...s.peakHours].sort((a, b) => b.count - a.count)[0]
    linhas.push(`Horário de pico das conversas: ${pico.hour}.`)
  }

  // ── O que a loja deixou na mesa ─────────────────────────────────────────
  if (p.semConversa > 0) {
    linhas.push(`Leads ativos sem nenhuma mensagem: ${p.semConversa}.`)
  }
  if (naoZero(s.referralCount)) {
    linhas.push(`Chegaram por indicação: ${s.referralCount}.`)
  }
  if (g.silencio.length) {
    const top = g.silencio[0]
    /**
     * ⚠ "PRECEDEU" NÃO É "CAUSOU", E A FRASE PRECISA DIZER ISSO.
     *
     * Medido em produção em 13/10/2026: com a linha escrita sem a ressalva, a
     * IA fechou o parágrafo com *"Oriente a equipe a trocar a frase 'O que
     * você acha?'"* — virou ordem o que é só correlação. A própria tela avisa,
     * logo abaixo do ranking: "indica onde olhar, não o que culpar".
     *
     * É exatamente o erro que esta reconstrução passou a semana removendo. Se
     * o briefing não marca a diferença, o modelo não inventa a cautela.
     */
    linhas.push(`A frase da loja que mais apareceu ANTES de o cliente sumir: "${top.frase}"`
      + ` (${top.vezes} conversas). Isso é correlação, não causa — não recomende trocá-la.`)
  }

  return linhas.join('\n')
}

/**
 * A instrução. Curta de propósito: prompt longo faz o modelo escrever longo.
 *
 * O `papel` sai do segmento da empresa, não está escrito aqui — a Imobiliária
 * não tem "vendedor de iPhone". Ver a armadilha documentada em
 * `app/zapintel/api/sugestao/route.ts`.
 */
export function systemDoDia(papel: string, ramo: string): string {
  return [
    `Você escreve o resumo diário para o dono de um negócio: ${ramo}`,
    `Quem atende lá é ${papel.toLowerCase()}.`,
    '',
    'REGRAS, todas obrigatórias:',
    '- No máximo 4 frases curtas. Vai ser lido em pé, antes de abrir a loja.',
    '- Português brasileiro direto. Nada de "insights", "performance",',
    '  "otimizar" nem jargão de consultoria.',
    '- Comece pelo que exige ação hoje, não pelo total de conversas.',
    '- USE SOMENTE os números do briefing. Não some, não calcule média, não',
    '  estime e não arredonde para um número que não está escrito lá. Se um',
    '  dado não estiver no briefing, ele não existe.',
    '- Não dê bronca nem elogie. Diga o que está acontecendo e o que fazer.',
    '- Não transforme correlação em ordem. Se o briefing diz que algo apenas',
    '  APARECEU ANTES de um resultado, não mande mudar esse algo.',
    '- Responda só com o texto, sem título, sem lista e sem markdown.',
  ].join('\n')
}

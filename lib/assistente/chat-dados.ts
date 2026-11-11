import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mensagemDoProvedor } from '@/lib/assistente-erros'
import type { Acesso } from './acesso'
import { negocioDoPreset } from './negocio'
import { executar, FERRAMENTAS, ROTULO, type Recorte } from './ferramentas'
import { AVISO_SEM_CONSULTA, avisoSemFundamento, numerosAfirmados, semFundamento, semNumeros, trocarTrechos } from './numeros'
import { formatarNoFuso } from '@/lib/datas'

/**
 * O ASSISTENTE QUE LÊ O SISTEMA.
 *
 * Pedido do Lucas em 14/10/2026: *"achei que seria um chat, inclusive consigo
 * solicitar nesse chat com o robo um pedido de relatorio, analise, e etc...
 * respostas dentro do sistema"*. Decidido com ele: um chat só para o CRM e o
 * ZapIntel, respondido pela Anthropic em plano pago — o Gemini gratuito pode
 * usar o conteúdo para treino, e aqui o conteúdo é conversa de cliente.
 *
 * ══ O PROTOCOLO COM A TELA ═════════════════════════════════════════════════
 *
 * Uma linha JSON por evento (NDJSON), na ordem em que acontecem:
 *
 *   {"t":"txt","v":"…"}       pedaço da resposta, para ir aparecendo
 *   {"t":"tool","v":"…"}      o assistente foi consultar algo ("Consultando vendas")
 *   {"t":"erro","v":"…"}      falhou — a frase já é para o usuário
 *   {"t":"troca","v":"…"}     o texto inteiro da resposta até aqui passa a ser este (saiu número sem fundamento)
 *
 * Texto puro (o formato antigo do Gemini) não serve: a tela precisa saber a
 * diferença entre resposta e "estou consultando", ou o usuário fica olhando
 * uma bolha vazia por 6 segundos sem saber se travou.
 *
 * ══ O QUE CUSTA, E OS TETOS ════════════════════════════════════════════════
 *
 * Cada pergunta é UMA ou mais chamadas (uma a mais por rodada de consulta).
 * O prompt e as ferramentas vão com cache — da segunda rodada em diante a
 * Anthropic cobra ~10% por essa parte. `MAX_RODADAS` corta pergunta que vire
 * uma investigação sem fim; o resultado de cada ferramenta tem teto de
 * tamanho em `ferramentas.ts`.
 */

const MAX_RODADAS = 8

/**
 * O modelo do chat. Se o superadmin escolheu um `claude-` em
 * `/superadmin/assistente`, vale esse; senão, Sonnet 5.5 — bom em consulta e
 * análise, a uma fração do Opus. O padrão do resto do CRM ainda é Gemini, e
 * mandar um nome do Google para a Anthropic seria erro na certa.
 */
export const MODELO_CHAT_PADRAO = 'claude-sonnet-5-5'

export interface Turno { role: 'user' | 'model'; text: string }

function instrucoes(o: {
  empresa: string; preset: string | null; acesso: Acesso; lojas: string[]; tela: string | null; extra: string | null; fuso: string
  recorte: string
}): string {
  // "Agora" no relógio DA LOJA: é o que o assistente usa para "hoje", "ontem" e "este mês".
  const agora = formatarNoFuso(new Date(), {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }, '', o.fuso)
  const limites = [
    o.acesso.soMinhasVendas && 'só vê as próprias vendas',
    o.acesso.soMeusLeads && 'só vê os próprios leads e os sem responsável',
    !o.acesso.verFinanceiro && 'não vê custo, lucro nem margem',
  ].filter(Boolean)

  return `Você é o assistente do Nexus CRM da empresa "${o.empresa}", uma ${negocioDoPreset(o.preset) ?? 'pequena empresa'}.
Agora é ${agora} (horário de Brasília).
Quem está perguntando: ${o.acesso.nome} (papel: ${o.acesso.papel || 'não identificado'}).
Lojas que essa pessoa pode ver: ${o.lojas.length ? o.lojas.join(', ') : 'uma loja'}.
Recorte escolhido na tela: ${o.recorte}. Sem loja pedida na pergunta, as ferramentas já usam esse recorte.
${limites.length ? `Permissões: esta pessoa ${limites.join('; ')}. As ferramentas já aplicam isso — se pedirem algo fora disso, explique que é uma permissão definida pelo dono no CRM.` : 'Permissões: vê tudo da empresa.'}
${o.tela ? `Tela aberta agora: ${o.tela}.` : ''}

O QUE VOCÊ FAZ
1. RELATÓRIOS E ANÁLISES COM OS DADOS DO SISTEMA — use as ferramentas para consultar vendas, leads, conversas e as análises de IA dos leads. Se a ferramenta não tem o dado, diga isso.
2. AJUDA DE USO — onde fica cada tela e como fazer as tarefas no CRM.
3. TEXTOS — rascunho de mensagem para cliente, post, descrição de produto. O usuário copia e envia; você NUNCA envia nada nem altera nada no sistema. Não ofereça fazer isso.

NÚMERO SÓ DE CONSULTA (regra dura)
- Contagem, valor ou percentual só aparecem na resposta se uma ferramenta foi chamada NESTA resposta e trouxe esse número (ou ele sai de conta direta sobre números dela, como um percentual de dois totais que ela trouxe).
- Número de uma resposta anterior não vale: consulte de novo. Sem consulta, responda sem números.
- Nunca estime nem arredonde para "cerca de" um número que não consultou.

COMO RESPONDER
- A PRIMEIRA LINHA de toda resposta é o recorte usado, em negrito: **<recorte> · <período>** — ex.: **Rede JM · últimos 30 dias**, **Mogi Guaçu · 01/11 a 10/11**. O recorte é o campo \`recorte\` da ferramenta (se consultou mais de uma loja, junte: **Mogi Guaçu e Jaguariúna · …**); sem consulta (ajuda de uso, texto), use **${o.recorte}**. O período é o que a consulta usou; sem período, escreva "agora".
- Se a ferramenta disser que a loja está fora do alcance ou fora da loja selecionada, diga isso ao usuário com essas palavras — não procure em outra loja no lugar.
- Português do Brasil, direto. Depois da linha do recorte, a resposta; o detalhe vem depois.
- Use **negrito** para o essencial e listas curtas. Tabela só com poucas colunas.
- Ao citar um lead, escreva o link no formato [Nome do lead](lead:ID) — a tela transforma em link para abrir o lead.
- Datas sem ano ambíguo: "13/10", "ontem (13/10)".
- Ao analisar uma conversa, separe o que está escrito do que você deduz.
- Não repita telefone, CPF, endereço ou senha que aparecer em conversa, a menos que o usuário peça exatamente isso.
- Se a pergunta for ambígua quanto a período ("as vendas"), assuma o mês corrente e diga que assumiu.
- Mensagem sugerida a cliente não promete preço, prazo ou condição que a loja não ofereceu na conversa: use [valor] quando não souber.${o.extra ? `\n\n${o.extra}` : ''}`
}

export function respostaDoChat(o: {
  db: SupabaseClient
  svc: SupabaseClient
  /** Leitura do recorte (service role no ZapIntel, depois de `zapintel_escopo`). Ausente = `db`. */
  ler?: SupabaseClient
  /** O recorte decidido no servidor (`recorte.ts`). */
  recorte?: Recorte
  /** Para os testes: um cliente falso no lugar da Anthropic. */
  cliente?: Pick<Anthropic, 'messages'>
  /** Para os testes: as ferramentas no lugar do banco. */
  executor?: typeof executar
  acesso: Acesso
  turnos: Turno[]
  modelo: string
  empresa: string
  preset: string | null
  lojas: string[]
  tela: string | null
  extra: string | null
  /** Fuso da empresa (lib/fuso-empresa). */
  fuso: string
  /** Registro de uso (tokens) para o painel do superadmin. */
  registrar: (tokensIn: number, tokensOut: number) => Promise<void>
}): Response {
  const client = o.cliente ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 })
  const enc = new TextEncoder()

  // O prompt e as ferramentas são iguais em toda rodada da mesma pergunta —
  // e entre perguntas da mesma pessoa. Cache neles.
  const system: Anthropic.TextBlockParam[] = [{
    type: 'text',
    text: instrucoes({
      empresa: o.empresa, preset: o.preset, acesso: o.acesso, lojas: o.lojas, tela: o.tela, extra: o.extra, fuso: o.fuso,
      recorte: o.recorte?.rotulo ?? (o.lojas.length === 1 ? o.lojas[0] : 'todas as lojas que a pessoa vê'),
    }),
    cache_control: { type: 'ephemeral' },
  }]
  const tools: Anthropic.Tool[] = FERRAMENTAS.map((t, i) =>
    i === FERRAMENTAS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)

  const messages: Anthropic.MessageParam[] = o.turnos.map((t) => ({
    role: t.role === 'model' ? 'assistant' : 'user',
    content: t.text,
  }))

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (t: string, v: string) => controller.enqueue(enc.encode(JSON.stringify({ t, v }) + '\n'))
      /** Tudo o que já foi para a tela nesta resposta — `troca` reescreve a partir daqui. */
      let mostrado = ''
      const enviarTxt = (v: string) => { mostrado += v; enviar('txt', v) }
      const trocar = (v: string) => { mostrado = v; enviar('troca', v) }
      let tokIn = 0, tokOut = 0
      /**
       * NÚMERO SÓ DE CONSULTA E COM FUNDAMENTO (`numeros.ts`).
       *
       * Sem consulta: enquanto nenhuma ferramenta foi chamada nesta resposta, o
       * texto fica SEGURO aqui, sem ir para a tela. Se a rodada chama ferramenta,
       * o texto (o "vou consultar…") sai e o resto corre ao vivo.
       *
       * Com consulta: a resposta final corre ao vivo e, no fim, cada contagem,
       * valor ou percentual é conferido contra os resultados das ferramentas
       * DESTA resposta (ou soma direta deles). Faltou fundamento: a resposta sai
       * da tela (`troca`) e o modelo é mandado corrigir, uma vez; se insistir, o
       * número fica como "[número não consultado]".
       */
      let consultou = false
      let correcoes = 0
      /** Os resultados das ferramentas desta resposta: o fundamento dos números. */
      const fundamento: string[] = []
      try {
        for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
          const s = client.messages.stream({
            model: o.modelo,
            max_tokens: 8_000,
            system,
            tools,
            messages,
            output_config: { effort: 'medium' },
          })
          const segurar = !consultou
          const antes = mostrado
          let daRodada = ''
          s.on('text', (delta) => { daRodada += delta; if (!segurar) enviarTxt(delta) })
          const msg = await s.finalMessage()
          const u = msg.usage
          tokIn += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          tokOut += u.output_tokens ?? 0

          if (msg.stop_reason === 'refusal') { enviar('erro', 'Não consigo ajudar com esse pedido.'); break }
          const usos = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          if (msg.stop_reason !== 'tool_use' || !usos.length) {
            const sem = consultou ? semFundamento(daRodada, fundamento) : numerosAfirmados(daRodada)
            if (sem.length && correcoes < 1 && rodada < MAX_RODADAS - 1) {
              correcoes++
              console.error(`[assistente] número ${consultou ? 'sem fundamento' : 'sem consulta'}, pedindo correção:`, sem.slice(0, 5).join(' | '))
              if (!segurar) trocar(antes)
              messages.push({ role: 'assistant', content: msg.content })
              messages.push({ role: 'user', content: consultou ? avisoSemFundamento(sem) : AVISO_SEM_CONSULTA })
              continue
            }
            if (sem.length) {
              const limpo = consultou ? trocarTrechos(daRodada, sem) : semNumeros(daRodada)
              if (segurar) enviarTxt(limpo); else trocar(antes + limpo)
            } else if (segurar && daRodada) enviarTxt(daRodada)
            if (msg.stop_reason === 'max_tokens') enviarTxt('\n\n_(resposta cortada por tamanho — peça a continuação)_')
            break
          }
          if (segurar && daRodada) enviarTxt(daRodada)
          consultou = true

          // O conteúdo inteiro volta, inclusive o pensamento: a Anthropic exige
          // os blocos de raciocínio intactos entre uma consulta e a resposta.
          messages.push({ role: 'assistant', content: msg.content })
          const resultados: Anthropic.ToolResultBlockParam[] = []
          for (const uso of usos) {
            enviar('tool', ROTULO[uso.name] ?? 'Consultando o sistema')
            // A tela separa o texto de antes da consulta com uma linha em branco; o `mostrado` acompanha.
            if (mostrado && !mostrado.endsWith('\n')) mostrado += '\n\n'
            let conteudo: string
            try {
              conteudo = await (o.executor ?? executar)({ db: o.db, svc: o.svc, ler: o.ler, recorte: o.recorte, acesso: o.acesso, fuso: o.fuso }, uso.name, uso.input)
            } catch (e) {
              console.error(`[assistente] ferramenta ${uso.name} falhou:`, e)
              conteudo = JSON.stringify({ erro: 'a consulta falhou; diga ao usuário que não foi possível ler esse dado agora' })
            }
            resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: conteudo })
            fundamento.push(conteudo)
          }
          messages.push({ role: 'user', content: resultados })
          if (rodada === MAX_RODADAS - 1) enviarTxt('\n\n_(parei de consultar para não gastar demais — refine a pergunta)_')
        }
      } catch (e) {
        if (e instanceof Anthropic.APIError) {
          console.error('[assistente] provedor recusou:', e.status, o.modelo, e.message)
          enviar('erro', mensagemDoProvedor(e.status ?? 500, e.message))
        } else {
          console.error('[assistente]', e)
          enviar('erro', 'O assistente está indisponível agora. Tente de novo em alguns minutos.')
        }
      } finally {
        await o.registrar(tokIn, tokOut).catch(() => {})
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

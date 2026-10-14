import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mensagemDoProvedor } from '@/lib/assistente-erros'
import type { Acesso } from './acesso'
import { executar, FERRAMENTAS, ROTULO } from './ferramentas'

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

const SEGMENTO: Record<string, string> = {
  varejo: 'loja de varejo/celulares (PDV, estoque, produtos, garantia, assistência, orçamentos)',
  assistencia: 'assistência técnica (ordens de serviço, garantia, orçamentos)',
  servicos: 'prestador de serviços',
  imobiliaria: 'imobiliária (imóveis, proprietários, chaves, visitas na Agenda)',
  saude: 'clínica/saúde (agendamento de consultas na Agenda)',
  food: 'restaurante/food (cardápio, cozinha/KDS)',
  concessionaria: 'loja de veículos (avaliações, consulta FIPE, financiamento)',
}

function instrucoes(o: {
  empresa: string; segmento: string | null; acesso: Acesso; lojas: string[]; tela: string | null; extra: string | null
}): string {
  const agora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date())
  const limites = [
    o.acesso.soMinhasVendas && 'só vê as próprias vendas',
    o.acesso.soMeusLeads && 'só vê os próprios leads e os sem responsável',
    !o.acesso.verFinanceiro && 'não vê custo, lucro nem margem',
  ].filter(Boolean)

  return `Você é o assistente do Nexus CRM da empresa "${o.empresa}", uma ${SEGMENTO[o.segmento ?? ''] ?? 'pequena empresa'}.
Agora é ${agora} (horário de Brasília).
Quem está perguntando: ${o.acesso.nome} (papel: ${o.acesso.papel || 'não identificado'}).
Lojas que essa pessoa enxerga: ${o.lojas.length ? o.lojas.join(', ') : 'uma loja'}.
${limites.length ? `Permissões: esta pessoa ${limites.join('; ')}. As ferramentas já aplicam isso — se pedirem algo fora disso, explique que é uma permissão definida pelo dono no CRM.` : 'Permissões: vê tudo da empresa.'}
${o.tela ? `Tela aberta agora: ${o.tela}.` : ''}

O QUE VOCÊ FAZ
1. RELATÓRIOS E ANÁLISES COM OS DADOS DO SISTEMA — use as ferramentas para consultar vendas, leads, conversas e as análises de IA dos leads. Nunca invente número: todo número da resposta vem de uma ferramenta. Se a ferramenta não tem o dado, diga isso.
2. AJUDA DE USO — onde fica cada tela e como fazer as tarefas no CRM.
3. TEXTOS — rascunho de mensagem para cliente, post, descrição de produto. O usuário copia e envia; você NUNCA envia nada nem altera nada no sistema. Não ofereça fazer isso.

COMO RESPONDER
- Português do Brasil, direto. Comece pela resposta; o detalhe vem depois.
- Use **negrito** para o essencial e listas curtas. Tabela só com poucas colunas.
- Sempre diga o período e a loja a que os números se referem.
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
  acesso: Acesso
  turnos: Turno[]
  modelo: string
  empresa: string
  segmento: string | null
  lojas: string[]
  tela: string | null
  extra: string | null
  /** Registro de uso (tokens) para o painel do superadmin. */
  registrar: (tokensIn: number, tokensOut: number) => Promise<void>
}): Response {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 })
  const enc = new TextEncoder()

  // O prompt e as ferramentas são iguais em toda rodada da mesma pergunta —
  // e entre perguntas da mesma pessoa. Cache neles.
  const system: Anthropic.TextBlockParam[] = [{
    type: 'text',
    text: instrucoes({ empresa: o.empresa, segmento: o.segmento, acesso: o.acesso, lojas: o.lojas, tela: o.tela, extra: o.extra }),
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
      let tokIn = 0, tokOut = 0
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
          s.on('text', (delta) => enviar('txt', delta))
          const msg = await s.finalMessage()
          const u = msg.usage
          tokIn += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          tokOut += u.output_tokens ?? 0

          if (msg.stop_reason === 'refusal') { enviar('erro', 'Não consigo ajudar com esse pedido.'); break }
          const usos = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          if (msg.stop_reason !== 'tool_use' || !usos.length) {
            if (msg.stop_reason === 'max_tokens') enviar('txt', '\n\n_(resposta cortada por tamanho — peça a continuação)_')
            break
          }

          // O conteúdo inteiro volta, inclusive o pensamento: a Anthropic exige
          // os blocos de raciocínio intactos entre uma consulta e a resposta.
          messages.push({ role: 'assistant', content: msg.content })
          const resultados: Anthropic.ToolResultBlockParam[] = []
          for (const uso of usos) {
            enviar('tool', ROTULO[uso.name] ?? 'Consultando o sistema')
            let conteudo: string
            try {
              conteudo = await executar({ db: o.db, svc: o.svc, acesso: o.acesso }, uso.name, uso.input)
            } catch (e) {
              console.error(`[assistente] ferramenta ${uso.name} falhou:`, e)
              conteudo = JSON.stringify({ erro: 'a consulta falhou; diga ao usuário que não foi possível ler esse dado agora' })
            }
            resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: conteudo })
          }
          messages.push({ role: 'user', content: resultados })
          if (rodada === MAX_RODADAS - 1) enviar('txt', '\n\n_(parei de consultar para não gastar demais — refine a pergunta)_')
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

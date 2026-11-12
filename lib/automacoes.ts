import type { SupabaseClient } from '@supabase/supabase-js'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { cabecalhosEdgeInterna, urlEdgeWebhook } from '@/lib/edge-interna'
import { recusadaPelaMeta } from '@/lib/canais/falha-meta'
import { aprovadoNaLoja } from '@/lib/canais/modelos-waba'
import { moduloEstaLigado } from '@/lib/modulo-ligado'
import {
  agendarPara, horarioValido, modeloRecente, proximoHorario, tetoAtingido, type Horario,
} from '@/lib/automatize/travas'

/**
 * MOTOR DE AUTOMAÇÕES DE ETAPA — o do Automatize (04/11/2026).
 *
 * Até aqui a entrada na etapa executava a ação na hora e só criava TAREFA. Agora:
 *  1. entrar na etapa AGENDA uma linha em `automacao_execucoes` por automação ligada
 *     (agendada_para = agora + espera_dias); as de espera 0 já rodam aqui mesmo;
 *  2. o resto roda pelo cron de hora em hora (/api/cron/automacoes → processarFila),
 *     que reserva um lote com FOR UPDATE SKIP LOCKED — rodar duas vezes não executa
 *     duas vezes;
 *  3. ações: criar_tarefa, notificar_gestor, enviar_whatsapp_template (legado: vira
 *     tarefa), atribuir_responsavel e enviar_modelo — esta MANDA o modelo de verdade,
 *     pela Edge, com as travas: modelo aprovado, automação ligada pela empresa,
 *     empresa sem "pausar todas", contato sem opt-out e não bloqueado, 1 vez por
 *     modelo e contato a cada 7 dias, 50 por hora por empresa (o resto espera),
 *     horário de atendimento (fora dele, vai para o próximo início).
 *
 * Regra herdada: tarefa só nasce de automação LIGADA pela empresa.
 * Tudo aqui roda com a chave de serviço: quem chama já autorizou o usuário.
 */

type Db = SupabaseClient

export interface LeadMin { id: number; nome: string | null; responsavel_id: string | null }

export interface AutomacaoRow {
  id: number
  empresa_id?: number
  etapa_slug: string | null
  etapa_id?: number | null
  gatilho: string
  horas: number | null
  acao: string
  config: Record<string, unknown> | null
  ativo?: boolean
  espera_dias?: number
  modelo_id?: number | null
  etiqueta_id?: number | null
  publico_id?: number | null
}

export interface Execucao {
  id: number; empresa_id: number; filial_id: number | null; automacao_id: number; negocio_id: number
  contato_id: number | null; acao: string; modelo_id: number | null; status: string; agendada_para: string
  tentativas: number
}

export type Resultado = 'executada' | 'pulada' | 'falhou' | 'adiada'
interface Saida { resultado: Resultado; motivo?: string; quando?: Date; mensagemId?: number | null }
type Conta = { executadas: number; adiadas: number; puladas: number; falhas: number }

export const CHAVE_PAUSA = 'automacoes_pausadas'
const MAX_TENTATIVAS = 3

function render(texto: string, nome: string | null): string {
  return texto.replace(/\{\{nome\}\}/g, nome ?? '').trim()
}

/** O dono apertou "pausar todas as automações"? */
export async function automacoesPausadas(db: Db, empresaId: number): Promise<boolean> {
  const { data } = await db.from('configuracoes_sistema').select('valor')
    .eq('empresa_id', empresaId).eq('chave', CHAVE_PAUSA).maybeSingle()
  return !!(data?.valor as { pausado?: boolean } | null)?.pausado
}

async function horarioDaEmpresa(db: Db, empresaId: number): Promise<Horario> {
  const { data } = await db.from('configuracoes_sistema').select('valor')
    .eq('empresa_id', empresaId).eq('chave', 'horario_comercial').maybeSingle()
  return horarioValido(data?.valor)
}

interface NegocioMin {
  id: number; nome: string | null; responsavel_id: string | null; contato_id: number | null
  filial_id: number | null; etapa_slug: string | null; etapa_id: number | null
}

async function lerNegocio(db: Db, id: number): Promise<NegocioMin | null> {
  const { data } = await db.from('negocios')
    .select('id, contato_id, filial_id, responsavel_id, etapa_id, dados, contatos(nome), funil_etapas(slug)')
    .eq('id', id).maybeSingle()
  if (!data) return null
  const d = data as unknown as {
    id: number; contato_id: number | null; filial_id: number | null; responsavel_id: string | null; etapa_id: number | null
    dados: { _lead?: { kanban_status?: string } } | null; contatos: { nome: string | null } | null; funil_etapas: { slug: string } | null
  }
  return {
    id: d.id, nome: d.contatos?.nome ?? null, responsavel_id: d.responsavel_id, contato_id: d.contato_id,
    filial_id: d.filial_id, etapa_slug: d.funil_etapas?.slug ?? d.dados?._lead?.kanban_status ?? null,
    etapa_id: d.etapa_id ?? null,
  }
}

/** Ação que só cria tarefa (o comportamento de antes, agora por negócio). */
async function criarTarefa(db: Db, e: Execucao, a: AutomacaoRow, neg: NegocioMin): Promise<void> {
  const config = a.config ?? {}
  let titulo: string
  let responsavel = neg.responsavel_id
  let tipo = (config.tipo as string) || 'ligacao'
  let vencimento = new Date().toISOString()
  if (a.acao === 'enviar_whatsapp_template') {
    titulo = `Enviar WhatsApp para ${neg.nome ?? 'lead'}`
  } else if (a.acao === 'notificar_gestor') {
    const { data: g } = await db.from('empresa_usuarios').select('usuario_id')
      .eq('empresa_id', e.empresa_id).in('role', ['owner', 'admin']).eq('ativo', true).limit(1)
    responsavel = (g?.[0] as { usuario_id: string } | undefined)?.usuario_id ?? neg.responsavel_id
    titulo = render((config.titulo as string) || `Atenção com o lead ${neg.nome ?? ''}`, neg.nome)
    tipo = 'ligacao'
  } else {
    titulo = render((config.titulo as string) || `Ação: lead ${neg.nome ?? ''}`, neg.nome)
    const prazo = Number(config.prazo_dias) || 0
    if (prazo > 0) vencimento = new Date(Date.now() + prazo * 86_400_000).toISOString()
    // Negócio sem dono (12/11/2026): a tarefa vai para quem a automação diz, se ainda está ativo na
    // empresa; sem ninguém configurado, fica "sem responsável" (a loja inteira vê em Tarefas).
    const semDono = (config.responsavel_sem_dono as string | undefined) || null
    if (!responsavel && semDono) {
      const { data: m } = await db.from('empresa_usuarios').select('usuario_id')
        .eq('empresa_id', e.empresa_id).eq('usuario_id', semDono).eq('ativo', true).maybeSingle()
      if (m) responsavel = semDono
    }
  }
  const { error } = await db.from('tarefas').insert({
    empresa_id: e.empresa_id, filial_id: neg.filial_id, lead_id: neg.id, negocio_id: neg.id, contato_id: neg.contato_id,
    responsavel_id: responsavel, titulo, tipo, vencimento, origem: 'automacao',
  } as never)
  if (error) throw new Error(`tarefa: ${error.message}`)
}

/** Envio do modelo pela Edge (caminho de serviço; a Edge confere de novo o aprovado). */
async function enviarModeloPelaEdge(e: Execucao, a: AutomacaoRow, neg: NegocioMin,
  modelo: { id: number; nome: string; idioma: string; corpo: string | null }, telefone: string): Promise<number | null> {
  const url = urlEdgeWebhook('send_template_automacao')
  const parametros = ((a.config?.parametros as string[] | undefined) ?? []).map((p) => render(String(p), neg.nome))
  const previa = (modelo.corpo ?? '').replace(/\{\{(\d+)\}\}/g, (_, n) => parametros[Number(n) - 1] ?? '')
  const r = await fetch(url, {
    method: 'POST',
    headers: cabecalhosEdgeInterna(),
    body: JSON.stringify({
      leadId: neg.id, number: telefone, modelo: modelo.nome, idioma: modelo.idioma, parametros, previa,
      modeloId: modelo.id, automacaoId: a.id, execucaoId: e.id,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const j = await r.json().catch(() => ({})) as { error?: string; mensagemId?: number | null }
  if (!r.ok) throw new Error(j.error || `Edge respondeu ${r.status}`)
  return j.mensagemId ?? null
}

/** Executa UMA execução já reservada ('executando'). */
export async function executarUma(db: Db, e: Execucao, agora = new Date()): Promise<Saida> {
  const { data: aRow } = await db.from('automacoes').select('*').eq('id', e.automacao_id).maybeSingle()
  const a = aRow as AutomacaoRow | null
  if (!a) return { resultado: 'pulada', motivo: 'automação apagada' }
  if (!a.ativo) return { resultado: 'pulada', motivo: 'automação desligada' }
  if (await automacoesPausadas(db, e.empresa_id)) {
    return { resultado: 'adiada', motivo: 'automações pausadas pela empresa', quando: new Date(agora.getTime() + 3_600_000) }
  }

  const neg = await lerNegocio(db, e.negocio_id)
  if (!neg) return { resultado: 'pulada', motivo: 'negócio apagado' }
  // "Esperar N dias" na etapa: se saiu dela, a ação não vale mais. Pela etapa (id)
  // quando a automação tem: o slug só é único dentro de um funil.
  const saiu = a.etapa_id != null && neg.etapa_id != null
    ? neg.etapa_id !== a.etapa_id
    : !!(a.etapa_slug && neg.etapa_slug && neg.etapa_slug !== a.etapa_slug)
  if (saiu) {
    return { resultado: 'pulada', motivo: `saiu da etapa (${neg.etapa_slug})` }
  }
  // "Recebeu etiqueta" com espera: se a etiqueta saiu do contato, a ação não vale mais.
  if (a.gatilho === 'recebeu_etiqueta' && a.etiqueta_id != null) {
    const { data: ct } = await db.from('contatos').select('etiqueta_ids').eq('id', neg.contato_id ?? 0).maybeSingle()
    const tem = ((ct as { etiqueta_ids?: number[] } | null)?.etiqueta_ids ?? []).includes(a.etiqueta_id)
    if (!tem) return { resultado: 'pulada', motivo: 'a etiqueta saiu do contato' }
  }
  // "Entrou no público" (12/11/2026): só com o módulo ligado, e só se o contato ainda está nele
  // (a última conta do público; com espera, ele pode ter saído).
  if (a.gatilho === 'entrou_no_publico' && a.publico_id != null) {
    if (!(await moduloEstaLigado(e.empresa_id, 'publicos'))) return { resultado: 'pulada', motivo: 'módulo Públicos desligado' }
    const { data: membro } = await db.from('publicos_membros').select('contato_id')
      .eq('publico_id', a.publico_id).eq('contato_id', neg.contato_id ?? 0).maybeSingle()
    if (!membro) return { resultado: 'pulada', motivo: 'saiu do público' }
  }

  if (a.acao === 'atribuir_responsavel') {
    const novo = (a.config?.responsavel_id as string | undefined) ?? null
    if (!novo) return { resultado: 'pulada', motivo: 'sem responsável configurado' }
    const { data, error } = await db.from('negocios').update({ responsavel_id: novo } as never).eq('id', neg.id).select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) return { resultado: 'pulada', motivo: 'negócio não gravou' }
    return { resultado: 'executada' }
  }

  if (a.acao === 'enviar_modelo') {
    const { data: m } = await db.from('modelos_mensagem').select('id, nome, idioma, corpo, status').eq('id', a.modelo_id ?? 0).maybeSingle()
    const modelo = m as { id: number; nome: string; idioma: string; corpo: string | null; status: string } | null
    if (!modelo) return { resultado: 'pulada', motivo: 'modelo apagado' }
    // Aprovado NO NÚMERO que envia por esta loja (11/11/2026: a Meta aprova por WABA; o status
    // da empresa é só resumo). Mesma regra de canal da Edge: o da loja, senão o último de qualquer loja.
    if (!(await aprovadoNaLoja(db, e.empresa_id, modelo.id, neg.filial_id, true))) {
      return { resultado: 'pulada', motivo: 'modelo não aprovado no WhatsApp da loja deste negócio' }
    }
    const { data: c } = await db.from('contatos').select('id, telefone, telefone_e164, ativo, opt_out_em').eq('id', neg.contato_id ?? 0).maybeSingle()
    const contato = c as { id: number; telefone: string | null; telefone_e164: string | null; ativo: boolean | null; opt_out_em: string | null } | null
    if (!contato) return { resultado: 'pulada', motivo: 'sem contato' }
    if (contato.opt_out_em) return { resultado: 'pulada', motivo: 'contato pediu para não receber (opt-out)' }
    if (contato.ativo === false) return { resultado: 'pulada', motivo: 'contato bloqueado' }
    const telefone = (contato.telefone_e164 || contato.telefone || '').replace(/\D/g, '')
    if (telefone.length < 10) return { resultado: 'pulada', motivo: 'contato sem telefone' }

    // A trava é do MODELO para o contato, venha de automação ou de transmissão (10/11/2026).
    const [{ data: ult }, { data: ultT }] = await Promise.all([
      db.from('automacao_execucoes').select('executada_em')
        .eq('contato_id', contato.id).eq('modelo_id', modelo.id).eq('acao', 'enviar_modelo').eq('status', 'executada')
        .order('executada_em', { ascending: false }).limit(1),
      db.from('transmissao_envios').select('enviada_em')
        .eq('contato_id', contato.id).eq('modelo_id', modelo.id).eq('status', 'enviada')
        .order('enviada_em', { ascending: false }).limit(1),
    ])
    const ultimo = [(ult?.[0] as { executada_em: string | null } | undefined)?.executada_em, (ultT?.[0] as { enviada_em: string | null } | undefined)?.enviada_em]
      .filter((x): x is string => !!x).sort().pop()
    if (modeloRecente(ultimo ? new Date(ultimo) : null, agora)) {
      return { resultado: 'pulada', motivo: 'este contato já recebeu este modelo nos últimos 7 dias' }
    }

    // O horário de atendimento no relógio DA LOJA (fuso da empresa).
    const [horario, fuso] = await Promise.all([horarioDaEmpresa(db, e.empresa_id), fusoDaEmpresa(db, e.empresa_id)])
    const quando = proximoHorario(agora, horario, fuso)
    if (quando.getTime() > agora.getTime()) return { resultado: 'adiada', motivo: 'fora do horário de atendimento', quando }

    const { count } = await db.from('automacao_execucoes').select('id', { count: 'exact', head: true })
      .eq('empresa_id', e.empresa_id).eq('acao', 'enviar_modelo').eq('status', 'executada')
      .gte('executada_em', new Date(agora.getTime() - 3_600_000).toISOString())
    if (tetoAtingido(count ?? 0)) {
      return { resultado: 'adiada', motivo: 'teto de 50 envios automáticos por hora', quando: new Date(agora.getTime() + 15 * 60_000) }
    }

    const mensagemId = await enviarModeloPelaEdge(e, a, neg, modelo, telefone)
    return { resultado: 'executada', mensagemId }
  }

  await criarTarefa(db, e, a, neg)
  return { resultado: 'executada' }
}

async function concluir(db: Db, e: Execucao, r: Saida) {
  const patch = r.resultado === 'adiada'
    ? { status: 'agendada', agendada_para: (r.quando ?? new Date(Date.now() + 3_600_000)).toISOString(), reservada_em: null, motivo: r.motivo ?? null }
    : { status: r.resultado, executada_em: r.resultado === 'executada' ? new Date().toISOString() : null, motivo: r.motivo ?? null, mensagem_id: r.mensagemId ?? null }
  await db.from('automacao_execucoes').update(patch as never).eq('id', e.id).eq('status', 'executando')
  // O "failed" da Meta pode ter chegado antes deste update (lib/canais/falha-meta.ts).
  if (r.resultado === 'executada' && r.mensagemId) {
    const recusa = await recusadaPelaMeta(db, r.mensagemId)
    if (recusa) await db.from('automacao_execucoes').update({ status: 'falhou', motivo: recusa } as never).eq('id', e.id).eq('status', 'executada').select('id')
  }
}

/** Executa um conjunto já reservado; erro numa não para as outras. */
async function executarReservadas(db: Db, lista: Execucao[]) {
  const soma: Conta = { executadas: 0, puladas: 0, falhas: 0, adiadas: 0 }
  const porEmpresa = new Map<number, Conta>()
  for (const e of lista) {
    let r: Saida
    try {
      r = await executarUma(db, e)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      r = e.tentativas >= MAX_TENTATIVAS
        ? { resultado: 'falhou', motivo: msg.slice(0, 300) }
        : { resultado: 'adiada', motivo: `erro, nova tentativa: ${msg.slice(0, 250)}`, quando: new Date(Date.now() + 30 * 60_000) }
    }
    await concluir(db, e, r)
    const k: keyof Conta = r.resultado === 'executada' ? 'executadas' : r.resultado === 'pulada' ? 'puladas' : r.resultado === 'falhou' ? 'falhas' : 'adiadas'
    soma[k]++
    const pe = porEmpresa.get(e.empresa_id) ?? { executadas: 0, adiadas: 0, puladas: 0, falhas: 0 }
    pe[k]++
    porEmpresa.set(e.empresa_id, pe)
  }
  return { soma, porEmpresa }
}

/**
 * Entrada na etapa: agenda uma execução por automação ligada daquela etapa e roda
 * já as de espera 0. `db` precisa ser o cliente de SERVIÇO (a fila só aceita ele).
 */
export async function executarEntradaEtapa(db: Db, empresaId: number, lead: LeadMin, etapaSlug: string, etapaId: number | null = null) {
  const { data } = await db.from('automacoes')
    .select('id, etapa_slug, etapa_id, acao, espera_dias, modelo_id')
    .eq('empresa_id', empresaId).eq('gatilho', 'entrou_na_etapa').eq('ativo', true)
  // A etapa pelo id quando os dois lados têm: o slug só é único DENTRO de um funil
  // (funil_etapas_funil_slug_key), e "novo" em dois funis dispararia nos dois.
  const lista = ((data ?? []) as AutomacaoRow[]).filter((a) => a.etapa_id != null && etapaId != null
    ? a.etapa_id === etapaId
    : !a.etapa_slug || a.etapa_slug === etapaSlug)
  if (!lista.length) return
  if (await automacoesPausadas(db, empresaId)) return
  const neg = await lerNegocio(db, lead.id)
  if (!neg) return
  await agendarERodar(db, empresaId, neg, lista, 'substituída: entrou de novo na etapa')
}

/**
 * "Recebeu etiqueta" (11/11/2026): para cada negócio cujo contato acabou de receber a etiqueta
 * (o que `etiquetas_aplicar` devolve), agenda as automações ligadas daquela etiqueta, como a
 * entrada na etapa — mesma fila, mesmas travas (horário, teto, 7 dias, opt-out, modelo aprovado
 * na loja). Quem já tinha a etiqueta não dispara de novo (a função só devolve quem mudou).
 */
export async function executarRecebeuEtiqueta(db: Db, empresaId: number, negocioIds: number[], etiquetaId: number) {
  if (!negocioIds.length) return
  const { data } = await db.from('automacoes')
    .select('id, etapa_slug, etapa_id, acao, espera_dias, modelo_id, etiqueta_id')
    .eq('empresa_id', empresaId).eq('gatilho', 'recebeu_etiqueta').eq('etiqueta_id', etiquetaId).eq('ativo', true)
  const lista = (data ?? []) as AutomacaoRow[]
  if (!lista.length) return
  if (await automacoesPausadas(db, empresaId)) return
  for (const id of negocioIds.slice(0, 500)) {
    const neg = await lerNegocio(db, id)
    if (neg) await agendarERodar(db, empresaId, neg, lista, 'substituída: recebeu a etiqueta de novo')
  }
}

/**
 * "Entrou no público" (12/11/2026): quem a conta do público achou como NOVO (publicos_recalcular com
 * disparar) ganha uma execução agendada por automação ligada daquele público, em lote. Na rodada de
 * hora em hora a fila de sempre executa logo depois desta conta; no "Atualizar" da tela (`rodarJa`)
 * as de espera 0 rodam aqui mesmo, pelo caminho da etiqueta. As travas são as mesmas nos dois. Quem
 * entrou de novo substitui o que ainda esperava da mesma automação. Devolve quantas agendou.
 */
export async function agendarEntrouNoPublico(db: Db, empresaId: number, publicoId: number,
  entraram: { contato_id: number; negocio_id: number | null }[], { rodarJa = false } = {}): Promise<number> {
  const comNegocio = entraram.filter((x) => x.negocio_id != null) as { contato_id: number; negocio_id: number }[]
  if (!comNegocio.length) return 0
  const { data } = await db.from('automacoes')
    .select('id, acao, espera_dias, modelo_id')
    .eq('empresa_id', empresaId).eq('gatilho', 'entrou_no_publico').eq('publico_id', publicoId).eq('ativo', true)
  const lista = (data ?? []) as AutomacaoRow[]
  if (!lista.length) return 0
  if (await automacoesPausadas(db, empresaId)) return 0
  const agora = new Date()
  let n = 0
  for (let i = 0; i < comNegocio.length; i += 200) {
    const parte = comNegocio.slice(i, i + 200)
    const ids = parte.map((x) => x.negocio_id)
    const { data: negs } = await db.from('negocios').select('id, filial_id').in('id', ids)
    const loja = new Map(((negs ?? []) as { id: number; filial_id: number | null }[]).map((x) => [x.id, x.filial_id]))
    await db.from('automacao_execucoes')
      .update({ status: 'pulada', motivo: 'substituída: entrou no público de novo' } as never)
      .in('negocio_id', ids).eq('status', 'agendada').in('automacao_id', lista.map((a) => a.id)).select('id')
    const linhas = parte.filter((x) => loja.has(x.negocio_id)).flatMap((x) => lista.map((a) => ({
      empresa_id: empresaId, filial_id: loja.get(x.negocio_id) ?? null, automacao_id: a.id, negocio_id: x.negocio_id,
      contato_id: x.contato_id, acao: a.acao, modelo_id: a.modelo_id ?? null, status: 'agendada',
      agendada_para: agendarPara(agora, a.espera_dias ?? 0).toISOString(),
    })))
    if (!linhas.length) continue
    const { data: criadas, error } = await db.from('automacao_execucoes').insert(linhas as never).select('id, automacao_id')
    if (error) throw new Error(`agendar "entrou no público": ${error.message}`)
    n += linhas.length
    // "Atualizar" da tela (12/11/2026, pedido do Lucas): as de espera 0 rodam na hora, como a etiqueta.
    if (rodarJa) await rodarAsDeAgora(db, lista, (criadas ?? []) as { id: number; automacao_id: number }[], agora)
  }
  return n
}

async function agendarERodar(db: Db, empresaId: number, neg: NegocioMin, lista: AutomacaoRow[], motivoSubstituida: string) {
  const agora = new Date()
  // Disparou de novo: o que ainda esperava desta mesma automação para este negócio é
  // substituído pelo agendamento novo (senão "esperar 2 dias" rodaria duas vezes).
  await db.from('automacao_execucoes')
    .update({ status: 'pulada', motivo: motivoSubstituida } as never)
    .eq('negocio_id', neg.id).eq('status', 'agendada').in('automacao_id', lista.map((a) => a.id))
  const { data: criadas, error } = await db.from('automacao_execucoes').insert(lista.map((a) => ({
    empresa_id: empresaId, filial_id: neg.filial_id, automacao_id: a.id, negocio_id: neg.id, contato_id: neg.contato_id,
    acao: a.acao, modelo_id: a.modelo_id ?? null, status: 'agendada',
    agendada_para: agendarPara(agora, a.espera_dias ?? 0).toISOString(),
  })) as never).select('id, automacao_id')
  if (error) throw new Error(`agendar automações: ${error.message}`)
  await rodarAsDeAgora(db, lista, (criadas ?? []) as { id: number; automacao_id: number }[], agora)
}

/**
 * As de espera 0 rodam já, reservadas pelo mesmo estado que o cron usa ('agendada' → 'executando'):
 * a mesma execução de sempre, com as travas (horário, teto por hora, 7 dias por modelo, opt-out) —
 * o que não pode sair agora volta 'adiada' para a fila. Devolve quantas rodaram.
 */
async function rodarAsDeAgora(db: Db, lista: AutomacaoRow[], criadas: { id: number; automacao_id: number }[], agora: Date): Promise<number> {
  const imediatas = new Set(lista.filter((a) => (a.espera_dias ?? 0) === 0).map((a) => a.id))
  const ids = criadas.filter((x) => imediatas.has(x.automacao_id)).map((x) => x.id)
  if (!ids.length) return 0
  const { data: reservadas } = await db.from('automacao_execucoes')
    .update({ status: 'executando', reservada_em: agora.toISOString(), tentativas: 1 } as never)
    .in('id', ids).eq('status', 'agendada').select('*')
  const lote = (reservadas ?? []) as Execucao[]
  await executarReservadas(db, lote)
  return lote.length
}

/**
 * Uma rodada do cron: até `lotes` lotes de `tamanho`, parando no limite de tempo.
 * Registra em `eventos` (uma linha por empresa) quanto executou e quanto ficou.
 */
export async function processarFila(db: Db, { tamanho = 50, lotes = 4, limiteMs = 45_000 } = {}) {
  const t0 = Date.now()
  const soma: Conta & { rodadas: number } = { executadas: 0, puladas: 0, falhas: 0, adiadas: 0, rodadas: 0 }
  const porEmpresa = new Map<number, Conta>()
  for (let i = 0; i < lotes && Date.now() - t0 < limiteMs; i++) {
    const { data, error } = await db.rpc('automacao_reservar', { p_lote: tamanho })
    if (error) throw new Error(`automacao_reservar: ${error.message}`)
    const lista = (data ?? []) as Execucao[]
    if (!lista.length) break
    soma.rodadas++
    const r = await executarReservadas(db, lista)
    soma.executadas += r.soma.executadas; soma.puladas += r.soma.puladas; soma.falhas += r.soma.falhas; soma.adiadas += r.soma.adiadas
    for (const [emp, v] of r.porEmpresa) {
      const acc = porEmpresa.get(emp) ?? { executadas: 0, adiadas: 0, puladas: 0, falhas: 0 }
      acc.executadas += v.executadas; acc.adiadas += v.adiadas; acc.puladas += v.puladas; acc.falhas += v.falhas
      porEmpresa.set(emp, acc)
    }
  }
  const { count: restam } = await db.from('automacao_execucoes').select('id', { count: 'exact', head: true })
    .eq('status', 'agendada').lte('agendada_para', new Date().toISOString())
  for (const [empresaId, v] of porEmpresa) {
    const { count: daEmpresa } = await db.from('automacao_execucoes').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('status', 'agendada').lte('agendada_para', new Date().toISOString())
    await db.from('eventos').insert({
      empresa_id: empresaId, tipo: 'automacoes.rodada', entidade: 'empresa', entidade_id: empresaId,
      dados: { ...v, ficaram_para_a_proxima: daEmpresa ?? 0, ms: Date.now() - t0 },
    } as never)
  }
  return { ...soma, restam: restam ?? 0, ms: Date.now() - t0 }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { cabecalhosEdgeInterna, urlEdgeWebhook } from '@/lib/edge-interna'
import { recusadaPelaMeta } from '@/lib/canais/falha-meta'
import { horarioValido, modeloRecente, proximoHorario } from '@/lib/automatize/travas'
import { CHAVE_CONFIG, renderizar, tetoValido } from '@/lib/transmissao/filtro'

/**
 * O MOTOR DA TRANSMISSÃO (módulo Transmissão, 10/11/2026).
 *
 * A lista já está congelada em `transmissao_envios` (transmissao_montar, no disparo). Aqui
 * se manda o que cabe, com as travas do Automatize (lib/automacoes.ts):
 *  - só transmissão 'enviando' (pausar = sair dela; a Edge recusa o que estiver em voo);
 *  - horário de atendimento da loja, no fuso da empresa: fora dele, nada sai e a fila fica;
 *  - teto por hora POR EMPRESA (configuracoes_sistema `transmissao`, padrão 50): somando
 *    todas as transmissões da empresa; o excedente espera a próxima rodada, não é descartado;
 *  - 1 envio do MESMO modelo por contato a cada 7 dias, contando o Automatize junto;
 *  - opt-out e bloqueado conferidos de novo na hora (a lista pode ter dias).
 *
 * Quem chama: o disparo/retomar (after() na rota, primeiro lote na hora) e o cron de hora em
 * hora (/api/cron/automacoes, pelo pg_cron `automacoes-hora`). A reserva é FOR UPDATE SKIP
 * LOCKED: os dois juntos não mandam duas vezes. Tudo com a chave de SERVIÇO (`svc`): quem
 * chama já conferiu o usuário.
 */

type Db = SupabaseClient
const MAX_TENTATIVAS = 3
const POR_LOTE = 50
const SIMULTANEOS = 4

export interface Transmissao {
  id: number; empresa_id: number; filial_id: number | null; nome: string; modelo_id: number
  parametros: string[]; status: string; agendada_para: string | null
}
interface Envio {
  id: number; empresa_id: number; transmissao_id: number; contato_id: number; negocio_id: number | null
  modelo_id: number | null; telefone: string | null; tentativas: number
}
type Fim = { status: 'enviada'; mensagemId: number | null }
  | { status: 'falhou' | 'pulada'; motivo: string }
  | { status: 'pendente'; motivo: string; parar?: boolean }

export interface Rodada {
  transmissao: number; enviadas: number; falhas: number; puladas: number; devolvidas: number
  aguardando?: 'horario' | 'teto' | 'pausada'; ate?: string; concluida?: boolean
}

export async function tetoDaEmpresa(svc: Db, empresaId: number): Promise<number> {
  const { data } = await svc.from('configuracoes_sistema').select('valor')
    .eq('empresa_id', empresaId).eq('chave', CHAVE_CONFIG).maybeSingle()
  return tetoValido(data?.valor)
}

/** Quantas mensagens de transmissão a empresa mandou na última hora (todas as transmissões). */
export async function enviadasNaHora(svc: Db, empresaId: number, agora = new Date()): Promise<number> {
  const { count } = await svc.from('transmissao_envios').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('status', 'enviada')
    .gte('enviada_em', new Date(agora.getTime() - 3_600_000).toISOString())
  return count ?? 0
}

/** Quando a loja abre de novo (agora, se está aberta). */
export async function proximaJanela(svc: Db, empresaId: number, agora = new Date()): Promise<Date> {
  const [{ data }, fuso] = await Promise.all([
    svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'horario_comercial').maybeSingle(),
    fusoDaEmpresa(svc, empresaId),
  ])
  return proximoHorario(agora, horarioValido(data?.valor), fuso)
}

async function statusAtual(svc: Db, id: number): Promise<string | null> {
  const { data } = await svc.from('transmissoes').select('status').eq('id', id).maybeSingle()
  return (data as { status?: string } | null)?.status ?? null
}

/** O mesmo modelo foi para este contato nos últimos 7 dias, por outra transmissão ou pelo Automatize? */
async function modeloNosUltimos7Dias(svc: Db, e: Envio, agora: Date): Promise<boolean> {
  if (!e.modelo_id) return false
  const [{ data: t }, { data: a }] = await Promise.all([
    svc.from('transmissao_envios').select('enviada_em').eq('contato_id', e.contato_id).eq('modelo_id', e.modelo_id)
      .eq('status', 'enviada').neq('id', e.id).order('enviada_em', { ascending: false }).limit(1),
    svc.from('automacao_execucoes').select('executada_em').eq('contato_id', e.contato_id).eq('modelo_id', e.modelo_id)
      .eq('acao', 'enviar_modelo').eq('status', 'executada').order('executada_em', { ascending: false }).limit(1),
  ])
  const datas = [(t?.[0] as { enviada_em?: string } | undefined)?.enviada_em, (a?.[0] as { executada_em?: string } | undefined)?.executada_em]
    .filter((x): x is string => !!x).map((x) => new Date(x))
  return datas.some((d) => modeloRecente(d, agora))
}

async function chamarEdge(envioId: number, parametros: string[], previa: string): Promise<{ ok: boolean; status: number; erro?: string; codigo?: string; mensagemId?: number | null }> {
  try {
    const r = await fetch(urlEdgeWebhook('send_template_transmissao'), {
      method: 'POST',
      headers: cabecalhosEdgeInterna(),
      body: JSON.stringify({ envioId, parametros, previa }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await r.json().catch(() => ({})) as { error?: string; codigo?: string; mensagemId?: number | null }
    return { ok: r.ok, status: r.status, erro: j.error, codigo: j.codigo, mensagemId: j.mensagemId ?? null }
  } catch (err) {
    return { ok: false, status: 0, erro: err instanceof Error ? err.message : String(err) }
  }
}

/** Manda UM envio já reservado ('enviando'). */
async function enviarUm(svc: Db, t: Transmissao, corpo: string, e: Envio, agora: Date): Promise<Fim> {
  const { data: c } = await svc.from('contatos').select('nome, ativo, opt_out_em').eq('id', e.contato_id).maybeSingle()
  const contato = c as { nome: string | null; ativo: boolean | null; opt_out_em: string | null } | null
  if (!contato) return { status: 'pulada', motivo: 'contato apagado' }
  if (contato.opt_out_em) return { status: 'pulada', motivo: 'contato pediu para não receber (opt-out)' }
  if (contato.ativo === false) return { status: 'pulada', motivo: 'contato bloqueado' }
  if (!e.telefone || e.telefone.length < 10) return { status: 'pulada', motivo: 'contato sem telefone' }
  if (!e.negocio_id) return { status: 'pulada', motivo: 'negócio apagado' }
  if (await modeloNosUltimos7Dias(svc, e, agora)) return { status: 'pulada', motivo: 'este contato já recebeu este modelo nos últimos 7 dias' }

  const { parametros, previa } = renderizar(corpo, t.parametros ?? [], contato.nome)
  const r = await chamarEdge(e.id, parametros, previa)
  if (r.ok) return { status: 'enviada', mensagemId: r.mensagemId ?? null }
  // Pausada (ou encerrada) no meio: o envio volta para a fila sem gastar tentativa.
  if (r.status === 409 && /pausada|encerrada/.test(r.erro ?? '')) return { status: 'pendente', motivo: 'transmissão pausada', parar: true }
  if (r.status === 409) return { status: 'pulada', motivo: (r.erro ?? 'recusado pela Edge').slice(0, 300) }
  // A Meta não respondeu no prazo: a mensagem PODE ter chegado — não manda de novo.
  if (r.codigo === 'timeout_meta') return { status: 'falhou', motivo: 'A Meta não respondeu em 20 s; a mensagem pode ter chegado (não reenviada).' }
  // Erro da Meta (4xx): o mesmo pedido falharia de novo.
  if (r.status >= 400 && r.status < 500) return { status: 'falhou', motivo: (r.erro ?? `HTTP ${r.status}`).slice(0, 300) }
  // Rede, 5xx: tenta de novo na próxima rodada, até 3 vezes.
  if (e.tentativas >= MAX_TENTATIVAS) return { status: 'falhou', motivo: `sem resposta da Edge depois de ${MAX_TENTATIVAS} tentativas: ${(r.erro ?? `HTTP ${r.status}`).slice(0, 200)}` }
  return { status: 'pendente', motivo: `erro, nova tentativa: ${(r.erro ?? `HTTP ${r.status}`).slice(0, 200)}` }
}

async function concluirEnvio(svc: Db, e: Envio, f: Fim) {
  const patch = f.status === 'enviada'
    ? { status: 'enviada', enviada_em: new Date().toISOString(), mensagem_id: f.mensagemId, motivo: null }
    : f.status === 'pendente'
      ? { status: 'pendente', reservada_em: null, motivo: f.motivo, ...(f.parar ? { tentativas: Math.max(0, e.tentativas - 1) } : {}) }
      : { status: f.status, motivo: f.motivo }
  await svc.from('transmissao_envios').update(patch as never).eq('id', e.id).eq('status', 'enviando')
  // O "failed" da Meta pode ter chegado antes deste update (lib/canais/falha-meta.ts).
  if (f.status === 'enviada') {
    const recusa = await recusadaPelaMeta(svc, f.mensagemId)
    if (recusa) await svc.from('transmissao_envios').update({ status: 'falhou', motivo: recusa } as never).eq('id', e.id).eq('status', 'enviada').select('id')
  }
}

/** Uma transmissão: o que cabe agora (horário + teto), até `limiteMs`. */
export async function processarTransmissao(svc: Db, id: number, { limiteMs = 60_000 } = {}): Promise<Rodada> {
  const t0 = Date.now()
  const r: Rodada = { transmissao: id, enviadas: 0, falhas: 0, puladas: 0, devolvidas: 0 }
  const { data } = await svc.from('transmissoes').select('id, empresa_id, filial_id, nome, modelo_id, parametros, status, agendada_para').eq('id', id).maybeSingle()
  const t = data as Transmissao | null
  if (!t || t.status !== 'enviando') return { ...r, aguardando: 'pausada' }
  const { data: m } = await svc.from('modelos_mensagem').select('corpo').eq('id', t.modelo_id).maybeSingle()
  const corpo = (m as { corpo?: string } | null)?.corpo ?? ''

  let parar = false
  while (!parar && Date.now() - t0 < limiteMs) {
    const agora = new Date()
    const janela = await proximaJanela(svc, t.empresa_id, agora)
    if (janela.getTime() > agora.getTime()) { r.aguardando = 'horario'; r.ate = janela.toISOString(); break }
    const cabe = (await tetoDaEmpresa(svc, t.empresa_id)) - (await enviadasNaHora(svc, t.empresa_id, agora))
    if (cabe <= 0) { r.aguardando = 'teto'; break }

    const { data: lote, error } = await svc.rpc('transmissao_reservar', { p_transmissao: id, p_lote: Math.min(cabe, POR_LOTE) })
    if (error) throw new Error(`transmissao_reservar: ${error.message}`)
    const fila = (lote ?? []) as Envio[]
    if (!fila.length) break

    // Poucos de cada vez, conferindo a pausa entre um grupo e outro.
    for (let i = 0; i < fila.length; i += SIMULTANEOS) {
      const grupo = fila.slice(i, i + SIMULTANEOS)
      if (parar || Date.now() - t0 >= limiteMs || (await statusAtual(svc, id)) !== 'enviando') {
        // O que sobrou do lote volta para a fila, sem gastar tentativa.
        for (const e of fila.slice(i)) { await concluirEnvio(svc, e, { status: 'pendente', motivo: 'devolvido à fila', parar: true }); r.devolvidas++ }
        parar = true
        break
      }
      const fins = await Promise.all(grupo.map(async (e) => {
        let f: Fim
        try { f = await enviarUm(svc, t, corpo, e, agora) }
        catch (err) { f = { status: 'pendente', motivo: `erro, nova tentativa: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` } }
        await concluirEnvio(svc, e, f)
        return f
      }))
      for (const f of fins) {
        if (f.status === 'enviada') r.enviadas++
        else if (f.status === 'falhou') r.falhas++
        else if (f.status === 'pulada') r.puladas++
        else { r.devolvidas++; if (f.status === 'pendente' && f.parar) parar = true }
      }
    }
    if (r.aguardando || fila.length < Math.min(cabe, POR_LOTE)) break
  }
  if (parar && (await statusAtual(svc, id)) !== 'enviando') r.aguardando = 'pausada'

  // Nada pendente nem em voo: acabou.
  const { count: resta } = await svc.from('transmissao_envios').select('id', { count: 'exact', head: true })
    .eq('transmissao_id', id).in('status', ['pendente', 'enviando'])
  if ((resta ?? 0) === 0) {
    const { data: fim } = await svc.from('transmissoes').update({ status: 'concluida', concluida_em: new Date().toISOString() } as never)
      .eq('id', id).eq('status', 'enviando').select('id')
    r.concluida = !!fim?.length
  }
  if (r.enviadas || r.falhas || r.puladas || r.concluida) {
    await svc.from('eventos').insert({
      empresa_id: t.empresa_id, filial_id: t.filial_id, tipo: 'transmissao.rodada', entidade: 'transmissao', entidade_id: id,
      dados: { ...r, ms: Date.now() - t0 },
    } as never)
  }
  return r
}

/**
 * Uma rodada do cron: as agendadas que chegaram na hora passam a 'enviando'; depois cada
 * transmissão 'enviando' manda o que cabe. Uma que falha não impede as outras.
 */
export async function processarTransmissoes(svc: Db, { limiteMs = 120_000 } = {}) {
  const t0 = Date.now()
  const agora = new Date().toISOString()
  await svc.from('transmissoes').update({ status: 'enviando', iniciada_em: agora } as never)
    .eq('status', 'agendada').lte('agendada_para', agora).select('id')
  const { data } = await svc.from('transmissoes').select('id').eq('status', 'enviando').order('id')
  const rodadas: Rodada[] = []
  const falhas: { transmissao: number; erro: string }[] = []
  for (const { id } of (data ?? []) as { id: number }[]) {
    const resta = limiteMs - (Date.now() - t0)
    if (resta < 5_000) break
    try { rodadas.push(await processarTransmissao(svc, id, { limiteMs: resta })) }
    catch (err) { falhas.push({ transmissao: id, erro: err instanceof Error ? err.message : String(err) }) }
  }
  return { rodadas, falhas, ms: Date.now() - t0 }
}

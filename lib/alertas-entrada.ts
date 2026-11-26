/**
 * ALERTA DE ENTRADA PARADA (18/11/2026, pedido do Lucas depois do incidente do 06 s.54).
 *
 * Regra: empresa com canal ativo que recebe mensagens de cliente da Meta e não grava nenhuma por 30 minutos,
 * em horário de atendimento → aviso para o Lucas e registro no superadmin (`alertas_entrada`).
 *
 * Como se mede: a Edge marca `canais.entrada_pendente_desde` quando chega mensagem de cliente; a
 * `mensagem_registrar` limpa quando grava (ou quando é reenvio do que já está gravado). Pendente há 30 min =
 * nada gravou desde aquela mensagem. O pg_cron `entrada-parada` (5 em 5 min) só chama a rota quando há canal
 * pendente há 30 min, alerta aberto ou alerta sem aviso.
 *
 * Aviso: e-mail para ALERTA_EMAIL (pelo Resend, quando configurado) e o Sentry (um evento por alerta, com
 * fingerprint próprio: vira issue nova e a regra de alerta do Sentry manda o e-mail). Os alertas
 * `negocio_nao_criado` (uma regra recusou o negócio de uma mensagem recebida; a mensagem entrou) seguem o
 * mesmo aviso e já nascem resolvidos — são informação, não estado.
 */
import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HORARIO_PADRAO, abertoAgora, doFormatoAntigo, horarioDaLoja, horarioValido } from '@/lib/horario'
import { fusoDoValor } from '@/lib/fuso-empresa'
import { montarEnvelopes } from '@/lib/config'
import { enviarEmail } from '@/lib/email'
import { formatarDataHora, FUSO_PADRAO } from '@/lib/datas'

export const MINUTOS_PARADA = 30

/** Pendente há 30 min ou mais E agora é horário de atendimento da empresa. */
export function entradaParada(pendenteDesde: Date, agora: Date, horario: unknown, fuso: string): boolean {
  if (agora.getTime() - pendenteDesde.getTime() < MINUTOS_PARADA * 60_000) return false
  // Horário por dia (24/11/2026): o formato novo; o antigo (horario_comercial) ainda é aceito.
  const h = horarioValido(horario) ?? doFormatoAntigo(horario) ?? HORARIO_PADRAO
  return abertoAgora(agora, h, fuso)
}

type Canal = { id: number; empresa_id: number; tipo: string; nome_exibicao: string | null; entrada_pendente_desde: string }
type Alerta = { id: number; empresa_id: number; canal_id: number | null; tipo: string; desde: string; detalhe: string | null }

export interface ResultadoEntradaParada { resolvidos: number; abertos: number; avisados: number; foraDoHorario: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verificarEntradaParada(svc: SupabaseClient<any>, agora = new Date()): Promise<ResultadoEntradaParada> {
  const r: ResultadoEntradaParada = { resolvidos: 0, abertos: 0, avisados: 0, foraDoHorario: 0 }
  const agoraIso = agora.toISOString()

  // 1. Resolve: alerta aberto de canal que voltou a gravar (ou que deixou de estar ativo).
  const { data: abertos, error: eAb } = await svc.from('alertas_entrada').select('id, canal_id')
    .eq('tipo', 'entrada_parada').is('resolvido_em', null)
  if (eAb) throw eAb
  const idsCanaisAbertos = [...new Set((abertos ?? []).map((a) => a.canal_id as number).filter(Boolean))]
  if (idsCanaisAbertos.length) {
    const { data: ainda } = await svc.from('canais').select('id').in('id', idsCanaisAbertos)
      .eq('status', 'ativo').not('entrada_pendente_desde', 'is', null)
    const pendentes = new Set((ainda ?? []).map((c) => c.id as number))
    const resolver = (abertos ?? []).filter((a) => !pendentes.has(a.canal_id as number)).map((a) => a.id as number)
    if (resolver.length) {
      const { error } = await svc.from('alertas_entrada').update({ resolvido_em: agoraIso }).in('id', resolver)
      if (error) throw error
      r.resolvidos = resolver.length
    }
  }

  // 2. Abre: canal ativo pendente há 30 min, no horário de atendimento da empresa, sem alerta aberto.
  const corte = new Date(agora.getTime() - MINUTOS_PARADA * 60_000).toISOString()
  const { data: canais, error: eC } = await svc.from('canais')
    .select('id, empresa_id, tipo, nome_exibicao, entrada_pendente_desde')
    .eq('status', 'ativo').lt('entrada_pendente_desde', corte)
  if (eC) throw eC
  const lista = (canais ?? []) as Canal[]
  if (lista.length) {
    const empresas = [...new Set(lista.map((c) => c.empresa_id))]
    const [{ data: cfg }, { data: cfgNova }] = await Promise.all([
      svc.from('configuracoes_sistema').select('empresa_id, chave, valor')
        .in('empresa_id', empresas).eq('chave', 'fuso'),
      // core.horario mora no motor de configuração (empresa_config, etapa 1.1a)
      (svc as unknown as SupabaseClient).from('empresa_config').select('empresa_id, modulo, chave, filial_id, valor')
        .in('empresa_id', empresas).eq('modulo', 'core').eq('chave', 'horario'),
    ])
    const novo = new Map<number, unknown>(); const fuso = new Map<number, string>()
    for (const e of empresas) {
      const linhas = ((cfgNova ?? []) as { empresa_id: number; modulo: string; chave: string; filial_id: number | null; valor: unknown }[])
        .filter((l) => l.empresa_id === e)
      if (linhas.length) novo.set(e, montarEnvelopes(linhas)['core.horario'])
    }
    for (const c of cfg ?? []) fuso.set(c.empresa_id as number, fusoDoValor(c.valor))
    // 1.1h parte 2: só core.horario (empresa_config); o formato antigo não é mais lido.
    const horario = new Map<number, unknown>(empresas.map((e) => [e, horarioDaLoja(novo.get(e) ?? null, null, null)]))
    const { data: jaAbertos } = await svc.from('alertas_entrada').select('canal_id')
      .eq('tipo', 'entrada_parada').is('resolvido_em', null).in('canal_id', lista.map((c) => c.id))
    const comAlerta = new Set((jaAbertos ?? []).map((a) => a.canal_id as number))
    for (const c of lista) {
      if (comAlerta.has(c.id)) continue
      if (!entradaParada(new Date(c.entrada_pendente_desde), agora, horario.get(c.empresa_id), fuso.get(c.empresa_id) ?? fusoDoValor(null))) {
        r.foraDoHorario++
        continue
      }
      const { error } = await svc.from('alertas_entrada').insert({
        empresa_id: c.empresa_id, canal_id: c.id, tipo: 'entrada_parada', desde: c.entrada_pendente_desde,
        detalhe: `${c.tipo} ${c.nome_exibicao ?? `#${c.id}`}: chegou mensagem de cliente da Meta e nada foi gravado desde então`,
      })
      if (error) throw error
      r.abertos++
    }
  }

  // 3. Avisa o que ainda não foi avisado (entrada parada e negócio não criado).
  const { data: semAviso, error: eS } = await svc.from('alertas_entrada')
    .select('id, empresa_id, canal_id, tipo, desde, detalhe').is('notificado_em', null).order('id').limit(20)
  if (eS) throw eS
  const pendentesAviso = (semAviso ?? []) as Alerta[]
  if (pendentesAviso.length) {
    const { data: emps } = await svc.from('empresas').select('id, nome').in('id', [...new Set(pendentesAviso.map((a) => a.empresa_id))])
    const nome = new Map((emps ?? []).map((e) => [e.id as number, e.nome as string]))
    for (const a of pendentesAviso) {
      await avisar(a, nome.get(a.empresa_id) ?? `empresa ${a.empresa_id}`)
      const patch: Record<string, string> = { notificado_em: agoraIso }
      if (a.tipo === 'negocio_nao_criado') patch.resolvido_em = agoraIso
      const { error } = await svc.from('alertas_entrada').update(patch).eq('id', a.id)
      if (error) throw error
      r.avisados++
    }
  }
  return r
}

async function avisar(a: Alerta, empresa: string) {
  const titulo = a.tipo === 'entrada_parada'
    ? `Entrada parada: ${empresa} não grava mensagens recebidas desde ${formatarDataHora(a.desde, undefined, '—', FUSO_PADRAO)} (Brasília)`
    : `Negócio não criado em mensagem recebida: ${empresa}`
  console.error(JSON.stringify({ evento: 'alerta_entrada', id: a.id, tipo: a.tipo, empresa_id: a.empresa_id, canal_id: a.canal_id, detalhe: a.detalhe }))
  if (typeof Sentry.captureMessage === 'function') {
    Sentry.captureMessage(titulo, {
      level: a.tipo === 'entrada_parada' ? 'fatal' : 'error',
      tags: { alerta: a.tipo, empresa, empresa_id: String(a.empresa_id), canal_id: String(a.canal_id ?? '') },
      fingerprint: ['alerta-entrada', String(a.id)],
      extra: { detalhe: a.detalhe, desde: a.desde },
    })
  }
  const para = process.env.ALERTA_EMAIL
  if (para) {
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#15181C"><p><strong>${esc(titulo)}</strong></p><p>${esc(a.detalhe ?? '')}</p><p style="color:#5C6470">Superadmin → Empresas → ${esc(empresa)} → Acompanhamento. Alerta #${a.id}.</p></div>`
    await enviarEmail({ to: para, subject: titulo.slice(0, 150), html })
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

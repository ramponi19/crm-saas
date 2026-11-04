'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { aplicarNoSino, ordenarSino, type LinhaConversa } from '@/lib/inbox/sino'

/**
 * UMA ASSINATURA DE TEMPO REAL POR ABA (04/11/2026, Inbox única).
 *
 * Antes cada peça abria o próprio canal: o sino (`topbar_notifs_<agora>`), o aviso
 * e o título da aba (`notif_global_<agora>`). A cada mensagem recebida, as duas
 * reliam a view `leads` (o sino, até mil leads por página, em toda aba aberta) e
 * a `lead_mensagens`, só para saber se a pessoa podia ver.
 *
 * Agora um canal só, filtrado pela empresa, com as duas tabelas que importam:
 *   - `conversas` (insert/update/delete): o contador `nao_lidas` mora na própria
 *     linha (gatilho `core_mensagens_sincroniza`), então o sino se atualiza com o
 *     que chega, sem consultar nada;
 *   - `mensagens` (insert/update): aviso de mensagem nova e a conversa aberta na
 *     Inbox (bolha nova, tique de entrega).
 * A RLS do Realtime decide o que esta sessão recebe — empresa e loja selecionada.
 * Quem escuta não refiltra: o que chega, esta pessoa pode ver.
 *
 * O sino conta CONVERSAS com mensagem recebida não lida (`conversas.nao_lidas > 0`),
 * nunca a view `leads`.
 */

export type { LinhaConversa }

export type LinhaMensagemTR = {
  id: number
  conversa_id: number | null
  contato_id: number | null
  filial_id: number | null
  direcao: string
  conteudo: string | null
  tipo: string | null
  midia_url: string | null
  status_entrega: string | null
  erro_envio: string | null
  external_id: string | null
  usuario_id: string | null
  lida: boolean
  created_at: string
}

export type EventoTR =
  | { tabela: 'conversas'; tipo: 'INSERT' | 'UPDATE' | 'DELETE'; novo: LinhaConversa | null; antigo: Partial<LinhaConversa> | null }
  | { tabela: 'mensagens'; tipo: 'INSERT' | 'UPDATE'; novo: LinhaMensagemTR; antigo: Partial<LinhaMensagemTR> | null }

interface ContextoTR {
  /** Escuta tudo que chega no canal da aba. Devolve a função de sair. */
  assinar: (fn: (e: EventoTR) => void) => () => void
  /** Chamado quando o canal cai e volta: o que chegou no meio não avisou. */
  aoReconectar: (fn: () => void) => () => void
  /** Conversas com mensagem recebida não lida, das mais recentes para as mais antigas. */
  naoLidas: LinhaConversa[]
  /** false até a primeira carga do sino terminar. */
  pronto: boolean
}

const Ctx = createContext<ContextoTR | null>(null)

/** O hub da aba. Fora do layout logado (não deveria acontecer) devolve um hub mudo. */
export function useTempoReal(): ContextoTR {
  return useContext(Ctx) ?? MUDO
}

const MUDO: ContextoTR = { assinar: () => () => {}, aoReconectar: () => () => {}, naoLidas: [], pronto: false }

const COLUNAS_SINO = 'id, contato_id, canal_id, filial_id, nao_lidas, ultima_mensagem_at'

export function TempoRealEmpresa({ empresaId, children }: { empresaId: number | undefined; children: ReactNode }) {
  const ouvintes = useRef(new Set<(e: EventoTR) => void>())
  const reconexao = useRef(new Set<() => void>())
  const mapa = useRef(new Map<number, LinhaConversa>())
  const [naoLidas, setNaoLidas] = useState<LinhaConversa[]>([])
  const [pronto, setPronto] = useState(false)

  const assinar = useCallback((fn: (e: EventoTR) => void) => {
    ouvintes.current.add(fn)
    return () => { ouvintes.current.delete(fn) }
  }, [])
  const aoReconectar = useCallback((fn: () => void) => {
    reconexao.current.add(fn)
    return () => { reconexao.current.delete(fn) }
  }, [])

  useEffect(() => {
    if (!empresaId) return
    const supabase = createClient()
    let vivo = true
    // Uma rajada (marcar uma conversa inteira como lida) vira um só desenho do sino.
    let quadro: ReturnType<typeof setTimeout> | null = null
    const desenhar = () => {
      if (quadro) return
      quadro = setTimeout(() => { quadro = null; if (vivo) setNaoLidas(ordenarSino(mapa.current.values())) }, 150)
    }

    async function carregarSino() {
      const novo = new Map<number, LinhaConversa>()
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('conversas').select(COLUNAS_SINO)
          .gt('nao_lidas', 0).order('id').range(de, de + 999)
        if (error || !data) return
        for (const l of data as LinhaConversa[]) novo.set(l.id, l)
        if (data.length < 1000) break
      }
      if (!vivo) return
      mapa.current = novo
      setNaoLidas(ordenarSino(novo.values()))
      setPronto(true)
    }
    carregarSino()

    const emitir = (e: EventoTR) => {
      if (e.tabela === 'conversas' && aplicarNoSino(mapa.current, e)) desenhar()
      for (const fn of ouvintes.current) { try { fn(e) } catch (err) { console.error('[tempo-real] ouvinte falhou:', err) } }
    }

    const filtro = `empresa_id=eq.${empresaId}`
    let caiu = false
    const canal = supabase.channel(`empresa_${empresaId}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas', filter: filtro },
        (p: RealtimePostgresChangesPayload<LinhaConversa>) => emitir({
          tabela: 'conversas', tipo: p.eventType,
          novo: p.eventType === 'DELETE' ? null : (p.new as LinhaConversa),
          antigo: (p.old ?? null) as Partial<LinhaConversa> | null,
        }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: filtro },
        (p: RealtimePostgresChangesPayload<LinhaMensagemTR>) => emitir({ tabela: 'mensagens', tipo: 'INSERT', novo: p.new as LinhaMensagemTR, antigo: null }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensagens', filter: filtro },
        (p: RealtimePostgresChangesPayload<LinhaMensagemTR>) => emitir({ tabela: 'mensagens', tipo: 'UPDATE', novo: p.new as LinhaMensagemTR, antigo: (p.old ?? null) as Partial<LinhaMensagemTR> | null }))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (caiu) {
            caiu = false
            carregarSino()
            for (const fn of reconexao.current) { try { fn() } catch {} }
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') caiu = true
      })

    return () => {
      vivo = false
      if (quadro) clearTimeout(quadro)
      supabase.removeChannel(canal)
    }
  }, [empresaId])

  const valor = useMemo<ContextoTR>(() => ({ assinar, aoReconectar, naoLidas, pronto }), [assinar, aoReconectar, naoLidas, pronto])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

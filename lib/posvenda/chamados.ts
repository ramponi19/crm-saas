/**
 * CHAMADOS E NPS DO PÓS-VENDA (C7 bloco 4, 24/11/2026) — regras puras (tela e testes).
 */

/** NPS clássico: promotores 9–10, neutros 7–8, detratores 0–6; NPS = % promotores − % detratores (arredondado). */
export function resumoNps(notas: number[]): { respostas: number; promotores: number; neutros: number; detratores: number; nps: number | null } {
  const v = notas.filter((n) => Number.isInteger(n) && n >= 0 && n <= 10)
  const promotores = v.filter((n) => n >= 9).length
  const detratores = v.filter((n) => n <= 6).length
  const neutros = v.length - promotores - detratores
  return { respostas: v.length, promotores, neutros, detratores, nps: v.length ? Math.round(((promotores - detratores) / v.length) * 100) : null }
}

export type SituacaoPrazo = { tone: 'bad' | 'warn' | 'neutro' | 'ok'; texto: string }

/**
 * O prazo que importa agora: sem 1ª resposta, o da resposta; depois, o da resolução. Resolvido: verde.
 * Vencido = atrasado (vermelho); vence nas próximas 4 h = atenção (amarelo).
 */
export function situacaoDoPrazo(c: { resolvido_em: string | null; primeira_resposta_em: string | null
  sla_resposta_vence: string | null; sla_resolucao_vence: string | null; sla_pausado_desde?: string | null }, agora: Date, formatar: (iso: string) => string): SituacaoPrazo {
  if (c.resolvido_em) return { tone: 'ok', texto: 'resolvido' }
  // Aguardando o cliente (ou terceiro, se a empresa ligou): o relógio está parado desde então.
  if (c.sla_pausado_desde) return { tone: 'neutro', texto: `prazo pausado desde ${formatar(c.sla_pausado_desde)}` }
  const resposta = !c.primeira_resposta_em
  const vence = resposta ? c.sla_resposta_vence : c.sla_resolucao_vence
  if (!vence) return { tone: 'neutro', texto: 'sem prazo' }
  const falta = new Date(vence).getTime() - agora.getTime()
  const o_que = resposta ? '1ª resposta' : 'resolução'
  if (falta < 0) return { tone: 'bad', texto: `${o_que} atrasada desde ${formatar(vence)}` }
  if (falta <= 4 * 3600_000) return { tone: 'warn', texto: `${o_que} até ${formatar(vence)}` }
  return { tone: 'neutro', texto: `${o_que} até ${formatar(vence)}` }
}

/** Abertos primeiro, do prazo mais apertado ao mais folgado; resolvidos depois, do mais recente. */
export function ordenarChamados<T extends { resolvido_em: string | null; primeira_resposta_em: string | null
  sla_resposta_vence: string | null; sla_resolucao_vence: string | null; aberto_em: string }>(lista: T[]): T[] {
  const prazo = (c: T) => (c.primeira_resposta_em ? c.sla_resolucao_vence : c.sla_resposta_vence) ?? '9999'
  return [...lista].sort((a, b) => {
    if (!!a.resolvido_em !== !!b.resolvido_em) return a.resolvido_em ? 1 : -1
    if (!a.resolvido_em) return prazo(a).localeCompare(prazo(b))
    return (b.resolvido_em ?? '').localeCompare(a.resolvido_em ?? '')
  })
}

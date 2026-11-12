/**
 * "De quando é a conta" do público (12/11/2026, pedido do Lucas): a tela diz se a contagem é de
 * agora ou de horas atrás — só os públicos com gatilho ou transmissão agendada são recontados de
 * hora em hora. Função pura (testada sozinha).
 */
export function atualizadoHa(calculadoEm: string | null | undefined, agora: Date): string {
  if (!calculadoEm) return 'ainda não contado'
  const t = new Date(calculadoEm).getTime()
  if (Number.isNaN(t)) return 'ainda não contado'
  const min = Math.floor(Math.max(0, agora.getTime() - t) / 60_000)
  if (min < 1) return 'atualizado agora'
  if (min < 60) return `atualizado há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `atualizado há ${h} h`
  const d = Math.floor(h / 24)
  return `atualizado há ${d} dia${d > 1 ? 's' : ''}`
}

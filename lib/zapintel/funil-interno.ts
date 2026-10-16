/**
 * O lead está num funil INTERNO (equipe, candidatos)? Regra de 15/10/2026
 * (supabase/funcoes/zapintel_funil_interno.sql): esses leads "ficam fora das
 * métricas e análises do ZapIntel". As telas já os escondiam; as rotas de IA
 * aceitavam o número direto e gastavam análise com conversa da equipe.
 *
 * FALHA NÃO É "NÃO É INTERNO" (17/10/2026). Antes, erro ao ler `leads` ou
 * `funis` devolvia `false` — e a rota liberava IA paga para conversa da
 * equipe. Agora lança `FalhaFunilInterno`: as rotas de IA respondem 503
 * (`MENSAGEM_FALHA_FUNIL`), a tela esconde o botão e o script de lote pula o
 * lead (`scripts/perfil-zapintel.mts`).
 */
export class FalhaFunilInterno extends Error {
  constructor(mensagem: string) { super(mensagem); this.name = 'FalhaFunilInterno' }
}

export const MENSAGEM_FALHA_FUNIL = 'Não foi possível confirmar se esta conversa é de funil interno. Tente de novo em instantes.'

export async function leadDeFunilInterno(
  db: import('@supabase/supabase-js').SupabaseClient, empresaId: number, leadId: number,
): Promise<boolean> {
  const { data: lead, error } = await db.from('leads').select('funil_id').eq('empresa_id', empresaId).eq('id', leadId).maybeSingle()
  if (error) throw new FalhaFunilInterno(error.message)
  const funil = (lead as { funil_id: number | null } | null)?.funil_id
  if (funil == null) return false
  const { data: f, error: erroFunil } = await db.from('funis').select('interno').eq('id', funil).maybeSingle()
  if (erroFunil) throw new FalhaFunilInterno(erroFunil.message)
  return !!(f as { interno: boolean } | null)?.interno
}

/** Registra a falha da checagem — o mesmo formato nas três rotas. */
export function logFalhaFunilInterno(rota: string, empresaId: number, leadId: number, e: unknown) {
  console.error(JSON.stringify({
    evento: 'zapintel.funil_interno.falha', rota, empresa_id: empresaId, lead_id: leadId,
    erro: e instanceof Error ? e.message : String(e),
  }))
}

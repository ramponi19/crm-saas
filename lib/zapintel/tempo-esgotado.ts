import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Chamada do ZapIntel que estourou o tempo do banco vira um EVENTO (10/11/2026).
 *
 * O `pg_stat_statements` não registra consulta cancelada pelo statement_timeout
 * (8 s para o authenticated): as que estouravam eram invisíveis — em 09/11 a
 * zapintel_insights levava 8,35 s e nenhuma chamada dela aparecia como concluída.
 * Log não é monitoramento (regra do Lucas, 20/10). Por isso a própria tela,
 * quando recebe o código 57014, grava em `eventos` (tipo `zapintel.tempo_esgotado`)
 * a função, a empresa, a loja pedida e quanto esperou. Direto do navegador, sem
 * passar pela Vercel; a RLS só deixa gravar na empresa de quem está na tela.
 *
 * Contar: select dados->>'funcao', count(*), max((dados->>'duracao_ms')::int)
 *         from eventos where tipo = 'zapintel.tempo_esgotado' and em > now() - interval '1 day' group by 1;
 *
 * Nunca atrapalha a tela: qualquer falha ao registrar é ignorada.
 */
export const TIPO_TEMPO_ESGOTADO = 'zapintel.tempo_esgotado'

/** O erro do PostgREST é o "canceling statement due to statement timeout"? */
export function ehTempoEsgotado(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === '57014' || /statement timeout|canceling statement/i.test(error.message ?? '')
}

export interface ChamadaEsgotada {
  funcao: string
  empresa: number | null
  /** Date.now() de quando a chamada começou. */
  inicio: number
  params?: Record<string, unknown>
  /** 0 na primeira tentativa; a tela repete uma vez depois de 5 s. */
  tentativa?: number
}

/** Grava o evento se o erro for de tempo esgotado. Devolve se gravou (para teste); nunca lança. */
export async function registrarTempoEsgotado(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  error: { code?: string | null; message?: string | null } | null | undefined,
  c: ChamadaEsgotada,
  agora: number = Date.now(),
): Promise<boolean> {
  if (!ehTempoEsgotado(error) || c.empresa == null) return false
  try {
    const filial = c.params?.p_filial
    const { error: e } = await supabase.from('eventos').insert({
      empresa_id: c.empresa,
      tipo: TIPO_TEMPO_ESGOTADO,
      entidade: 'rpc',
      dados: {
        funcao: c.funcao,
        duracao_ms: Math.max(0, Math.round(agora - c.inicio)),
        filial: typeof filial === 'number' ? filial : null,
        dias: typeof c.params?.p_dias === 'number' ? c.params.p_dias : null,
        tentativa: c.tentativa ?? 0,
      },
    } as never)
    return !e
  } catch {
    return false
  }
}

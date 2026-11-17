/**
 * ACEITE DOS TERMOS DE USO E DA POLÍTICA DE PRIVACIDADE (17/11/2026, "pronto para vender").
 *
 * PRONTO E DESLIGADO: espera a decisão (c) do Lucas — o texto. Com as versões definidas no ambiente
 * (`TERMOS_VERSAO`, `PRIVACIDADE_VERSAO`, ex.: "2026-12-01"), o cadastro exige o aceite e quem já usa o
 * Nexus aceita uma vez na tela /aceite; cada aceite fica em `termos_aceites` (migração 20261117000100) com
 * versão, quem, quando, IP e navegador. Mudar a versão pede o aceite de novo. Sem as versões: nada muda.
 *
 * Os textos moram em /termos e /privacy (páginas públicas da plataforma).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { nadaGravado } from '@/lib/linhas-afetadas'

export type DocumentoLegal = 'termos' | 'privacidade'

export function versoesVigentes(): Record<DocumentoLegal, string> | null {
  const termos = process.env.TERMOS_VERSAO?.trim()
  const privacidade = process.env.PRIVACIDADE_VERSAO?.trim()
  return termos && privacidade ? { termos, privacidade } : null
}

/** Grava o aceite das versões vigentes (idempotente pela chave usuário + documento + versão). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registrarAceite(db: SupabaseClient<any>, a: { usuarioId: string; empresaId: number | null; ip: string | null; userAgent: string | null }): Promise<{ error: string | null }> {
  const v = versoesVigentes()
  if (!v) return { error: null }
  const linhas = (Object.keys(v) as DocumentoLegal[]).map((documento) => ({
    usuario_id: a.usuarioId, empresa_id: a.empresaId, documento, versao: v[documento], ip: a.ip, user_agent: a.userAgent,
  }))
  // Zero linhas de volta é normal: a versão já estava aceita (ignoreDuplicates). Erro é só o do banco.
  const { data: gravadas, error } = await db.from('termos_aceites')
    .upsert(linhas, { onConflict: 'usuario_id,documento,versao', ignoreDuplicates: true }).select('id')
  if (!error && nadaGravado(gravadas) && !(await aceitouVigentes(db, a.usuarioId))) return { error: 'aceite não gravado' }
  return { error: error?.message ?? null }
}

/** O usuário já aceitou as versões vigentes? Sem versões configuradas, sempre sim. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aceitouVigentes(db: SupabaseClient<any>, usuarioId: string): Promise<boolean> {
  const v = versoesVigentes()
  if (!v) return true
  const { data } = await db.from('termos_aceites').select('documento, versao').eq('usuario_id', usuarioId)
  const feitos = new Set(((data ?? []) as { documento: string; versao: string }[]).map((r) => `${r.documento}:${r.versao}`))
  return feitos.has(`termos:${v.termos}`) && feitos.has(`privacidade:${v.privacidade}`)
}

/** IP e navegador de quem aceita (cabeçalhos da Vercel). */
export function origemDaRequisicao(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  return { ip, userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null }
}

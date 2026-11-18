/**
 * ACEITE DOS TERMOS DE USO E DA POLÍTICA DE PRIVACIDADE (17/11/2026, "pronto para vender").
 *
 * PRONTO E DESLIGADO: espera a decisão (c) do Lucas — o texto. Com as versões definidas no ambiente
 * (`TERMOS_VERSAO`, `PRIVACIDADE_VERSAO`, ex.: "2026-12-01"), o cadastro exige o aceite e quem já usa o
 * Nexus aceita uma vez na tela /aceite; cada aceite fica em `termos_aceites` (migração 20261117000100) com
 * versão, quem, quando, IP e navegador. Mudar a versão pede o aceite de novo. Sem as versões: nada muda.
 *
 * Os textos moram em /termos, /privacy e /dpa (páginas públicas da plataforma).
 *
 * CADASTRO (18/11/2026, plano único): o aceite dos três documentos (termos, privacidade e o DPA, o acordo de
 * tratamento de dados) é OBRIGATÓRIO no /register desde já, com a versão "minuta" enquanto o texto final não
 * vem (`versoesDoCadastro`). Quem já usa só é chamado à tela /aceite quando as TRÊS versões estiverem no
 * ambiente (`TERMOS_VERSAO`, `PRIVACIDADE_VERSAO`, `DPA_VERSAO`) — o texto final.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { nadaGravado } from '@/lib/linhas-afetadas'

export type DocumentoLegal = 'termos' | 'privacidade' | 'dpa'

export const DOCUMENTOS_LEGAIS: Record<DocumentoLegal, { nome: string; href: string }> = {
  termos: { nome: 'Termos de uso', href: '/termos' },
  privacidade: { nome: 'Política de privacidade', href: '/privacy' },
  dpa: { nome: 'Acordo de tratamento de dados (DPA)', href: '/dpa' },
}

/** A versão de cada documento enquanto o texto final não sai. */
export const VERSAO_MINUTA = 'minuta'

const doAmbiente = (): Record<DocumentoLegal, string | undefined> => ({
  termos: process.env.TERMOS_VERSAO?.trim() || undefined,
  privacidade: process.env.PRIVACIDADE_VERSAO?.trim() || undefined,
  dpa: process.env.DPA_VERSAO?.trim() || undefined,
})

/** As versões que o cadastro registra e que as páginas mostram: as do ambiente, ou "minuta". */
export function versoesDoCadastro(): Record<DocumentoLegal, string> {
  const v = doAmbiente()
  return { termos: v.termos ?? VERSAO_MINUTA, privacidade: v.privacidade ?? VERSAO_MINUTA, dpa: v.dpa ?? VERSAO_MINUTA }
}

/** As versões que quem JÁ USA tem de aceitar (tela /aceite): só com as três no ambiente. */
export function versoesVigentes(): Record<DocumentoLegal, string> | null {
  const { termos, privacidade, dpa } = doAmbiente()
  return termos && privacidade && dpa ? { termos, privacidade, dpa } : null
}

/**
 * Grava o aceite (idempotente pela chave usuário + documento + versão). Sem `versoes`, as vigentes (tela
 * /aceite); o cadastro passa `versoesDoCadastro()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registrarAceite(db: SupabaseClient<any>, a: { usuarioId: string; empresaId: number | null; ip: string | null; userAgent: string | null }, versoes: Record<DocumentoLegal, string> | null = versoesVigentes()): Promise<{ error: string | null }> {
  const v = versoes
  if (!v) return { error: null }
  const linhas = (Object.keys(v) as DocumentoLegal[]).map((documento) => ({
    usuario_id: a.usuarioId, empresa_id: a.empresaId, documento, versao: v[documento], ip: a.ip, user_agent: a.userAgent,
  }))
  // Zero linhas de volta é normal: a versão já estava aceita (ignoreDuplicates). Erro é só o do banco.
  const { data: gravadas, error } = await db.from('termos_aceites')
    .upsert(linhas, { onConflict: 'usuario_id,documento,versao', ignoreDuplicates: true }).select('id')
  if (!error && nadaGravado(gravadas) && !(await aceitou(db, a.usuarioId, v))) return { error: 'aceite não gravado' }
  return { error: error?.message ?? null }
}

/** O usuário já aceitou as versões vigentes? Sem versões configuradas, sempre sim. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aceitouVigentes(db: SupabaseClient<any>, usuarioId: string): Promise<boolean> {
  const v = versoesVigentes()
  return v ? aceitou(db, usuarioId, v) : true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aceitou(db: SupabaseClient<any>, usuarioId: string, v: Record<DocumentoLegal, string>): Promise<boolean> {
  const { data } = await db.from('termos_aceites').select('documento, versao').eq('usuario_id', usuarioId)
  const feitos = new Set(((data ?? []) as { documento: string; versao: string }[]).map((r) => `${r.documento}:${r.versao}`))
  return (Object.keys(v) as DocumentoLegal[]).every((d) => feitos.has(`${d}:${v[d]}`))
}

/** IP e navegador de quem aceita (cabeçalhos da Vercel). */
export function origemDaRequisicao(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  return { ip, userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null }
}

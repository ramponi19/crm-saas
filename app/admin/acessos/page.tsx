import { requireEmpresaRole } from '@/lib/owner'
import { createClient } from '@/lib/supabase/server'
import { AcessosView, type SessaoAcesso, type ResumoUsuario } from './acessos-view'

export const metadata = { title: 'Uso da equipe' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function AcessosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  // Registro de ponto é assunto de quem administra: vendedor não vê horário do
  // colega. A RLS da tabela também exige admin — esta é a segunda camada.
  const { empresaId } = await requireEmpresaRole(['owner', 'admin'])
  const supabase = await createClient()

  const sp = await searchParams
  const dias = Math.min(90, Math.max(1, Number(sp.dias) || 14))
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [{ data: linhas }, { data: membros }] = await Promise.all([
    supabase.from('acessos')
      .select('id, usuario_id, entrada, ultimo_sinal, saida, fim_por, usuarios!usuario_id(nome)')
      .eq('empresa_id', empresaId).gte('entrada', desde)
      .order('entrada', { ascending: false }).limit(500),
    supabase.from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(nome, ultimo_acesso)')
      .eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type LinhaRow = {
    id: number; usuario_id: string; entrada: string; ultimo_sinal: string
    saida: string | null; fim_por: string | null; usuarios: Embed<{ nome: string | null }>
  }

  const sessoes: SessaoAcesso[] = ((linhas ?? []) as unknown as LinhaRow[]).map((l) => {
    // Sem saída explícita, o fim é o último sinal: a pessoa fechou a aba. Sem
    // isso a maioria das sessões ficaria "em aberto" e a duração seria inútil.
    const fim = l.saida ?? l.ultimo_sinal
    const aberta = !l.saida && Date.now() - new Date(l.ultimo_sinal).getTime() < 10 * 60_000
    return {
      id: l.id,
      usuario: one(l.usuarios)?.nome ?? '—',
      entrada: l.entrada,
      fim,
      minutos: Math.max(1, Math.round((new Date(fim).getTime() - new Date(l.entrada).getTime()) / 60000)),
      aberta,
      comoTerminou: aberta ? 'aberta' : (l.fim_por === 'logout' ? 'saiu' : 'fechou a aba'),
    }
  })

  type MembroRow = { usuario_id: string; role: string | null; usuarios: Embed<{ nome: string | null; ultimo_acesso: string | null }> }
  const resumo: ResumoUsuario[] = ((membros ?? []) as unknown as MembroRow[]).map((m) => {
    const u = one(m.usuarios)
    const minhas = sessoes.filter((s) => s.usuario === (u?.nome ?? '—'))
    return {
      nome: u?.nome ?? '—',
      papel: m.role ?? '',
      ultimoAcesso: u?.ultimo_acesso ?? null,
      sessoes: minhas.length,
      minutos: minhas.reduce((soma, s) => soma + s.minutos, 0),
    }
  }).sort((a, b) => b.minutos - a.minutos)

  return <AcessosView sessoes={sessoes} resumo={resumo} dias={dias} />
}

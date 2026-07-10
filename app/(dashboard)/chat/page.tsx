import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { ChatView, type Membro, type MsgInicial } from './chat-view'

export const metadata = { title: 'Chat' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function ChatPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: membrosRaw }, { data: mural }] = await Promise.all([
    supabase.from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('mensagens_internas')
      .select('id, autor_id, conteudo, created_at')
      .eq('empresa_id', empresaId).eq('tipo', 'mural')
      .order('created_at', { ascending: true }).limit(100),
  ])

  type MembroRow = { usuario_id: string; role: string | null; usuarios: Embed<{ nome: string | null }> }
  const membros: Membro[] = ((membrosRaw ?? []) as unknown as MembroRow[])
    .map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—', role: m.role ?? '' }))

  return (
    <ChatView
      empresaId={empresaId!}
      meuId={user!.id}
      membros={membros}
      muralInicial={(mural ?? []) as MsgInicial[]}
    />
  )
}

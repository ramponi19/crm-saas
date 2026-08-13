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
    /**
     * As 100 mensagens MAIS RECENTES — e não as 100 primeiras.
     *
     * Com `ascending: true` + `limit(100)`, o banco devolve o COMEÇO do mural.
     * Enquanto houver menos de 100 recados dá na mesma; passando disso, a equipe
     * veria para sempre as mensagens mais antigas e nunca as de hoje — e o mural
     * pareceria congelado sem nenhum erro na tela. Busca em ordem decrescente e
     * inverte para exibir.
     */
    supabase.from('mensagens_internas')
      .select('id, autor_id, conteudo, created_at')
      .eq('empresa_id', empresaId).eq('tipo', 'mural')
      .order('created_at', { ascending: false }).limit(100),
  ])

  type MembroRow = { usuario_id: string; role: string | null; usuarios: Embed<{ nome: string | null }> }
  const membros: Membro[] = ((membrosRaw ?? []) as unknown as MembroRow[])
    .map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—', role: m.role ?? '' }))

  return (
    <ChatView
      empresaId={empresaId!}
      meuId={user!.id}
      membros={membros}
      // Veio do mais novo para o mais antigo (ver a consulta): inverte para a
      // conversa ser lida de cima para baixo, como qualquer chat.
      muralInicial={[...((mural ?? []) as MsgInicial[])].reverse()}
    />
  )
}

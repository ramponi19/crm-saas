import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

/**
 * Registro de uso do CRM: abre a sessão, mantém o pulso e fecha no logout.
 *
 * DUAS DECISÕES QUE FAZEM O RELATÓRIO SER LEGÍVEL:
 *
 * 1. RECARGA E ABA NOVA NÃO ABREM SESSÃO. Se cada carga de página criasse uma
 *    linha, um dia normal de trabalho viraria 80 registros de 2 minutos e o dono
 *    não conseguiria responder "ele trabalhou hoje?". Sinal recente reaproveita a
 *    sessão aberta.
 *
 * 2. A SAÍDA NÃO DEPENDE DO BOTÃO "SAIR". Quase ninguém clica — fecha a aba. Por
 *    isso o pulso: o fim da sessão vale como o último sinal, e a tela mostra se
 *    foi saída explícita ou abandono.
 */

/** Janela para considerar a sessão a mesma. Acima disso, é volta de intervalo. */
const JANELA_MIN = 30

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { acao } = (await req.json().catch(() => ({}))) as { acao?: string }
  if (!['abrir', 'sinal', 'fechar'].includes(acao ?? '')) {
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  }

  const agora = new Date().toISOString()

  // Sessão aberta mais recente deste usuário.
  const { data: aberta } = await supabase
    .from('acessos')
    .select('id, ultimo_sinal')
    .eq('empresa_id', empresaId).eq('usuario_id', user.id).is('saida', null)
    .order('entrada', { ascending: false }).limit(1).maybeSingle()

  if (acao === 'fechar') {
    if (aberta) {
      await supabase.from('acessos')
        .update({ saida: agora, ultimo_sinal: agora, fim_por: 'logout' } as never)
        .eq('id', aberta.id)
    }
    return NextResponse.json({ ok: true })
  }

  const recente = aberta
    && Date.now() - new Date(aberta.ultimo_sinal).getTime() < JANELA_MIN * 60_000

  if (recente) {
    await supabase.from('acessos').update({ ultimo_sinal: agora } as never).eq('id', aberta!.id)
  } else {
    // Fecha a anterior pelo último sinal (aba fechada) antes de abrir outra, para
    // não deixar duas sessões abertas do mesmo usuário.
    if (aberta) {
      await supabase.from('acessos')
        .update({ saida: aberta.ultimo_sinal, fim_por: 'inatividade' } as never)
        .eq('id', aberta.id)
    }
    await supabase.from('acessos').insert({
      empresa_id: empresaId, usuario_id: user.id, entrada: agora, ultimo_sinal: agora,
    } as never)
  }

  // Alimenta `usuarios.ultimo_acesso`: a coluna já existia e a tela de Equipe já
  // mostrava "Último acesso" — só que ninguém escrevia nela, então vivia vazia.
  //
  // O ERRO É REGISTRADO. Esta escrita ficou falhando por dias com "permission
  // denied" (faltava GRANT na coluna) e ninguém soube, porque o resultado era
  // descartado: a tela dizia "nunca entrou" com 19 acessos gravados ao lado.
  // Falha aqui não pode derrubar a resposta — mas também não pode ser invisível.
  const { error: erroAcesso } = await supabase
    .from('usuarios').update({ ultimo_acesso: agora } as never).eq('id', user.id)
  if (erroAcesso) console.error('[api/acesso] ultimo_acesso não gravado:', erroAcesso.message)

  return NextResponse.json({ ok: true })
}

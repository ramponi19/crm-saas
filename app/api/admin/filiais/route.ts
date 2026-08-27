import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { CAMPOS_FILIAL, type FilialForm } from '@/lib/filiais'

/**
 * Cadastro de filiais — só dono e admin.
 *
 * A RLS já barra escrita de quem não é admin (`filiais_escrita`), então esta rota
 * não é a única defesa: ela existe para as regras que a RLS não sabe expressar —
 * matriz única, matriz que não se desativa, e a troca de matriz em uma operação só.
 */

interface Corpo {
  acao?: 'criar' | 'atualizar' | 'desativar' | 'reativar' | 'definir_matriz'
  id?: number
  dados?: Partial<FilialForm>
}

const limpar = (dados: Partial<FilialForm>): Partial<FilialForm> => {
  const saida: Record<string, string | null> = {}
  for (const campo of CAMPOS_FILIAL) {
    if (!(campo in dados)) continue
    const v = dados[campo]
    saida[campo] = typeof v === 'string' && v.trim() ? v.trim() : null
  }
  return saida as Partial<FilialForm>
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId } = auth

  const b = (await req.json().catch(() => ({}))) as Corpo
  const svc = createServiceClient()

  /** Confere que a loja é DESTA empresa antes de qualquer ação sobre ela. */
  async function daEmpresa(id: number) {
    const { data } = await svc.from('filiais')
      .select('id, nome, matriz, ativo').eq('id', id).eq('empresa_id', empresaId).maybeSingle()
    return data
  }

  if (b.acao === 'criar') {
    const dados = limpar(b.dados ?? {})
    if (!dados.nome) return NextResponse.json({ error: 'Dê um nome à loja' }, { status: 400 })

    const { data, error } = await svc.from('filiais')
      .insert({ ...dados, nome: dados.nome, empresa_id: empresaId } as never)
      .select('id').single<{ id: number }>()

    if (error) {
      // 23505 = índice único. O único que a tela pode disparar é o de nome repetido.
      return NextResponse.json({
        error: error.code === '23505'
          ? 'Já existe uma loja com esse nome. Dois nomes iguais tornam o seletor do topo inútil.'
          : error.message,
      }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: data.id })
  }

  if (!b.id) return NextResponse.json({ error: 'Loja não informada' }, { status: 400 })
  const alvo = await daEmpresa(b.id)
  if (!alvo) return NextResponse.json({ error: 'Loja não encontrada nesta empresa' }, { status: 404 })

  if (b.acao === 'atualizar') {
    const dados = limpar(b.dados ?? {})
    if ('nome' in dados && !dados.nome) {
      return NextResponse.json({ error: 'A loja precisa de um nome' }, { status: 400 })
    }
    const { error } = await svc.from('filiais')
      .update({ ...dados, updated_at: new Date().toISOString() } as never).eq('id', b.id)
    if (error) {
      return NextResponse.json({
        error: error.code === '23505' ? 'Já existe uma loja com esse nome.' : error.message,
      }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (b.acao === 'desativar') {
    /**
     * A MATRIZ NÃO SE DESATIVA.
     *
     * Ela é o destino declarado de tudo que chega sem loja: lead de webhook, cron,
     * importação. Sem matriz ativa, `filial_gravacao()` cai no último recurso
     * ("qualquer loja ativa") e o lead do Contact2Sale passaria a nascer numa loja
     * escolhida por ordem de id — que é o tipo de comportamento que ninguém
     * consegue explicar depois. Para trocar, define a outra como matriz primeiro.
     */
    if (alvo.matriz) {
      return NextResponse.json({
        error: 'Esta é a loja principal e não pode ser desativada. Defina outra como principal primeiro.',
      }, { status: 400 })
    }

    /**
     * Desativar não apaga: os registros da loja continuam existindo e ligados a ela.
     * Apagar a loja levaria `filial_id` a nulo (ON DELETE SET NULL) e o histórico de
     * vendas dela viraria "sem loja". Por isso não existe ação de excluir aqui.
     */
    const { error } = await svc.from('filiais')
      .update({ ativo: false, updated_at: new Date().toISOString() } as never).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Quem estava nesta loja fica sem loja, e a tela mostra isso para o dono realocar.
    await svc.from('empresa_usuarios').update({ filial_id: null } as never)
      .eq('empresa_id', empresaId).eq('filial_id', b.id)
    // Ninguém pode ficar com uma loja desativada selecionada no topo.
    await svc.from('usuarios').update({ filial_atual_id: null } as never).eq('filial_atual_id', b.id)
    return NextResponse.json({ ok: true })
  }

  if (b.acao === 'reativar') {
    const { error } = await svc.from('filiais')
      .update({ ativo: true, updated_at: new Date().toISOString() } as never).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (b.acao === 'definir_matriz') {
    if (!alvo.ativo) {
      return NextResponse.json({ error: 'Reative a loja antes de torná-la principal' }, { status: 400 })
    }
    /**
     * Tira de todas e põe na escolhida, nesta ordem.
     *
     * Existe um índice único de uma matriz por empresa: marcar a nova antes de
     * desmarcar a antiga é rejeitado pelo banco. A ordem aqui não é estilo, é o que
     * faz a operação passar.
     */
    const { error: e1 } = await svc.from('filiais')
      .update({ matriz: false } as never).eq('empresa_id', empresaId).eq('matriz', true)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 400 })

    const { error: e2 } = await svc.from('filiais')
      .update({ matriz: true, updated_at: new Date().toISOString() } as never).eq('id', b.id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
}

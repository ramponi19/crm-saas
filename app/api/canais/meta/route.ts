import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { cifrarToken } from '@/lib/canais/crypto'
import {
  trocarCodigoPorToken, inspecionarToken, listarPaginas, assinarPagina,
  metaConfigurada, ehErro,
} from '@/lib/canais/meta'

/**
 * Conecta Instagram e Messenger. Os dois vêm juntos porque autenticam pelo MESMO
 * token de Página: o Messenger fala pela Página, e o Instagram pela conta
 * profissional vinculada a ela.
 *
 * Guarda o token DA PÁGINA, não o do usuário — o do usuário é só a ponte para
 * chegar nele, e morre quando a pessoa sai da sessão.
 *
 * Detalhe que quebra tudo se errado: o webhook do Instagram identifica a origem
 * pelo id da CONTA DO INSTAGRAM, enquanto o do Messenger usa o id da PÁGINA. São
 * dois registros, com identificadores diferentes, apontando para o mesmo token.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId, supabase } = auth

    if (!metaConfigurada()) {
      return NextResponse.json({ error: 'Integração Meta não configurada no servidor.' }, { status: 503 })
    }

    const { code, pageId, redirectUri, token: tokenDireto } = (await req.json()) as {
      code?: string; pageId?: string; redirectUri?: string; token?: string
    }
    if (!code && !tokenDireto) {
      return NextResponse.json({ error: 'Conexão incompleta. Refaça pelo botão Conectar.' }, { status: 400 })
    }

    // Dois caminhos de entrada:
    //  - code: o cliente autorizou pelo fluxo da Meta (autoatendimento);
    //  - token: token de usuário de sistema colado pelo admin. Necessário porque a
    //    Meta PROÍBE o portfólio dono do app de se conectar pelo fluxo de cliente
    //    — então a própria loja do fornecedor só entra por aqui.
    let token: string
    if (tokenDireto) {
      token = tokenDireto.trim()
    } else {
      // O redirect_uri tem de ser o MESMO do diálogo, senão a Meta recusa o código.
      const troca = await trocarCodigoPorToken(code!, redirectUri)
      if (ehErro(troca)) return NextResponse.json({ error: troca.erro }, { status: 502 })
      token = troca.token
    }

    const lista = await listarPaginas(token)
    if (ehErro(lista)) return NextResponse.json({ error: lista.erro }, { status: 502 })
    if (!lista.paginas.length) {
      return NextResponse.json(
        { error: 'Nenhuma Página foi autorizada. Refaça a conexão e marque a Página da sua empresa.' },
        { status: 400 },
      )
    }

    // Se o cliente autorizou várias Páginas, respeita a escolha dele; senão usa a única.
    const pagina = pageId ? lista.paginas.find((p) => p.id === pageId) : lista.paginas[0]
    if (!pagina) return NextResponse.json({ error: 'Página escolhida não está entre as autorizadas.' }, { status: 400 })
    if (!pagina.token) {
      return NextResponse.json(
        { error: 'A Meta não devolveu o token desta Página. Confirme que você é administrador dela.' },
        { status: 502 },
      )
    }

    const validade = await inspecionarToken(pagina.token)
    const v = ehErro(validade) ? null : validade
    const svc = createServiceClient()
    const cifrado = cifrarToken(pagina.token)
    const agora = new Date().toISOString()
    const avisos: string[] = []

    // Assina o webhook da Página — inclui message_echoes, que é o que traz para o
    // CRM a mensagem respondida pelo app do Messenger.
    const assinou = await assinarPagina(pagina.id, pagina.token)
    if (ehErro(assinou)) avisos.push(`Recebimento não ativado: ${assinou.erro}`)

    const linhas: {
      empresa_id: number; tipo: string; external_id: string
      waba_id: string | null; ig_user_id: string | null; nome_exibicao: string | null
      access_token_enc: string; token_expira_em: string | null; data_access_expira_em: string | null
      status: string; ultimo_erro: string | null; ultimo_erro_em: string | null
      coexistencia: boolean; conectado_em: string; updated_at: string
    }[] = [
      {
        empresa_id: empresaId, tipo: 'messenger', external_id: pagina.id,
        waba_id: null, ig_user_id: null, nome_exibicao: pagina.nome,
        access_token_enc: cifrado,
        token_expira_em: v?.expiraEm ?? null, data_access_expira_em: v?.acessoDadosExpiraEm ?? null,
        status: ehErro(assinou) ? 'erro' : 'ativo',
        ultimo_erro: ehErro(assinou) ? assinou.erro : null,
        ultimo_erro_em: ehErro(assinou) ? agora : null,
        coexistencia: false, conectado_em: agora, updated_at: agora,
      },
    ]

    if (pagina.instagram) {
      linhas.push({
        empresa_id: empresaId, tipo: 'instagram',
        // O webhook do IG manda o id da CONTA — é ele que resolve o tenant.
        external_id: pagina.instagram.id,
        waba_id: null, ig_user_id: pagina.instagram.id,
        nome_exibicao: pagina.instagram.username ? `@${pagina.instagram.username}` : pagina.nome,
        access_token_enc: cifrado,
        token_expira_em: v?.expiraEm ?? null, data_access_expira_em: v?.acessoDadosExpiraEm ?? null,
        status: ehErro(assinou) ? 'erro' : 'ativo',
        ultimo_erro: ehErro(assinou) ? assinou.erro : null,
        ultimo_erro_em: ehErro(assinou) ? agora : null,
        coexistencia: false, conectado_em: agora, updated_at: agora,
      })
    } else {
      avisos.push(
        'Nenhuma conta do Instagram está vinculada a esta Página, então só o Messenger foi conectado. ' +
          'Para receber Direct, vincule a conta profissional do Instagram à Página e conecte de novo.',
      )
    }

    /**
     * Canal NOVO nasce na loja selecionada no topo. Em modo Rede nasce da rede
     * (nulo), que e o que vale para todas as lojas.
     *
     * Por que NAO entra no upsert: `onConflict: 'tipo,external_id'` faz do upsert um
     * UPDATE quando o canal ja existe, e a coluna iria junto — uma reconexao apagaria
     * a loja que o dono escolheu na tela. Mesmo estrago que o webhook do C2S causou
     * ao mandar payload parcial. Por isso a loja e gravada DEPOIS, e so no que
     * acabou de nascer.
     *
     * Sem isto, a loja nova precisa marcar "Atende" a mao em cada canal recem
     * conectado — e enquanto nao marcar, o canal dela aparece para a outra loja.
     */
    const [{ data: lojaSel }, { data: jaExistiam }] = await Promise.all([
      supabase.rpc('filial_atual'),
      svc.from('canais_conectados').select('tipo, external_id')
        .in('external_id', linhas.map((l) => l.external_id)),
    ])
    const existia = new Set(((jaExistiam ?? []) as { tipo: string; external_id: string }[])
      .map((e) => e.tipo + ':' + e.external_id))

    const { error } = await svc.from('canais_conectados')
      .upsert(linhas, { onConflict: 'tipo,external_id' })

    if (error) {
      const conflito = error.code === '23505' || /duplicate|unique/i.test(error.message)
      return NextResponse.json(
        { error: conflito ? 'Esta Página já está conectada em outra conta do sistema.' : error.message },
        { status: conflito ? 409 : 500 },
      )
    }

    const loja = lojaSel as number | null
    if (loja != null) {
      for (const l of linhas) {
        if (existia.has(l.tipo + ':' + l.external_id)) continue
        await svc.from('canais_conectados').update({ filial_id: loja })
          .eq('tipo', l.tipo).eq('external_id', l.external_id).eq('empresa_id', empresaId)
      }
    }

    return NextResponse.json({
      success: true,
      pagina: pagina.nome,
      instagram: pagina.instagram?.username ? `@${pagina.instagram.username}` : null,
      // Mais de uma Página autorizada: a UI pergunta qual, em vez de escolher no escuro.
      /**
       * Qual Instagram vem com cada Pagina — o nome da Pagina nao basta.
       *
       * A conta do Instagram que o CRM conecta NAO e a que o lojista marca no
       * dialogo da Meta: e a que esta vinculada a Pagina escolhida
       * (`instagram_business_account`), e uma Pagina tem no maximo uma. O Lucas
       * marcou `jmstore_jaguariuna` tres vezes com a Pagina de Mogi selecionada, e
       * as tres vezes o CRM gravou `jmstore_importados` — corretamente, e sem ter
       * como avisar que a escolha dele nao tinha efeito.
       *
       * O token da Pagina JAMAIS entra aqui: so id, nome e o @ do Instagram.
       */
      outrasPaginas: lista.paginas.length > 1
        ? lista.paginas.map((p) => ({ id: p.id, nome: p.nome, instagram: p.instagram?.username ?? null }))
        : [],
      avisos,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Erro interno' }, { status: 500 })
  }
}

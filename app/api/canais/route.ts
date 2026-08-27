import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { cofreConfigurado } from '@/lib/canais/crypto'
import { metaConfigurada } from '@/lib/canais/meta'
import { configurado as instagramConfigurado } from '@/lib/canais/instagram-login'

// Lista os canais da empresa. Nunca devolve token: a coluna cifrada não é nem
// selecionada aqui, e o banco também não daria permissão de ler.
export async function GET() {
  try {
    const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor'])
    if (auth.error) return auth.error
    const { supabase, empresaId } = auth

    const { data, error } = await supabase
      .from('canais_conectados')
      .select(
        'id, tipo, external_id, waba_id, ig_user_id, nome_exibicao, status, coexistencia, ' +
          'token_expira_em, data_access_expira_em, ultimo_erro, ultimo_erro_em, ' +
          'conectado_em, ultima_msg_em, sync_contatos_em, sync_historico_em, sync_historico_pct, ' +
          'filial_id, via',
      )
      .eq('empresa_id', empresaId)
      // Ordem IMPORTA: a tela mostra um cartão por canal e pegava o primeiro da
      // lista. Com mais de um número no mesmo canal — reconexão que gerou id
      // novo, número de teste antigo, cliente com duas linhas — ela podia
      // escolher justamente o expirado e anunciar "Reconectar" com um número
      // que ninguém usa, enquanto o canal certo estava ativo. Aconteceu em
      // 11/08/2026 com a JM Store. Agora o mais recente vem primeiro, e a tela
      // ainda prefere o ativo entre eles.
      .order('tipo')
      .order('conectado_em', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    /**
     * Lojas da empresa, para a tela dizer a QUEM cada canal atende.
     *
     * A JM cadastrou a segunda loja e a tela mostrou o Instagram, o Messenger e o
     * WhatsApp da primeira, sem explicar por que. Canal sem loja e da REDE e vale
     * para todas — o que esta certo para o Instagram da marca e errado para o
     * telefone de uma loja. A tela precisa dos dois lados para deixar isso claro.
     */
    const { data: filiais } = await supabase
      .from('filiais')
      .select('id, nome, cidade')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('matriz', { ascending: false })
      .order('nome')

    return NextResponse.json({
      canais: data ?? [],
      filiais: filiais ?? [],
      // A UI usa isto para explicar POR QUE o botão de conectar está desativado,
      // em vez de deixar o usuário clicando num botão que nunca funciona.
      pronto: {
        meta: metaConfigurada(),
        cofre: cofreConfigurado(),
        // Conector do Instagram sem Pagina: credenciais PROPRIAS, do app do
        // Instagram, que nao sao as do app do Facebook.
        instagramLogin: instagramConfigurado(),
        configWhatsapp: !!process.env.NEXT_PUBLIC_META_CONFIG_ID_WA,
        configMeta: !!process.env.NEXT_PUBLIC_META_CONFIG_ID_IGMSG,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

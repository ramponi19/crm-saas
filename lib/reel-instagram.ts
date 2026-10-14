/**
 * O REEL QUE O CLIENTE MANDA NO CHAT.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * Quando alguém compartilha um reel na conversa, a Meta manda uma URL de anexo
 * como qualquer outra — mas ela não devolve o vídeo. Devolve **200 com a página
 * HTML do reel**, e o CRM guardava esses 640 kB de HTML como se fosse o arquivo:
 * 44 mensagens que aparecem no chat do vendedor como "documento" que não abre,
 * 31 delas de cliente mandando algo que ninguém conseguiu ver.
 *
 * ══ O QUE SE FAZ COM ISSO ══════════════════════════════════════════════════
 *
 * A página traz tudo que importa em `og:` — quem postou, a legenda e o link.
 * Guardamos só esse texto (uns 200 bytes) e mostramos o reel pelo **embed
 * oficial**, que é público e não pede token.
 *
 * ⚠️ NÃO GUARDE A CAPA (`og:image`). É URL de CDN da Meta e expira em dias —
 * medido: a capa salva em 10/09 já devolvia 403 em 11/09. O embed busca a capa
 * na hora, sempre fresca, e por isso não precisamos de imagem nenhuma.
 *
 * Limites conhecidos: se o autor apagar o reel, o embed some (o texto fica); e
 * post bloqueado por direito autoral mostra a capa sem tocar.
 */

export interface ReelCard {
  /** Código do post — o que monta o embed. Ex.: `Dc8n1zlqVH7`. */
  shortcode: string
  /** @fulano que publicou. */
  autor: string | null
  /** Legenda do post, já sem o prefixo "Fulano on Instagram:". */
  legenda: string | null
  /** Link público do reel. */
  url: string
}

/** Entidades HTML que aparecem em og:title/og:description da Meta. */

/** O embed oficial: público, sem token, e traz capa e vídeo na hora. */
export function urlEmbed(shortcode: string): string {
  return `https://www.instagram.com/reel/${shortcode}/embed/`
}

/** Lê o JSON guardado em `lead_mensagens.conteudo`. Null se não for um cartão. */
export function lerReelCard(conteudo: string): ReelCard | null {
  try {
    const o = JSON.parse(conteudo) as Partial<ReelCard>
    return o && typeof o.shortcode === 'string' && o.shortcode
      ? { shortcode: o.shortcode, autor: o.autor ?? null, legenda: o.legenda ?? null,
          url: o.url ?? `https://www.instagram.com/reel/${o.shortcode}/` }
      : null
  } catch { return null }
}

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
function desescapar(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`property="${prop}"\\s+content="([^"]*)"`, 'i')
  return re.exec(html)?.[1] ? desescapar(re.exec(html)![1]) : null
}

/**
 * Lê o cartão da página de um reel. Null quando o HTML não é de um post
 * (página de erro, login, qualquer outra coisa) — quem chama decide o que fazer.
 */
export function extrairReel(html: string): ReelCard | null {
  const url = meta(html, 'og:url')
  if (!url) return null

  // .../<autor>/reel/<codigo>/ ou .../reel|p|tv/<codigo>/
  const m = /instagram\.com\/(?:([^/]+)\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(url)
  if (!m) return null
  const [, autorNaUrl, shortcode] = m

  const titulo = meta(html, 'og:title') ?? ''
  // og:title vem como: `Fulano on Instagram: "a legenda aqui"`
  const t = /^(.*?)\s+on Instagram:\s*"?([\s\S]*?)"?$/.exec(titulo)
  const autor = t?.[1]?.trim() || autorNaUrl || null
  const legenda = (t?.[2] ?? meta(html, 'og:description') ?? '').trim() || null

  return { shortcode, autor, legenda, url: `https://www.instagram.com/reel/${shortcode}/` }
}

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

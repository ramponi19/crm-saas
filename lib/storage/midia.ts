/**
 * Mídia do chat (bucket privado `chat-midia`).
 *
 * O banco guarda em `lead_mensagens.midia_url` e `leads.foto_url` a URL que o
 * Storage devolvia quando o bucket era público. Ela continua sendo o
 * IDENTIFICADOR do arquivo (retenção, órfãos e transcrição acham o caminho por
 * ela), mas não abre mais nada: o bucket é privado. Para mostrar, a tela troca a
 * URL gravada por `/api/midia?p=<caminho>`, que confere a empresa da sessão e
 * redireciona para uma URL assinada nova de 600 s a cada carregamento — por
 * isso um chat aberto por horas não perde a mídia.
 *
 * URL que não é do bucket (imagem de anúncio no CDN da Meta, foto do Instagram)
 * passa sem mudança.
 */
const MARCA = '/storage/v1/object/public/chat-midia/'

/** Caminho do arquivo dentro do bucket, ou null se a URL não é do chat-midia. */
export function caminhoChatMidia(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(MARCA)
  if (i < 0) return null
  const cru = url.slice(i + MARCA.length).split('?')[0]
  try {
    return decodeURIComponent(cru)
  } catch {
    return cru
  }
}

/** URL que a tela usa para exibir/baixar a mídia. */
export function urlDeMidia(url: string | null | undefined): string | null | undefined {
  const caminho = caminhoChatMidia(url)
  return caminho ? `/api/midia?p=${encodeURIComponent(caminho)}` : url
}

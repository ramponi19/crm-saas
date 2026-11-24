/**
 * LINK DO WHATSAPP COM A MENSAGEM PRONTA (wa.me). docs/design-pos-venda.md §2.5.2.
 *
 * Abre o WhatsApp de quem clica, na conversa do número, com o texto no campo: quem envia é a pessoa
 * (nada sai sozinho). Esse caminho não passa pelo Nexus, então a conversa não fica registrada aqui.
 * Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55. Sem número válido: null (a tela desliga o botão).
 */
export function linkWhatsApp(telefone: string | null | undefined, texto?: string | null): string | null {
  let d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (d.length < 12 || d.length > 15) return null
  const t = (texto ?? '').trim()
  return `https://wa.me/${d}${t ? `?text=${encodeURIComponent(t)}` : ''}`
}

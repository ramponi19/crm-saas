// Categoria e condição do item vendido a partir do pedido do grupo (regras de 23/11/2026).
// Usado por venda-categoria.mjs (147 da 4B) e venda-categoria-antigos.mjs (ganhos antigos): mesmas regras.

// Categorias da JM (estoque_categorias, conferidas em 23/11/2026)
export const CAT = { iphone: 1, ipad: 2, mac: 3, watch: 4, outros: 5, acessorio: 6, perfume: 7 }
export const NOME = { 1: 'iPhone', 2: 'iPad', 3: 'MacBook', 4: 'Apple Watch', 5: 'Outros', 6: 'Acessórios', 7: 'Perfumes' }
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function categoriaDe(t) {
  if (/\biphone\b|\biphone\s?\d{1,2}\b|\bip\s?1[0-9]\b|\b1[1-7]\s?pro\b/.test(t)) return CAT.iphone
  if (/\bipad\b/.test(t)) return CAT.ipad
  if (/\bmac\s?book\b|\bmacbook\b|\bimac\b|\bmac mini\b/.test(t)) return CAT.mac
  if (/\bapple watch\b|\bwatch\b|\bse 2\b.*relogio|\brelogio\b/.test(t)) return CAT.watch
  // Celular e relógio de outra marca: as categorias da JM são "Iphone / Smartphone" e "Apple Watch / Smartwatch".
  if (/\bpoco\b|\bredmi\b|\bxiaomi\b|\bsamsung\b|\bgalaxy\b|\bmotorola\b/.test(t)) return CAT.iphone
  if (/\bgarmin\b|\bvivoactive\b|\bvenu\b|\bamazfit\b/.test(t)) return CAT.watch
  if (/\bperfume|\beau de\b|\bparfum|\bedp\b|\bedt\b|\b\d{2,3}\s?ml\b/.test(t)) return CAT.perfume
  if (/\bairpods?\b|\bcapa|\bcapinha|\bpelicula|\bfonte\b|\bcabo\b|\bcarregador|\bpencil\b|\bmagic mouse\b|\bteclado\b|\bcase\b|\bmagsafe\b|\bairtag\b|\bfone\b|\bpulseira\b/.test(t)) return CAT.acessorio
  return null
}
export const USADO = /semi-?novo|\busad[oa]\b|\bvitrine\b|\bbateria\s*:?\s*\d{2,3}\b|\b\d{2,3}\s*%|\bsaude\s*:?\s*\d{2,3}/
export const NOVO = /\blacrad[oa]\b|\bnovo\b|\bnova\b/

// Só o que descreve o item vendido: modelo, cor e as linhas da mensagem que não são entrada/troca/pagamento.
export function textoDoItem(p) {
  const linhas = String(p.texto_original || '').split(/\r?\n/)
    .filter((l) => !/^\s*(entrada|troca|aparelho|restante|a vista|à vista|credito|crédito|pix|debito|débito|contato|cliente|endere|vendedor|total)/i.test(l))
  return semAcento([p.modelo, p.cor, ...linhas].join(' \n '))
}

export const valorDoPedido = (p) => Number(String(p.total || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0

/** Vários pedidos no mesmo negócio (aparelho + acessório): vale o de maior valor. */
export function classificar(pedidos) {
  const ps = [...pedidos].sort((a, b) => valorDoPedido(b) - valorDoPedido(a))
  const principal = ps[0]
  const t = principal ? textoDoItem(principal) : ''
  const categoria = principal ? categoriaDe(semAcento([principal.modelo, principal.cor].join(' '))) ?? categoriaDe(t) : null
  let condicao = null, fonte = ''
  if (categoria != null) {
    if (USADO.test(t)) { condicao = 'seminovo'; fonte = 'texto: usado/seminovo/bateria' }
    else if (NOVO.test(t)) { condicao = 'novo'; fonte = 'texto: novo/lacrado' }
    else { condicao = 'novo'; fonte = 'sem indicação de usado → novo' }
    // iPhone de geração antiga sem indicação: provavelmente seminovo — marcado para conferir.
    const geracao = Number((/iphone\s*(\d{2})/.exec(t) || [])[1])
    if (categoria === CAT.iphone && fonte.startsWith('sem') && geracao && geracao <= 15) fonte = 'CONFERIR: modelo antigo sem indicação (provável seminovo)'
  }
  return { principal, categoria, condicao, fonte }
}

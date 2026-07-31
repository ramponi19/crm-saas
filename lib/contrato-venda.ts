// Gera e imprime o "Termo de compra e venda" da loja — 100% client-side
// (abre janela de impressão; não envia nada a lugar nenhum: Meta-safe).

export interface ContratoLoja {
  nome: string
  cnpj: string | null
  telefone: string | null
  logoUrl: string | null
}
export interface ContratoComprador {
  nome: string
  cpf_cnpj: string | null
  nacionalidade: string | null
  estado_civil: string | null
  profissao: string | null
  data_nascimento: string | null
  telefone: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
}
export interface ContratoItem {
  descricao: string
  imei: string | null
  valor: number
  /** Garantia deste produto. Ausente = cai no `garantia_dias` do contrato. */
  garantia_dias?: number | null
}
export interface DadosContrato {
  loja: ContratoLoja
  comprador: ContratoComprador
  itens: ContratoItem[]
  total: number
  desconto?: number
  forma_pagamento: string | null
  parcelas?: number | null
  /** Padrão da loja; vale para os itens sem garantia própria. */
  garantia_dias?: number
  vendedor?: string | null
  data?: string // ISO; default: agora
  /**
   * Documento remontado a partir do cadastro ATUAL, não o emitido na venda
   * (vendas anteriores ao contrato salvo). Imprime um aviso — sem ele, a folha
   * passaria por 2ª via fiel podendo divergir do que foi assinado.
   */
  reconstituido?: boolean
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
const ou = (v: string | null | undefined, alt = '____________') => (v && String(v).trim() ? esc(v) : `<span style="color:#94a3b8">${alt}</span>`)

const PGTO: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito',
  link: 'Link de pagamento', boleto: 'Boleto', crediario: 'Crediário',
}

function enderecoLinha(c: ContratoComprador): string {
  const l1 = [c.endereco, c.numero].filter(Boolean).join(', ')
  const l2 = [c.complemento, c.bairro].filter(Boolean).join(' — ')
  const l3 = [c.cidade, c.estado].filter(Boolean).join('/')
  const full = [l1, l2, l3, c.cep ? `CEP ${c.cep}` : ''].filter((s) => s && s.trim()).join(', ')
  return full || ''
}

function dataExtenso(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

export function gerarContratoHTML(d: DadosContrato): string {
  const garantia = d.garantia_dias ?? 90
  const itens = d.itens.filter((i) => i.descricao?.trim())
  // Produtos podem ter garantias diferentes (novo x seminovo). Quando divergem,
  // a tabela ganha uma coluna e a cláusula aponta para ela — uma cláusula única
  // com um número só estaria errada para parte dos itens.
  const garantiaDoItem = (i: ContratoItem) => i.garantia_dias ?? garantia
  const garantiasVariam = new Set(itens.map(garantiaDoItem)).size > 1
  const linhasItens = itens.map((i) => `
    <tr>
      <td>${esc(i.descricao)}</td>
      <td class="num">${i.imei ? esc(i.imei) : '—'}</td>
      ${garantiasVariam ? `<td class="num">${garantiaDoItem(i)} dias</td>` : ''}
      <td class="num">${brl(i.valor)}</td>
    </tr>`).join('')
  const pgto = PGTO[d.forma_pagamento ?? ''] ?? (d.forma_pagamento ?? '—')
  const parcelaTxt = d.parcelas && d.parcelas > 1 ? ` em ${d.parcelas}x` : ''
  const end = enderecoLinha(d.comprador)

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Contrato de compra e venda</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.55; }
  .page { max-width: 720px; margin: 0 auto; padding: 32px 40px; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 6px; }
  header img { height: 44px; width: auto; object-fit: contain; }
  header .loja { font-size: 17px; font-weight: 700; color: #0f172a; }
  header .meta { font-size: 11px; color: #64748b; margin-top: 2px; }
  h1 { font-size: 15px; text-align: center; letter-spacing: .04em; text-transform: uppercase; margin: 20px 0 16px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 18px 0 8px; }
  p { margin: 6px 0; text-align: justify; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; }
  .f { font-size: 11.5px; padding: 2px 0; }
  .f b { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; color: #0f172a; padding: 8px; background: #f8fafc; border-radius: 6px; margin-top: 4px; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; }
  .assinaturas div { border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; font-size: 11px; }
  .local { margin-top: 34px; }
  .aviso { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 8px 10px; font-size: 11px; margin-bottom: 14px; }
  @media print { .page { padding: 16px 24px; } @page { margin: 12mm; } }
</style></head>
<body><div class="page">
  ${d.reconstituido ? `<div class="aviso"><b>Documento reconstituído.</b> Esta venda é anterior ao arquivamento automático de contratos, então esta folha foi remontada a partir do cadastro atual do cliente — pode divergir do contrato originalmente assinado.</div>` : ''}
  <header>
    ${d.loja.logoUrl ? `<img src="${esc(d.loja.logoUrl)}" alt="">` : ''}
    <div>
      <div class="loja">${esc(d.loja.nome)}</div>
      <div class="meta">${[d.loja.cnpj ? `CNPJ ${esc(d.loja.cnpj)}` : '', d.loja.telefone ? `Tel. ${esc(d.loja.telefone)}` : ''].filter(Boolean).join(' · ')}</div>
    </div>
  </header>

  <h1>Contrato de Compra e Venda</h1>

  <h2>Comprador</h2>
  <div class="grid">
    <div class="f"><b>Nome:</b> ${ou(d.comprador.nome)}</div>
    <div class="f"><b>CPF/CNPJ:</b> ${ou(d.comprador.cpf_cnpj)}</div>
    <div class="f"><b>Nacionalidade:</b> ${ou(d.comprador.nacionalidade, 'brasileiro(a)')}</div>
    <div class="f"><b>Estado civil:</b> ${ou(d.comprador.estado_civil)}</div>
    <div class="f"><b>Profissão:</b> ${ou(d.comprador.profissao)}</div>
    <div class="f"><b>Telefone:</b> ${ou(d.comprador.telefone)}</div>
    <div class="f" style="grid-column:1/-1"><b>Endereço:</b> ${ou(end)}</div>
  </div>

  <h2>Objeto</h2>
  <p>Pelo presente instrumento, o(a) <b>${esc(d.loja.nome)}</b> (VENDEDOR) vende ao COMPRADOR acima qualificado o(s) produto(s) descrito(s) abaixo, no estado em que se encontra(m):</p>
  <table>
    <thead><tr><th>Produto</th><th class="num">IMEI / Nº série</th>${garantiasVariam ? '<th class="num">Garantia</th>' : ''}<th class="num">Valor</th></tr></thead>
    <tbody>${linhasItens || `<tr><td colspan="${garantiasVariam ? 4 : 3}">—</td></tr>`}</tbody>
  </table>
  ${d.desconto && d.desconto > 0 ? `<div class="f num"><b>Desconto:</b> − ${brl(d.desconto)}</div>` : ''}
  <div class="total"><span>Total</span><span>${brl(d.total)}</span></div>

  <h2>Pagamento</h2>
  <p>Forma de pagamento: <b>${esc(pgto)}${parcelaTxt}</b>, no valor total de <b>${brl(d.total)}</b>, dando plena e geral quitação com a assinatura deste termo.</p>

  <h2>Garantia</h2>
  <p>${garantiasVariam
      ? 'Cada produto possui a garantia indicada na coluna <b>Garantia</b> da tabela acima'
      : `O produto possui garantia de <b>${garantia} dias</b>`
    } contra defeitos de fabricação, a contar da data desta venda. A garantia não cobre danos causados por mau uso, quedas, contato com líquidos, violação do lacre/assistência não autorizada, ou desgaste natural. Aparelhos seminovos/usados seguem as condições informadas no ato da compra.</p>

  <h2>Disposições gerais</h2>
  <p>O COMPRADOR declara ter conferido e testado o(s) produto(s), aceitando-o(s) nas condições apresentadas. As partes elegem o foro da comarca da loja para dirimir quaisquer dúvidas oriundas deste contrato.</p>

  <p class="local">Local e data: ______________________, ${dataExtenso(d.data)}.</p>

  <div class="assinaturas">
    <div>${esc(d.loja.nome)}<br>(Vendedor)${d.vendedor ? `<br><span style="color:#64748b">${esc(d.vendedor)}</span>` : ''}</div>
    <div>${ou(d.comprador.nome, '&nbsp;')}<br>(Comprador)</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`
}

/**
 * Imprime um documento JÁ EMITIDO (2ª via). É o caminho do Histórico: abre
 * exatamente o HTML arquivado no fechamento da venda, sem remontar nada.
 */
export function imprimirContratoHTML(html: string): boolean {
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

export function imprimirContratoVenda(d: DadosContrato): boolean {
  const html = gerarContratoHTML(d)
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

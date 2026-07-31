// Importa o contrato-molde da loja a partir de um PDF. Roda 100% no NAVEGADOR
// (nenhuma dependência de servidor), dentro de /admin/contrato.
//
// O que faz, por página:
//   1. FUNDO — remove os blocos de texto do PDF e renderiza o que sobra. Dá o
//      layout limpo, sem os campos a preencher aparecendo grudados na imagem.
//   2. TEXTO — reconstrói o texto a partir dos operadores, sabendo a COR de cada
//      trecho. Em contrato-molde, o campo a preencher vem em vermelho; esses
//      trechos ficam destacados e os reconhecíveis já viram {{marcador}}.
//
// Por que não estampar os dados sobre o PDF e pronto: os campos ficam DENTRO de
// parágrafos justificados. Trocar "XXXX" por um endereço real reflui as linhas
// seguintes — em posição fixa, o texto invadiria o vizinho ou deixaria buraco.

import * as pdfjs from 'pdfjs-dist'
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import type { PaginaModelo } from './contrato-modelo'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

/** Vermelho do molde (215,9,9) e vizinhança — tolerante a variação de tom. */
const ehVermelho = (c: [number, number, number]) => c[0] > 0.6 && c[1] < 0.35 && c[2] < 0.35

/** Fundo claro demais → texto preto; escuro → texto claro. */
const LIMITE_ESCURO = 110

interface Run { s: string; vermelho: boolean }

/**
 * Campos de molde que dá para reconhecer com segurança e já virar marcador.
 * Só entram os do COMPRADOR e os da venda — dado da própria loja (CNPJ, sede,
 * representante, banco) fica como texto literal, porque é a loja que escreve.
 */
const SUGESTOES: { teste: RegExp; marcador: string }[] = [
  { teste: /^nome\s+completo$/i, marcador: 'cliente.nome' },
  { teste: /^nacionalidade$/i, marcador: 'cliente.nacionalidade' },
  { teste: /^estado\s+civil$/i, marcador: 'cliente.estado_civil' },
  { teste: /^profiss[ãa]o$/i, marcador: 'cliente.profissao' },
  { teste: /^x{2,}$/i, marcador: 'cliente.cpf' },
  { teste: /^x{4,}$/i, marcador: 'cliente.endereco' },
  { teste: /^x{3,}\s*[–-]\s*x{2}$/i, marcador: 'cliente.cidade' },
]

function sugerir(texto: string): string | null {
  const limpo = texto.trim().replace(/[,.;:]$/, '')
  for (const s of SUGESTOES) if (s.teste.test(limpo)) return s.marcador
  return null
}

const escapar = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

/** Junta trechos vizinhos de mesma cor: o pdf.js parte a frase em vários. */
function fundirRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    const ult = out[out.length - 1]
    if (ult && ult.vermelho === r.vermelho) ult.s += r.s
    else out.push({ ...r })
  }
  return out
}

/**
 * Byte a byte, sem passar por codificação de texto.
 *
 * NÃO usar TextDecoder('latin1'): esse rótulo é windows-1252, que mapeia
 * 0x80–0x9F para outros pontos Unicode. O ciclo ida-e-volta corrompe o content
 * stream (0x93 volta como 0x1C) e o desenho da página se perde. Foi o que fez as
 * imagens desaparecerem: no Node eu usei Buffer.toString('latin1'), que
 * preserva, e no navegador a variante que não preserva.
 */
function bytesParaTexto(b: Uint8Array): string {
  let s = ''
  const PASSO = 8192 // evita estourar a pilha no spread
  for (let i = 0; i < b.length; i += PASSO) s += String.fromCharCode(...b.subarray(i, i + PASSO))
  return s
}

function textoParaBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/** Remove os blocos de texto (BT..ET), inclusive dentro de Form XObjects. */
async function pdfSemTexto(bytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const ctx = pdf.context
  const vistos = new Set<string>()

  const descer = (res: unknown) => {
    if (!(res instanceof PDFDict)) return
    const xo = ctx.lookup(res.get(PDFName.of('XObject')))
    if (!(xo instanceof PDFDict)) return
    for (const [, ref] of xo.entries()) {
      const alvo = ctx.lookup(ref)
      if (alvo instanceof PDFRawStream && String(alvo.dict.get(PDFName.of('Subtype'))) === '/Form') {
        limpar(ref)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const limpar = (ref: any) => {
    const chave = String(ref)
    if (vistos.has(chave)) return
    vistos.add(chave)
    const st = ctx.lookup(ref)
    if (!(st instanceof PDFRawStream)) return

    let bruto = ''
    try { bruto = bytesParaTexto(decodePDFRawStream(st).decode()) } catch { return }
    const limpo = bruto.replace(/\bBT\b[\s\S]*?\bET\b/g, '')
    if (limpo !== bruto) {
      const novo = ctx.flateStream(textoParaBytes(limpo))
      // Preserva /Subtype /Form, /BBox, /Matrix e /Resources do original.
      for (const [k, v] of st.dict.entries()) {
        const nome = k.asString()
        if (nome !== '/Filter' && nome !== '/Length') novo.dict.set(k, v)
      }
      ctx.assign(ref, novo)
    }
    descer(ctx.lookup(st.dict.get(PDFName.of('Resources'))))
  }

  for (const page of pdf.getPages()) {
    const cRef = page.node.get(PDFName.of('Contents'))
    if (cRef) {
      const c = ctx.lookup(cRef)
      if (c instanceof PDFArray) c.asArray().forEach(limpar)
      else limpar(cRef)
    }
    descer(ctx.lookup(page.node.get(PDFName.of('Resources'))))
  }

  return pdf.save({ useObjectStreams: false })
}

interface Linha { y: number; x0: number; x1: number; alt: number; runs: Run[] }
interface Bloco { x0: number; x1: number; y0: number; ultimoY: number; linhas: Linha[]; paragrafos: Linha[][] }

/**
 * Lê uma página: linhas → blocos (colunas) → parágrafos, marcando os trechos
 * vermelhos. Três cuidados que a versão ingênua errava:
 *
 *  - ESPAÇO: o PDF separa palavras por posicionamento, não por caractere. Sem
 *    repor o espaço no vão, sai "importadoeoriginaldalinhaApple".
 *  - COLUNA: uma coluna é definida pela borda direita MÁXIMA. Linha curta (fim
 *    de parágrafo) não abre coluna nova; linha que ALARGA, sim — é assim que a
 *    coluna estreita ao lado da figura se separa do texto de largura cheia.
 *  - PARÁGRAFO: linha não é parágrafo. Agrupa até a linha terminar antes da
 *    borda ou o vão vertical crescer; só então o texto reflui de verdade.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lerPagina(pg: any, W: number): Promise<{ blocos: Bloco[] }> {
  const OPS = pdfjs.OPS
  const ol = await pg.getOperatorList()

  // Onde houve texto vermelho (posição), para cruzar com os trechos extraídos.
  let cor: [number, number, number] = [0, 0, 0]
  let tm: [number, number] | null = null
  const vermelhos: { x: number; y: number; larg: number }[] = []
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = ol.argsArray[i] as any
    if (fn === OPS.setFillRGBColor) cor = [a[0] / 255, a[1] / 255, a[2] / 255]
    else if (fn === OPS.setTextMatrix) tm = [a[4], a[5]]
    else if (fn === OPS.moveText && tm) tm = [tm[0] + a[0], tm[1] + a[1]]
    else if ((fn === OPS.showText || fn === OPS.showSpacedText) && tm && ehVermelho(cor)) {
      const glifos = (fn === OPS.showText ? a[0] : a[0].flat()) ?? []
      const larg = glifos.reduce(
        (s: number, g: unknown) => s + (g && typeof g === 'object' ? ((g as { width?: number }).width ?? 0) / 100 : 0), 0)
      vermelhos.push({ x: tm[0], y: tm[1], larg })
    }
  }
  const temVermelho = (x: number, y: number, w: number) => vermelhos.some((v) =>
    Math.abs(v.y - y) < 3 && x < v.x + Math.max(v.larg, 4) + 2 && v.x < x + w + 2)

  // Linhas, repondo o espaço perdido no vão entre trechos.
  const tc = await pg.getTextContent()
  const mapa = new Map<number, { y: number; trechos: { x: number; w: number; h: number; s: string }[] }>()
  for (const it of tc.items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = it as any
    if (!item.str) continue
    const y = item.transform[5]
    const chave = [...mapa.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
    const l = mapa.get(chave) ?? { y: chave, trechos: [] as { x: number; w: number; h: number; s: string }[] }
    l.trechos.push({ x: item.transform[4], w: item.width ?? 0, h: item.height ?? 10, s: item.str })
    mapa.set(chave, l)
  }

  const linhas: Linha[] = [...mapa.values()].map((l) => {
    l.trechos.sort((a, b) => a.x - b.x)
    const alt = Math.max(...l.trechos.map((t) => t.h), 8)
    const runs: Run[] = []
    let fim: number | null = null
    let txt = ''
    for (const t of l.trechos) {
      if (fim !== null && t.x - fim > alt * 0.22 && !/\s$/.test(txt) && !/^\s/.test(t.s)) {
        runs.push({ s: ' ', vermelho: false }); txt += ' '
      }
      runs.push({ s: t.s, vermelho: temVermelho(t.x, l.y, t.w) })
      txt += t.s
      fim = t.x + t.w
    }
    return { y: l.y, x0: l.trechos[0].x, x1: fim ?? l.trechos[0].x, alt, runs }
  }).filter((l) => l.runs.some((r) => r.s.trim())).sort((a, b) => b.y - a.y)

  // Blocos (colunas).
  const TOL = W * 0.06
  const blocos: Bloco[] = []
  for (const l of linhas) {
    const b = blocos[blocos.length - 1]
    const alinhado = b && l.x0 > b.x0 - TOL && l.x0 < b.x0 + W * 0.10
    const naoAlargou = b && l.x1 <= b.x1 + TOL
    const perto = b && b.ultimoY - l.y < l.alt * 3.2
    if (b && alinhado && naoAlargou && perto) {
      b.linhas.push(l); b.ultimoY = l.y; b.x1 = Math.max(b.x1, l.x1)
    } else {
      blocos.push({ x0: l.x0, x1: l.x1, y0: l.y, ultimoY: l.y, linhas: [l], paragrafos: [] })
    }
  }

  // Título de cláusula sai numa linha mais curta que o corpo, então o passo
  // anterior o deixava em bloco separado — o editor ficava cheio de caixinhas.
  // Junta ao bloco de baixo quando e a mesma coluna e estao encostados.
  for (let i = blocos.length - 2; i >= 0; i--) {
    const a = blocos[i], b = blocos[i + 1]
    const umaLinha = a.linhas.length === 1
    const mesmaColuna = Math.abs(a.x0 - b.x0) < W * 0.04
    const cabeNaColuna = a.x1 <= b.x1 + TOL
    const encostados = a.ultimoY - b.y0 < a.linhas[0].alt * 3.5
    if (umaLinha && mesmaColuna && cabeNaColuna && encostados) {
      b.linhas.unshift(...a.linhas)
      b.y0 = a.y0
      b.x0 = Math.min(a.x0, b.x0)
      b.x1 = Math.max(a.x1, b.x1)
      blocos.splice(i, 1)
    }
  }

  // Parágrafos dentro de cada bloco.
  for (const b of blocos) {
    let atual: Linha[] = []
    for (let i = 0; i < b.linhas.length; i++) {
      const l = b.linhas[i], ant = b.linhas[i - 1]
      const curtaAntes = ant && ant.x1 < b.x1 - b.linhas[0].alt * 1.2
      const vaoGrande = ant && ant.y - l.y > ant.alt * 1.6
      if (atual.length && (curtaAntes || vaoGrande)) { b.paragrafos.push(atual); atual = [] }
      atual.push(l)
    }
    if (atual.length) b.paragrafos.push(atual)
  }

  return { blocos }
}

/** Média de luminância da imagem — decide se a página é escura. */
function luminanciaMedia(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const amostra = ctx.getImageData(0, 0, w, Math.min(h, 400))
  const d = amostra.data
  let soma = 0, n = 0
  for (let i = 0; i < d.length; i += 4 * 37) { // passo esparso: rápido e suficiente
    soma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    n++
  }
  return n ? soma / n : 255
}

export interface PaginaImportada extends PaginaModelo {
  /** Fundo renderizado, pronto para subir ao Storage. */
  fundo: Blob | null
  /** Campos em vermelho que NÃO viraram marcador — o lojista decide. */
  camposNaoMapeados: string[]
}

export interface ResultadoImportacao {
  paginas: PaginaImportada[]
  totalMarcadores: number
  totalNaoMapeados: number
}

/**
 * Converte o PDF em páginas de modelo. `escala` controla a resolução do fundo
 * (2 = ~150dpi em A4, bom para impressão sem estourar o tamanho do arquivo).
 */
export async function importarContratoPDF(
  arquivo: File,
  opts: { escala?: number; onProgresso?: (feito: number, total: number) => void } = {},
): Promise<ResultadoImportacao> {
  const escala = opts.escala ?? 2
  const bytes = await arquivo.arrayBuffer()

  // Dois documentos: o original para o texto, o sem-texto para o fundo.
  const [docOriginal, docFundo] = await Promise.all([
    pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise,
    pdfSemTexto(bytes.slice(0)).then((b) => pdfjs.getDocument({ data: b }).promise),
  ])

  const total = docOriginal.numPages
  const paginas: PaginaImportada[] = []
  let totalMarcadores = 0
  let totalNaoMapeados = 0

  for (let n = 1; n <= total; n++) {
    // ---------- fundo ----------
    const pgFundo = await docFundo.getPage(n)
    const viewport = pgFundo.getViewport({ scale: escala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx2d = canvas.getContext('2d')!
    ctx2d.fillStyle = '#fff'
    ctx2d.fillRect(0, 0, canvas.width, canvas.height)
    await pgFundo.render({ canvasContext: ctx2d, viewport }).promise

    const escuro = luminanciaMedia(ctx2d, canvas.width, canvas.height) < LIMITE_ESCURO
    const fundo = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', 0.88))

    // ---------- texto ----------
    const pg = await docOriginal.getPage(n)
    const [, , W, H] = pg.view
    const { blocos } = await lerPagina(pg, W)

    // ---------- monta os blocos com marcadores ----------
    const naoMapeados: string[] = []
    const blocosHtml = blocos.map((b) => {
      const paras = b.paragrafos.map((p) => {
        // Linhas do mesmo parágrafo viram UM texto corrido: é isso que permite
        // o dado longo refluir dentro da coluna em vez de estourar.
        const runs = fundirRuns(p.flatMap((l, i) => (i ? [{ s: ' ', vermelho: false }, ...l.runs] : l.runs)))
        const corpo = runs.map((r) => {
          if (!r.vermelho) return escapar(r.s)
          const marcador = sugerir(r.s)
          if (marcador) { totalMarcadores++; return `{{${marcador}}}` }
          naoMapeados.push(r.s.trim())
          return `<span class="var">${escapar(r.s)}</span>`
        }).join('')
        return corpo.trim() ? `<p>${corpo.replace(/\s+/g, ' ').trim()}</p>` : ''
      }).filter(Boolean)

      return {
        x: +(b.x0 / W * 100).toFixed(2),
        y: +((H - b.y0 - b.linhas[0].alt) / H * 100).toFixed(2),
        // Um respiro na largura: a medida vem do texto renderizado, e a fonte
        // do navegador não é a do PDF.
        largura: +Math.min(100 - (b.x0 / W * 100), (b.x1 - b.x0) / W * 100 + 2).toFixed(2),
        texto_html: paras.join('\n'),
      }
    }).filter((b) => b.texto_html.trim())

    totalNaoMapeados += naoMapeados.length
    opts.onProgresso?.(n, total)

    paginas.push({
      ordem: n,
      fundo_url: null,
      escuro,
      blocos: blocosHtml,
      fundo,
      camposNaoMapeados: [...new Set(naoMapeados)],
    })
  }

  return { paginas, totalMarcadores, totalNaoMapeados }
}

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
    try { bruto = new TextDecoder('latin1').decode(decodePDFRawStream(st).decode()) } catch { return }
    const limpo = bruto.replace(/\bBT\b[\s\S]*?\bET\b/g, '')
    if (limpo !== bruto) {
      const bytesLimpos = Uint8Array.from(limpo, (ch) => ch.charCodeAt(0) & 0xff)
      const novo = ctx.flateStream(bytesLimpos)
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
    const ol = await pg.getOperatorList()
    const OPS = pdfjs.OPS
    let cor: [number, number, number] = [0, 0, 0]
    let yAtual: number | null = null
    const linhas: Run[][] = []
    let linha: Run[] = []

    const quebrar = (y: number) => {
      if (yAtual !== null && Math.abs(y - yAtual) > 1.5) {
        if (linha.length) linhas.push(linha)
        linha = []
      }
      yAtual = y
    }

    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = ol.argsArray[i] as any
      if (fn === OPS.setFillRGBColor) cor = [a[0] / 255, a[1] / 255, a[2] / 255]
      else if (fn === OPS.setTextMatrix) quebrar(a[5])
      else if (fn === OPS.moveText) { if (a[1] !== 0) quebrar((yAtual ?? 0) + a[1]) }
      else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        const glifos = (fn === OPS.showText ? a[0] : a[0].flat()) ?? []
        const s = glifos
          .map((g: unknown) => (g && typeof g === 'object' ? ((g as { unicode?: string }).unicode ?? '') : ''))
          .join('')
        if (s) linha.push({ s, vermelho: ehVermelho(cor) })
      }
    }
    if (linha.length) linhas.push(linha)

    // ---------- monta o HTML ----------
    const naoMapeados: string[] = []
    const paragrafos = linhas.map((l) => {
      const runs = fundirRuns(l)
      const corpo = runs.map((r) => {
        if (!r.vermelho) return escapar(r.s)
        const marcador = sugerir(r.s)
        if (marcador) { totalMarcadores++; return `{{${marcador}}}` }
        naoMapeados.push(r.s.trim())
        // Fica em vermelho, como no molde, para o lojista ver o que falta.
        return `<span class="var">${escapar(r.s)}</span>`
      }).join('')
      return corpo.trim() ? `<p>${corpo}</p>` : ''
    }).filter(Boolean)

    totalNaoMapeados += naoMapeados.length
    opts.onProgresso?.(n, total)

    paginas.push({
      ordem: n,
      fundo_url: null,
      escuro,
      texto_html: paragrafos.join('\n'),
      fundo,
      camposNaoMapeados: [...new Set(naoMapeados)],
    })
  }

  return { paginas, totalMarcadores, totalNaoMapeados }
}

import { inflateRawSync } from 'node:zlib'

/**
 * LEITOR DE PLANILHA (18/11/2026, importação de contatos): CSV e XLSX, sem dependência nova.
 * Só servidor (usa node:zlib). Devolve o cabeçalho e as linhas como texto — o que cada coluna é, quem diz
 * é o mapeamento da tela (lib/importacao.ts).
 *
 * CSV: separador `;`, `,` ou tab (o que mais aparece na primeira linha — o Excel pt-BR salva com `;`);
 * aspas com "" dentro; UTF-8 (com ou sem BOM) e, se o arquivo não for UTF-8 válido, Windows-1252 (o "CSV"
 * do Excel antigo). XLSX: a primeira aba, com textos compartilhados, texto embutido, número e booleano;
 * número grande vem como inteiro (telefone salvo como número no Excel não vira "1,1999E+10").
 */

export interface Planilha { colunas: string[]; linhas: string[][] }
export class PlanilhaInvalida extends Error {}

export function lerPlanilha(buf: Buffer, nomeArquivo: string): Planilha {
  const ehZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
  if (/\.xlsx$/i.test(nomeArquivo) || ehZip) return organizar(lerXlsx(buf))
  if (/\.xls$/i.test(nomeArquivo)) throw new PlanilhaInvalida('Arquivo .xls (Excel 97-2003) não é lido: salve como .xlsx ou .csv.')
  return organizar(lerCsv(decodificar(buf)))
}

/** Primeira linha não vazia = cabeçalho; tira linhas vazias e espaços nas pontas; iguala o tamanho das linhas. */
function organizar(bruto: string[][]): Planilha {
  const linhas = bruto.map((l) => l.map((c) => (c ?? '').replace(/ /g, ' ').trim())).filter((l) => l.some((c) => c !== ''))
  if (linhas.length === 0) throw new PlanilhaInvalida('A planilha está vazia.')
  const cab = linhas[0]
  const largura = Math.max(...linhas.map((l) => l.length))
  const colunas = Array.from({ length: largura }, (_, i) => cab[i] || `Coluna ${i + 1}`)
  return { colunas, linhas: linhas.slice(1).map((l) => Array.from({ length: largura }, (_, i) => l[i] ?? '')) }
}

// ── CSV ─────────────────────────────────────────────────────────────────────────
function decodificar(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const contar = (ch: string) => primeira.split(ch).length - 1
  const sep = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0]
  const linhas: string[][] = []
  let linha: string[] = [], campo = '', aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"' && campo === '') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); linhas.push(linha); linha = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

// ── XLSX (zip + XML) ────────────────────────────────────────────────────────────
function arquivosDoZip(buf: Buffer): Map<string, () => Buffer> {
  // Fim do diretório central: assinatura 0x06054b50, a até 65 kB do fim.
  let fim = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break }
  }
  if (fim < 0) throw new PlanilhaInvalida('Arquivo .xlsx corrompido (não é um zip).')
  const total = buf.readUInt16LE(fim + 10)
  let p = buf.readUInt32LE(fim + 16)
  const mapa = new Map<string, () => Buffer>()
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new PlanilhaInvalida('Arquivo .xlsx corrompido.')
    const metodo = buf.readUInt16LE(p + 10)
    const tamComp = buf.readUInt32LE(p + 20)
    const lNome = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nome = buf.subarray(p + 46, p + 46 + lNome).toString('utf8')
    mapa.set(nome, () => {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const dados = buf.subarray(ini, ini + tamComp)
      if (metodo === 0) return Buffer.from(dados)
      if (metodo === 8) return inflateRawSync(dados)
      throw new PlanilhaInvalida('Compressão do .xlsx não suportada.')
    })
    p += 46 + lNome + lExtra + lCom
  }
  return mapa
}

const desescapar = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')

/** Junta os <t> de um trecho (texto rico vem picado em vários <r><t>). */
const textos = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1])).join('')

function colunaDaRef(ref: string): number {
  const letras = ref.replace(/\d+$/, '')
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function numeroComoTexto(v: string): string {
  if (!/e/i.test(v)) return v.replace(/\.0+$/, '')
  const n = Number(v)
  return Number.isFinite(n) && Math.abs(n) >= 1 && Number.isInteger(n) ? BigInt(Math.round(n)).toString() : v
}

export function lerXlsx(buf: Buffer): string[][] {
  const zip = arquivosDoZip(buf)
  const ler = (nome: string) => { const f = zip.get(nome); return f ? f().toString('utf8') : null }
  // A primeira aba: workbook.xml → r:id → workbook.xml.rels → caminho.
  let caminho = 'xl/worksheets/sheet1.xml'
  const wb = ler('xl/workbook.xml'), rels = ler('xl/_rels/workbook.xml.rels')
  const rid = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
  if (rid && rels) {
    const alvo = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => m[1]).find((a) => a.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1]
    if (alvo) caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`
  }
  const aba = ler(caminho)
  if (!aba) throw new PlanilhaInvalida('Não achei a primeira aba do .xlsx.')
  const sst = ler('xl/sharedStrings.xml')
  const compartilhados = sst ? [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1])) : []

  const linhas: string[][] = []
  for (const lm of aba.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha: string[] = []
    for (const cm of lm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], corpo = cm[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1]
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valor = ''
      if (tipo === 's') valor = compartilhados[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = textos(corpo)
      else if (tipo === 'b') valor = v === '1' ? 'sim' : 'não'
      else if (tipo === 'str' || tipo === 'e') valor = desescapar(v ?? '')
      else if (v != null) valor = numeroComoTexto(v)
      const col = ref ? colunaDaRef(ref) : linha.length
      linha[col] = valor
    }
    linhas.push(Array.from(linha, (c) => c ?? ''))
  }
  return linhas
}

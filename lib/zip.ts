/**
 * Gerador de ZIP mínimo (método STORE, sem compressão) — sem dependências.
 * Suficiente para empacotar CSVs de exportação LGPD. Constrói local headers +
 * central directory + EOCD conforme APPNOTE do formato ZIP.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  nome: string
  conteudo: string
}

/** Monta um Buffer ZIP (STORE) a partir de arquivos texto. */
export function criarZip(entries: ZipEntry[]): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const nomeBuf = Buffer.from(e.nome, 'utf8')
    const dados = Buffer.from(e.conteudo, 'utf8')
    const crc = crc32(dados)
    const tam = dados.length

    // Local file header (30 bytes + nome)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0) // assinatura
    lh.writeUInt16LE(20, 4)         // versão necessária
    lh.writeUInt16LE(0, 6)          // flags
    lh.writeUInt16LE(0, 8)          // método = STORE
    lh.writeUInt16LE(0, 10)         // hora
    lh.writeUInt16LE(0, 12)         // data
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(tam, 18)       // tamanho comprimido
    lh.writeUInt32LE(tam, 22)       // tamanho original
    lh.writeUInt16LE(nomeBuf.length, 26)
    lh.writeUInt16LE(0, 28)         // extra len
    locais.push(lh, nomeBuf, dados)

    // Central directory header (46 bytes + nome)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0) // assinatura
    ch.writeUInt16LE(20, 4)         // versão de criação
    ch.writeUInt16LE(20, 6)         // versão necessária
    ch.writeUInt16LE(0, 8)          // flags
    ch.writeUInt16LE(0, 10)         // método
    ch.writeUInt16LE(0, 12)         // hora
    ch.writeUInt16LE(0, 14)         // data
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(tam, 20)
    ch.writeUInt32LE(tam, 24)
    ch.writeUInt16LE(nomeBuf.length, 28)
    ch.writeUInt16LE(0, 30)         // extra len
    ch.writeUInt16LE(0, 32)         // comment len
    ch.writeUInt16LE(0, 34)         // disk start
    ch.writeUInt16LE(0, 36)         // internal attrs
    ch.writeUInt32LE(0, 38)         // external attrs
    ch.writeUInt32LE(offset, 42)    // offset do local header
    centrais.push(ch, nomeBuf)

    offset += lh.length + nomeBuf.length + dados.length
  }

  const centralDir = Buffer.concat(centrais)
  const centralOffset = offset

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)                    // disk
  eocd.writeUInt16LE(0, 6)                    // disk com o início do CD
  eocd.writeUInt16LE(entries.length, 8)       // entradas neste disco
  eocd.writeUInt16LE(entries.length, 10)      // total de entradas
  eocd.writeUInt32LE(centralDir.length, 12)   // tamanho do CD
  eocd.writeUInt32LE(centralOffset, 16)       // offset do CD
  eocd.writeUInt16LE(0, 20)                   // comment len

  return Buffer.concat([...locais, centralDir, eocd])
}

/** Converte uma lista de objetos em CSV (separador ';', BOM UTF-8 para Excel). */
export function linhasParaCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '﻿'
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.join(';')
  const linhas = rows.map(r => cols.map(c => esc(r[c])).join(';'))
  return '﻿' + [header, ...linhas].join('\n')
}

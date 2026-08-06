/**
 * Exporta e importa a tabela de preços em CSV, para alteração em massa no Excel.
 *
 * Decisões que fazem o ida-e-volta funcionar de verdade em máquina brasileira:
 *
 * - Separador `;`. O Excel em pt-BR abre CSV com vírgula tudo numa coluna só —
 *   o arquivo até sai certo, mas quem for editar recebe uma coluna gigante.
 * - Preço com vírgula decimal ("1.234,56"). É o que o Excel pt-BR escreve de
 *   volta ao salvar; exportar com ponto faria o valor voltar quebrado.
 * - Coluna `id`. É o que diz ao import se a linha é atualização ou cadastro
 *   novo — sem ela, mudar o nome de um modelo criaria uma linha duplicada em
 *   vez de renomear.
 *
 * O import NUNCA apaga: linha que existe no banco e não está no arquivo fica
 * como está. Apagar por ausência transformaria um recorte de planilha (ou um
 * filtro esquecido no Excel) em perda silenciosa da tabela inteira.
 */

export interface PrecoCSV {
  id: number | null
  modelo: string
  armazenamento: string | null
  condicao: string
  preco_sugerido: number
  observacoes: string | null
}

export const CONDICOES_VALIDAS = ['novo', 'seminovo', 'usado'] as const

const CABECALHO = ['id', 'modelo', 'armazenamento', 'condicao', 'preco_sugerido', 'observacoes']

/** Formata em pt-BR: 1234.5 → "1.234,50". */
function precoBR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Aceita "1.234,56" (pt-BR), "1234.56" (banco/inglês) e "1234".
 * A regra: se tem vírgula, ela é o decimal e o ponto é separador de milhar.
 */
export function lerPreco(txt: string): number | null {
  const s = (txt ?? '').trim().replace(/\s|R\$/gi, '')
  if (!s) return null
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

function celula(v: string | number | null): string {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportarCSV(linhas: PrecoCSV[]): string {
  const corpo = linhas.map((l) => [
    l.id ?? '', l.modelo, l.armazenamento ?? '', l.condicao, precoBR(l.preco_sugerido), l.observacoes ?? '',
  ].map(celula).join(';'))
  // BOM para o Excel reconhecer UTF-8 e não estragar os acentos.
  return '﻿' + [CABECALHO.join(';'), ...corpo].join('\r\n')
}

/** Divide uma linha respeitando aspas (campo com o separador dentro). */
function partirLinha(linha: string, sep: string): string[] {
  const out: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      // Aspas dobradas dentro de campo entre aspas = uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++ }
      else dentroDeAspas = !dentroDeAspas
    } else if (c === sep && !dentroDeAspas) { out.push(atual); atual = '' }
    else atual += c
  }
  out.push(atual)
  return out.map((s) => s.trim())
}

export interface LinhaImportada { linha: number; dados: PrecoCSV }
export interface ErroImport { linha: number; motivo: string }
export interface ResultadoLeitura {
  linhas: LinhaImportada[]
  erros: ErroImport[]
}

/**
 * Lê o CSV e valida linha a linha. Linha inválida NÃO derruba o arquivo: entra
 * em `erros` com o número da linha, e o resto segue. Recusar tudo por causa de
 * uma célula obrigaria a pessoa a achar o erro no escuro.
 */
export function lerCSV(texto: string): ResultadoLeitura {
  const limpo = texto.replace(/^﻿/, '')
  const linhasBrutas = limpo.split(/\r?\n/).filter((l) => l.trim())
  if (!linhasBrutas.length) return { linhas: [], erros: [{ linha: 0, motivo: 'Arquivo vazio' }] }

  // Detecta o separador pelo cabeçalho: aceita o que o Excel gerar.
  const sep = (linhasBrutas[0].match(/;/g)?.length ?? 0) >= (linhasBrutas[0].match(/,/g)?.length ?? 0) ? ';' : ','

  const cab = partirLinha(linhasBrutas[0], sep).map((c) => c.toLowerCase().replace(/\s/g, '_'))
  const col = (nome: string) => cab.indexOf(nome)
  const iModelo = col('modelo')
  const iPreco = cab.findIndex((c) => c === 'preco_sugerido' || c === 'preço_sugerido' || c === 'preco' || c === 'preço')
  if (iModelo < 0 || iPreco < 0) {
    return { linhas: [], erros: [{ linha: 1, motivo: 'Cabeçalho sem as colunas "modelo" e "preco_sugerido". Exporte a tabela para ver o formato.' }] }
  }
  const iId = col('id'), iArm = col('armazenamento'), iCond = col('condicao') >= 0 ? col('condicao') : col('condição'), iObs = col('observacoes') >= 0 ? col('observacoes') : col('observações')

  const linhas: LinhaImportada[] = []
  const erros: ErroImport[] = []

  for (let i = 1; i < linhasBrutas.length; i++) {
    const numero = i + 1 // como o Excel numera
    const campos = partirLinha(linhasBrutas[i], sep)
    const modelo = (campos[iModelo] ?? '').trim()
    if (!modelo) { erros.push({ linha: numero, motivo: 'Modelo vazio' }); continue }

    const preco = lerPreco(campos[iPreco] ?? '')
    if (preco == null) { erros.push({ linha: numero, motivo: `Preço inválido: "${campos[iPreco] ?? ''}"` }); continue }
    if (preco <= 0) { erros.push({ linha: numero, motivo: 'Preço precisa ser maior que zero' }); continue }

    const condBruta = (iCond >= 0 ? campos[iCond] ?? '' : '').trim().toLowerCase()
    const condicao = condBruta || 'novo'
    if (!CONDICOES_VALIDAS.includes(condicao as typeof CONDICOES_VALIDAS[number])) {
      erros.push({ linha: numero, motivo: `Condição "${condBruta}" não existe (use: ${CONDICOES_VALIDAS.join(', ')})` })
      continue
    }

    const idBruto = iId >= 0 ? (campos[iId] ?? '').trim() : ''
    const id = idBruto ? Number(idBruto) : null
    if (idBruto && !Number.isFinite(id)) { erros.push({ linha: numero, motivo: `id inválido: "${idBruto}"` }); continue }

    linhas.push({
      linha: numero,
      dados: {
        id,
        modelo,
        armazenamento: (iArm >= 0 ? campos[iArm] ?? '' : '').trim() || null,
        condicao,
        preco_sugerido: preco,
        observacoes: (iObs >= 0 ? campos[iObs] ?? '' : '').trim() || null,
      },
    })
  }

  return { linhas, erros }
}
